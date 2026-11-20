import { createHmac, timingSafeEqual } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

// Send the finished PDF to HR through the Telegram Bot API. The token never reaches the browser.
async function sendTo({ token, chatId, pdf, filename, position }) {
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', `Новая анкета: ${position}`);
  form.append('document', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), filename);
  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(25000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.ok !== true) throw new Error('telegram_send_failed');
}

// Every HR chat gets its own copy. The candidate sees success when at least one HR received it;
// a chat that failed (for example, that person has not pressed Start) is only logged, without its id.
export async function sendResume({ token, chatIds, chatId, pdf, filename, position }) {
  const chats = chatIds?.length ? chatIds : [chatId];
  const results = await Promise.allSettled(chats.map(chat => sendTo({ token, chatId: chat, pdf, filename, position })));
  const failed = results.filter(result => result.status === 'rejected').length;
  if (failed) console.error(`[career] telegram: ${failed} of ${chats.length} HR chats did not receive the resume`);
  if (failed === chats.length) throw new Error('telegram_send_failed');
  return true;
}

async function telegramJson(token, method, body, timeout = 20000) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout)
  });
  const payload = await response.json().catch(() => null);
  if (payload?.ok === true && response.ok) return payload.result;
  // Telegram returns this for a repeated edit after a lost response.
  if (method === 'editMessageReplyMarkup' && payload?.description?.startsWith('Bad Request: message is not modified')) return;
  throw new Error('telegram_send_failed');
}

// Return the message IDs for chats that received the complaint; partial delivery still succeeds.
export async function sendText({ token, chatIds, text, parseMode }) {
  const results = await Promise.allSettled(chatIds.map(async chatId => {
    const message = await telegramJson(token, 'sendMessage', {
      chat_id: chatId, text, parse_mode: parseMode, disable_web_page_preview: true
    });
    return { chatId, messageId: message?.message_id };
  }));
  const failed = results.filter(result => result.status === 'rejected').length;
  if (failed) console.error(`[feedback] telegram: ${failed} of ${chatIds.length} chats did not receive the message`);
  if (failed === chatIds.length) throw new Error('telegram_send_failed');
  return results.filter(result => result.status === 'fulfilled').map(result => result.value);
}

const STATUS_LABELS = ['Новая', 'В работе', 'Решено'];
const STATUS_STYLES = [undefined, 'primary', 'success'];
const MESSAGE_ID = /^[1-9]\d{0,9}$/;

function feedbackPrivateChats(chatIds) {
  return [...new Set(chatIds)].sort();
}

export function supportsFeedbackStatus(chatIds) {
  const chats = feedbackPrivateChats(chatIds);
  return chats.length > 0 && chats.length <= 2 && chats.every(chat => /^[1-9]\d{0,15}$/.test(chat));
}

function statusSignature(token, chats, body) {
  return createHmac('sha256', token).update(`feedback-status\n${chats.join(',')}\n${body}`).digest('base64url').slice(0, 16);
}

function statusKeyboard(token, chats, messageIds, { status, version }) {
  return {
    inline_keyboard: STATUS_LABELS.map((label, target) => {
      const body = `f2:${version}:${status}:${target}:${messageIds.join(':')}`;
      return [{
        text: target === status ? `✓ ${label}` : label,
        style: target === status ? STATUS_STYLES[status] : undefined,
        callback_data: `${body}:${statusSignature(token, chats, body)}`
      }];
    })
  };
}

async function updateCopies(token, chats, ids, state) {
  const replyMarkup = statusKeyboard(token, chats, ids, state);
  const copies = chats.flatMap((chat, index) => ids[index] ? [{ chat, id: ids[index] }] : []);
  const updates = await Promise.allSettled(copies.map(({ chat, id }) => telegramJson(token, 'editMessageReplyMarkup', {
    chat_id: chat, message_id: id, reply_markup: replyMarkup
  }, 6000)));
  const changed = updates.filter(update => update.status === 'fulfilled').length;
  if (changed < copies.length) console.error('[feedback] could not update a status button in every chat');
  return { changed, total: copies.length };
}

export async function sendFeedback({ token, chatIds, text }) {
  const chats = feedbackPrivateChats(chatIds);
  const copies = await sendText({ token, chatIds: chats, text, parseMode: 'HTML' });
  if (!supportsFeedbackStatus(chats)) return { delivered: copies.length, buttons: 0 };
  const ids = chats.map(chat => {
    const messageId = copies.find(copy => copy.chatId === chat)?.messageId;
    return MESSAGE_ID.test(String(messageId)) ? Number(messageId) : 0;
  });
  const initial = { status: 0, version: 0 };
  const buttons = ids.some(Boolean) ? (await updateCopies(token, chats, ids, initial)).changed : 0;
  return { delivered: copies.length, buttons };
}

// State travels in a signed keyboard, so both copies can be updated after a service restart.
export function createFeedbackStatusHandler({ token, chatIds }) {
  const chats = feedbackPrivateChats(chatIds);
  const recent = new Map();
  return async callback => {
    const data = callback?.data;
    const source = callback?.message;
    const chat = String(source?.chat?.id);
    const index = chats.indexOf(chat);
    if (index < 0 || source.chat.type !== 'private' || String(callback.from?.id) !== chat
        || typeof data !== 'string' || typeof callback.id !== 'string') return;
    const parts = /^(f2:(0|[1-9]\d{0,8}):([0-2]):([0-2]):([0-9:]+)):([A-Za-z0-9_-]{16})$/.exec(data);
    if (!parts) return;
    const [, body, encodedVersion, current, target, encodedIds, signature] = parts;
    const ids = encodedIds.split(':');
    if (ids.length !== chats.length || ids.some(id => id !== '0' && !MESSAGE_ID.test(id))
        || ids[index] !== String(source.message_id)) return;
    const expected = statusSignature(token, chats, body);
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return;

    const displayed = source.reply_markup?.inline_keyboard?.flat();
    const answer = text => telegramJson(token, 'answerCallbackQuery', { callback_query_id: callback.id, text }, 5000);
    if (displayed && !displayed.some(button => button.callback_data === data)) {
      await answer('Обращение уже обновлено.');
      return;
    }

    const version = Number(encodedVersion);
    const status = Number(current);
    const selected = Number(target);
    const previous = recent.get(encodedIds);
    const stale = previous && (version < previous.version || (version === previous.version && status !== previous.status));
    if (!stale && selected === status) {
      await answer(`Текущий статус: ${STATUS_LABELS[status]}`);
      return;
    }
    // Repair a stale copy from a partial edit without applying the old choice.
    const next = stale ? previous : { status: selected, version: version + 1 };
    const { changed, total } = await updateCopies(token, chats, ids.map(Number), next);
    if (changed) {
      recent.delete(encodedIds);
      recent.set(encodedIds, next);
      if (recent.size > 256) recent.delete(recent.keys().next().value);
    }
    await answer(changed === total ? `Текущий статус: ${STATUS_LABELS[next.status]}`
      : changed ? 'Статус обновлён не во всех чатах.' : 'Не удалось обновить статус. Попробуйте ещё раз.');
  };
}

export async function pollFeedbackStatus({ token, chatIds, deadline = Infinity }) {
  if (!supportsFeedbackStatus(chatIds)) return;
  const handle = createFeedbackStatusHandler({ token, chatIds });
  let offset;
  let warned = false;
  while (Date.now() < deadline) {
    const timeout = Math.min(25, Math.max(1, Math.ceil((deadline - Date.now()) / 1000)));
    try {
      const updates = await telegramJson(token, 'getUpdates', { offset, timeout, allowed_updates: ['callback_query'] }, (timeout + 5) * 1000);
      warned = false;
      for (const update of updates) {
        await handle(update.callback_query).catch(() => console.error('[feedback] could not answer a status button'));
        offset = update.update_id + 1;
      }
    } catch {
      if (!warned) console.error('[feedback] could not receive Telegram button updates; retrying');
      warned = true;
      await delay(5000);
    }
  }
}

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

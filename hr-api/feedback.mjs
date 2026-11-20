// Complaints and suggestions: an official one (with name and phone) or an anonymous one (no personal data).
// The text goes to the complaints bot; nothing is stored on the server.
import { ValidationError, cleanText, normalizePhone, normalizeTelegram } from './validation.mjs';

export const FEEDBACK_TOPICS = [
  'Обучение и преподаватель',
  'Администрация и сервис',
  'Оплата и документы',
  'Условия в филиале',
  'Предложение',
  'Другое'
];
const NAME_PATTERN = /^[\p{L}\s'’.-]+$/u;
const COMMON = ['kind', 'topic', 'branch', 'message', 'company'];
const OFFICIAL = [...COMMON, 'name', 'phone', 'telegram', 'consent'];

export function validateFeedback(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('body', 'Неверный запрос');
  if (!['official', 'anonymous'].includes(body.kind)) throw new ValidationError('kind', 'Выберите вид обращения');
  const allowed = new Set(body.kind === 'official' ? OFFICIAL : COMMON);
  // An anonymous complaint must not carry a name or contacts, even if a browser sends them.
  for (const key of Object.keys(body)) if (!allowed.has(key)) throw new ValidationError('body', 'Неверный запрос');
  if (body.company) throw new ValidationError('body', 'Неверный запрос');
  if (!FEEDBACK_TOPICS.includes(body.topic)) throw new ValidationError('topic', 'Выберите тему из списка');
  const branch = body.branch === undefined || body.branch === ''
    ? '' : cleanText(body.branch, { field: 'branch', label: 'Филиал', max: 60, words: 8 });
  const message = cleanText(body.message, { field: 'message', label: 'Текст', min: 20, max: 1500, words: 250 });
  // Spam protection: a real complaint rarely needs links, advertising usually does.
  if ((message.match(/https?:\/\/|www\.|t\.me\//gi) || []).length > 2) throw new ValidationError('message', 'Не больше 2 ссылок');
  const result = { kind: body.kind, topic: body.topic, branch, message };
  if (body.kind === 'official') {
    if (body.consent !== true) throw new ValidationError('consent', 'Нужно согласие на обработку данных');
    result.name = cleanText(body.name, { field: 'name', label: 'Имя', min: 2, max: 60, words: 6, pattern: NAME_PATTERN });
    result.phone = normalizePhone(body.phone);
    result.telegram = normalizeTelegram(body.telegram);
  }
  return result;
}

function escapeTelegramHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function formatFeedback(feedback, date) {
  const official = feedback.kind === 'official';
  const type = official ? 'Официальное обращение' : 'Анонимное обращение';
  const branch = feedback.branch || 'Филиал не указан';
  const sections = [
    `<b>📩 ${escapeTelegramHtml(feedback.topic)}</b>\n<i>${type} · ${escapeTelegramHtml(date)}</i>\n📍 ${escapeTelegramHtml(branch)}`,
    `<blockquote>${escapeTelegramHtml(feedback.message)}</blockquote>`
  ];

  if (official) {
    const channels = [feedback.phone, feedback.telegram].filter(Boolean).map(escapeTelegramHtml).join(' · ');
    sections.push(`<b>Контакты</b>\n${escapeTelegramHtml(feedback.name)}\n${channels}`);
  }

  return sections.join('\n\n');
}

// Complaints and suggestions: an official one (with name and phone) or an anonymous one (no personal data).
// The text goes to the complaints bot as a plain message; nothing is stored on the server.
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

// Plain text (no Markdown/HTML parsing in Telegram), so nothing the visitor typed can change the formatting.
export function formatFeedback(feedback, date) {
  const lines = feedback.kind === 'official'
    ? ['📝 Официальная жалоба', `Дата: ${date}`, `Тема: ${feedback.topic}`, `Филиал: ${feedback.branch || 'не указан'}`,
      `Имя: ${feedback.name}`, `Телефон: ${feedback.phone}`, ...(feedback.telegram ? [`Telegram: ${feedback.telegram}`] : [])]
    : ['🕶 Анонимная жалоба', `Дата: ${date}`, `Тема: ${feedback.topic}`, `Филиал: ${feedback.branch || 'не указан'}`];
  lines.push('', feedback.message);
  if (feedback.kind === 'anonymous') lines.push('', 'Отправитель не указывал имя и контакты; адрес и устройство не передаются.');
  return lines.join('\n');
}

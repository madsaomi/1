// Strict validation for the career form: only known fields, short texts and safe characters.
export const LIMITS = {
  name: { min: 2, max: 60, words: 6 },
  telegram: { max: 32 },
  education: { max: 80, words: 12 },
  certificates: { max: 80, words: 12 },
  about: { min: 20, max: 400, words: 60 }
};

export const POSITIONS = [
  'Преподаватель английского',
  'Преподаватель IELTS',
  'Преподаватель для детей',
  'Преподаватель математики',
  'Администратор',
  'Другое'
];

export const EXPERIENCES = ['Нет опыта', 'До 1 года', '1–3 года', '3–5 лет', 'Больше 5 лет'];
export const LEVELS = ['A1–A2', 'B1', 'B2', 'C1', 'C2', 'IELTS / TOEFL — укажите балл в комментарии'];

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const NAME_PATTERN = /^[\p{L}\s'’.-]+$/u;

export class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.status = 400;
  }
}

export function cleanText(value, { field, min = 0, max, words, label, pattern } = {}) {
  if (typeof value !== 'string') throw new ValidationError(field, `${label}: неверный формат`);
  const clean = value
    .replace(CONTROL, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length < min) throw new ValidationError(field, `${label}: слишком коротко (минимум ${min})`);
  if (clean.length > max) throw new ValidationError(field, `${label}: слишком длинно (максимум ${max})`);
  if (words && clean.split(/\s+/u).filter(Boolean).length > words) throw new ValidationError(field, `${label}: максимум ${words} слов`);
  if (clean && !/\p{L}/u.test(clean)) throw new ValidationError(field, `${label}: введите текст`);
  if (pattern && !pattern.test(clean)) throw new ValidationError(field, `${label}: недопустимые символы`);
  return clean;
}

export function normalizePhone(value) {
  if (typeof value !== 'string') throw new ValidationError('phone', 'Телефон: неверный формат');
  if (!/^\+?[\d\s()-]+$/.test(value)) throw new ValidationError('phone', 'Телефон: допустимы только цифры и знаки форматирования');
  const digits = value.replace(/[^\d]/g, '');
  if (/^998\d{9}$/.test(digits)) return `+${digits}`;
  throw new ValidationError('phone', 'Телефон: нужен номер в формате +998 XX XXX XX XX');
}

export function normalizeTelegram(value) {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string') throw new ValidationError('telegram', 'Telegram: неверный формат');
  const name = value.trim().replace(/^@/, '');
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name)) throw new ValidationError('telegram', 'Telegram: username от 5 до 32 символов, начинается с буквы');
  return `@${name}`;
}

export function validateApplication(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('body', 'Неверный запрос');

  const allowed = new Set(['name', 'phone', 'telegram', 'position', 'experience', 'level', 'education', 'certificates', 'about', 'consent', 'photo', 'company']);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw new ValidationError('body', 'Неверный запрос');
  }

  if (body.company) throw new ValidationError('body', 'Неверный запрос');
  if (body.consent !== true) throw new ValidationError('consent', 'Нужно согласие на обработку данных');

  const name = cleanText(body.name, { field: 'name', label: 'ФИО', ...LIMITS.name, pattern: NAME_PATTERN });
  const phone = normalizePhone(body.phone);
  const telegram = normalizeTelegram(body.telegram);
  if (!POSITIONS.includes(body.position)) throw new ValidationError('position', 'Выберите вакансию из списка');
  if (!EXPERIENCES.includes(body.experience)) throw new ValidationError('experience', 'Выберите опыт из списка');
  if (!LEVELS.includes(body.level)) throw new ValidationError('level', 'Выберите уровень из списка');
  const education = body.education === undefined || body.education === '' ? '' : cleanText(body.education, { field: 'education', label: 'Образование', ...LIMITS.education });
  const certificates = body.certificates === undefined || body.certificates === '' ? '' : cleanText(body.certificates, { field: 'certificates', label: 'Сертификаты', ...LIMITS.certificates });
  const about = cleanText(body.about, { field: 'about', label: 'О себе', ...LIMITS.about });
  if (typeof body.photo !== 'string' || !body.photo.startsWith('data:image/jpeg;base64,')) {
    throw new ValidationError('photo', 'Добавьте фото в формате JPEG');
  }

  return { name, phone, telegram, position: body.position, experience: body.experience, level: body.level, education, certificates, about, photo: body.photo };
}

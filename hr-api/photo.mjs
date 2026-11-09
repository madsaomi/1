import sharp from 'sharp';
import { ValidationError } from './validation.mjs';

const MAX_INPUT_BYTES = 1.4 * 1024 * 1024;
const MAX_INPUT_DIMENSION = 2000;
const MIN_INPUT_DIMENSION = 200;

// Decode the JPEG data URL, verify its real dimensions and re-encode it server-side.
// Re-encoding strips EXIF and any embedded payload, and caps the size stored in the PDF.
export async function sanitizePhoto(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/jpeg;base64,')) {
    throw new ValidationError('photo', 'Фото должно быть JPEG');
  }
  const base64 = dataUrl.slice('data:image/jpeg;base64,'.length);
  if (base64.length * 0.75 > MAX_INPUT_BYTES) throw new ValidationError('photo', 'Файл фото слишком большой');
  let input;
  try {
    input = Buffer.from(base64, 'base64');
  } catch {
    throw new ValidationError('photo', 'Не удалось прочитать фото');
  }
  if (input.length < 100) throw new ValidationError('photo', 'Не удалось прочитать фото');
  if (input[0] !== 0xff || input[1] !== 0xd8 || input[2] !== 0xff) throw new ValidationError('photo', 'Фото должно быть JPEG');

  let metadata;
  try {
    metadata = await sharp(input).metadata();
  } catch {
    throw new ValidationError('photo', 'Не удалось прочитать фото');
  }
  if (metadata.format !== 'jpeg') throw new ValidationError('photo', 'Фото должно быть JPEG');
  const width = Number(metadata.width) || 0;
  const height = Number(metadata.height) || 0;
  if (width < MIN_INPUT_DIMENSION || height < MIN_INPUT_DIMENSION) throw new ValidationError('photo', 'Фото слишком маленькое');
  if (width > MAX_INPUT_DIMENSION || height > MAX_INPUT_DIMENSION) throw new ValidationError('photo', 'Фото слишком большое по размеру');

  let output;
  try {
    output = await sharp(input)
      .rotate()
      .resize(900, 900, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new ValidationError('photo', 'Не удалось обработать фото');
  }
  if (!output.length || output.length > 700 * 1024) throw new ValidationError('photo', 'Фото слишком большое');
  return output;
}

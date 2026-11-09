import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';

const FONT_REGULAR = fileURLToPath(new URL('./assets/fonts/Inter-Regular.ttf', import.meta.url));
const FONT_BOLD = fileURLToPath(new URL('./assets/fonts/Inter-SemiBold.ttf', import.meta.url));

const PAGE = { width: 595.28, height: 841.89, margin: 48 };
const BRAND = '#ffb703';
const INK = '#111111';
const MUTED = '#666666';
const LINE = '#e6e6e6';

// Build a one-file PDF CV. All values are plain strings already sanitized by validation.mjs;
// the photo is a server-re-encoded JPEG. The document is produced in memory and never stored.
export function buildResume(data, photoBuffer) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      info: { Title: 'Анкета кандидата', Author: 'Stanford Language Center', Subject: 'Анкета для работы' }
    });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('Sans', FONT_REGULAR);
    doc.registerFont('SansBold', FONT_BOLD);

    doc.rect(0, 0, PAGE.width, 132).fill(BRAND);
    doc.fillColor(INK).font('SansBold').fontSize(24).text('Stanford', PAGE.margin, 34);
    doc.font('Sans').fontSize(10).fillColor('#070707').text('Language Center', PAGE.margin, 66);
    doc.font('SansBold').fontSize(18).fillColor('#070707').text('Анкета кандидата', PAGE.margin, 94);
    doc.font('Sans').fontSize(9).fillColor('#070707').text(`Дата: ${data.date}`, PAGE.width - PAGE.margin - 160, 40, { width: 160, align: 'right' });

    let contentWidth = PAGE.width - PAGE.margin * 2;
    if (photoBuffer) {
      const photoW = 96;
      const photoH = 116;
      const photoX = PAGE.width - PAGE.margin - photoW;
      doc.save();
      doc.roundedRect(photoX - 4, 148, photoW + 8, photoH + 8, 8).fill('#ffffff').strokeColor(LINE).lineWidth(1).stroke();
      doc.image(photoBuffer, photoX, 152, { fit: [photoW, photoH], align: 'center', valign: 'center' });
      doc.restore();
      contentWidth = PAGE.width - PAGE.margin * 2 - 120;
    }

    let y = 164;
    const ensure = height => {
      if (y + height > PAGE.height - 64) {
        doc.addPage();
        y = PAGE.margin;
      }
    };
    const heading = title => {
      ensure(44);
      doc.font('SansBold').fontSize(10).fillColor(MUTED).text(title.toUpperCase(), PAGE.margin, y, { characterSpacing: 0.8 });
      y += 16;
      doc.moveTo(PAGE.margin, y).lineTo(PAGE.margin + contentWidth, y).strokeColor(LINE).lineWidth(1).stroke();
      y += 12;
    };
    const row = (label, value) => {
      if (!value) return;
      ensure(40);
      doc.font('Sans').fontSize(8).fillColor(MUTED).text(label, PAGE.margin, y);
      y += 11;
      doc.font('Sans').fontSize(11).fillColor(INK).text(value, PAGE.margin, y, { width: contentWidth, lineGap: 2 });
      y += doc.heightOfString(value, { width: contentWidth, lineGap: 2 }) + 10;
    };
    const paragraph = value => {
      ensure(60);
      doc.font('Sans').fontSize(11).fillColor(INK).text(value, PAGE.margin, y, { width: contentWidth, lineGap: 3 });
      y += doc.heightOfString(value, { width: contentWidth, lineGap: 3 }) + 10;
    };

    heading('Контакты');
    row('ФИО', data.name);
    row('Телефон', data.phone);
    row('Telegram', data.telegram || '—');

    heading('Вакансия и опыт');
    row('Вакансия', data.position);
    row('Опыт преподавания', data.experience);
    row('Уровень английского', data.level);
    if (data.education) row('Образование', data.education);
    if (data.certificates) row('Сертификаты', data.certificates);

    heading('О себе');
    paragraph(data.about);

    ensure(40);
    doc.font('Sans').fontSize(8).fillColor(MUTED).text('Анкета отправлена через сайт Stanford Language Center.', PAGE.margin, PAGE.height - 42, { width: contentWidth });

    doc.end();
  });
}

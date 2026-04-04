import { ProgramTemplate, CaseData, ObituaryData, fullName, formatDate, createBifoldDoc, bufferFromDoc, renderOrderOfService, renderPallbearers, renderPhotoPlaceholder, renderFuneralHomeFooter } from '../template-base';

const BABY_BLUE = '#a8d8ea';
const LAVENDER = '#c5b3e6';
const SOFT_WHITE = '#fefefe';
const TEXT = '#4a4a5a';
const MUTED = '#8888aa';

export const childInfant: ProgramTemplate = {
  id: 'child-infant',
  name: 'Child & Infant',
  pageCount: 4,
  culturalContext: ['child', 'infant', 'baby', 'gentle'],
  description: 'Soft pastel design with baby blue, lavender, and white. Stars and gentle imagery with tender language for young lives.',

  async render(c: CaseData, obit: ObituaryData | null): Promise<Buffer> {
    const doc = createBifoldDoc();
    const promise = bufferFromDoc(doc);
    const name = fullName(c);
    const dob = formatDate(c.date_of_birth);
    const dod = formatDate(c.date_of_death);
    const pw = 396;
    const m = 36;
    const cw = pw - m * 2;

    // ── Page 1: Back Cover (left) + Front Cover (right) ──────────────────
    doc.rect(0, 0, pw * 2, 612).fill(SOFT_WHITE);

    // Back Cover
    // Gentle star decorations via text
    doc.font('Helvetica').fontSize(8).fillColor(BABY_BLUE).text('☆  ☆  ☆', m, 35, { width: cw, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(13).fillColor(LAVENDER).text('With Love & Gratitude', m, 55, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(m + cw * 0.3, doc.y).lineTo(m + cw * 0.7, doc.y).strokeColor(BABY_BLUE).lineWidth(1).stroke();
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(
      'The family thanks you from the bottom of their hearts for your love, prayers, and tender support during this most difficult time. Your kindness has been a gentle light in the darkness.',
      m + 10, doc.y, { width: cw - 20, align: 'center', lineGap: 2 }
    );
    doc.moveDown(2);

    doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(
      '"An angel in the book of life wrote down our baby\'s birth,\nthen whispered as she closed the book, too beautiful for earth."',
      m + 15, doc.y, { width: cw - 30, align: 'center', lineGap: 2 }
    );

    doc.moveDown(2);
    renderPallbearers(doc, c, m, cw, LAVENDER);

    doc.font('Helvetica').fontSize(8).fillColor(BABY_BLUE).text('☆  ☆  ☆', m, 540, { width: cw, align: 'center' });
    renderFuneralHomeFooter(doc, m, 555, cw, LAVENDER);

    // Front Cover
    const fx = pw + m;
    doc.rect(pw, 0, pw, 3).fill(BABY_BLUE);
    doc.rect(pw, 3, pw, 2).fill(LAVENDER);
    doc.rect(pw, 607, pw, 2).fill(LAVENDER);
    doc.rect(pw, 609, pw, 3).fill(BABY_BLUE);

    // Stars
    doc.font('Helvetica').fontSize(10).fillColor(LAVENDER).text('★  ☆  ★  ☆  ★', fx, 60, { width: cw, align: 'center' });
    doc.moveDown(1.5);
    doc.font('Helvetica').fontSize(11).fillColor(MUTED).text('In Tender Memory of', fx, doc.y, { width: cw, align: 'center' });
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(26).fillColor(LAVENDER).text(name, fx, doc.y, { width: cw, align: 'center' });
    doc.moveDown(1);
    // Gentle decorative rule
    doc.moveTo(fx + cw / 2 - 30, doc.y).lineTo(fx + cw / 2 + 30, doc.y).strokeColor(BABY_BLUE).lineWidth(1.5).stroke();
    doc.moveDown(1);
    if (dob && dod) {
      doc.font('Helvetica').fontSize(12).fillColor(TEXT).text(`Born: ${dob}`, fx, doc.y, { width: cw, align: 'center' });
      doc.moveDown(0.3);
      doc.text(`Called Home: ${dod}`, fx, doc.y, { width: cw, align: 'center' });
    } else if (dob) {
      doc.font('Helvetica').fontSize(12).fillColor(TEXT).text(`Born: ${dob}`, fx, doc.y, { width: cw, align: 'center' });
    }
    doc.moveDown(2);
    renderPhotoPlaceholder(doc, fx + cw / 2 - 55, doc.y, 110, 130, LAVENDER);

    // Bottom stars
    doc.font('Helvetica').fontSize(10).fillColor(BABY_BLUE).text('☆  ★  ☆  ★  ☆', fx, 560, { width: cw, align: 'center' });

    // ── Page 2: Inside Left (Order of Service) + Inside Right (Obituary) ─
    doc.addPage();
    doc.rect(0, 0, pw * 2, 612).fill(SOFT_WHITE);

    renderOrderOfService(doc, c, m, 40, cw, LAVENDER, BABY_BLUE);

    // Obituary (right panel) — shorter, tender
    const ox = pw + m;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(LAVENDER).text('Our Little Angel', ox, 40, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(ox + cw * 0.3, doc.y).lineTo(ox + cw * 0.7, doc.y).strokeColor(BABY_BLUE).lineWidth(1.5).stroke();
    doc.moveDown(1);
    const text = obit?.full_text || 'A brief life story will appear here once approved by the family.';
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(text, ox + 4, doc.y, { width: cw - 8, lineGap: 2.5 });

    doc.end();
    return promise;
  },
};

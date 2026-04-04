import { ProgramTemplate, CaseData, ObituaryData, fullName, formatDate, createBifoldDoc, bufferFromDoc, renderOrderOfService, renderPallbearers, renderPhotoPlaceholder, renderFuneralHomeFooter } from '../template-base';

const OCEAN = '#006994';
const TROPICAL = '#2d7a3a';
const CORAL_P = '#ff6f61';
const TEXT = '#2d2d2d';
const MUTED = '#5a7a7a';

export const polynesian: ProgramTemplate = {
  id: 'polynesian',
  name: 'Polynesian',
  pageCount: 4,
  culturalContext: ['polynesian', 'hawaiian', 'samoan', 'tongan', 'pacific-islander'],
  description: 'Ocean blue, tropical green, and coral design with wave and ocean motifs. Aloha in header for Pacific Islander families.',

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
    // Back Cover
    // Wave motif: layered horizontal wavy rules
    doc.moveTo(m, 30).bezierCurveTo(m + cw * 0.25, 20, m + cw * 0.5, 40, m + cw * 0.75, 25);
    doc.bezierCurveTo(m + cw * 0.875, 17, m + cw, 35, m + cw, 30).strokeColor(OCEAN).lineWidth(1.5).stroke();
    doc.moveTo(m, 36).bezierCurveTo(m + cw * 0.25, 26, m + cw * 0.5, 46, m + cw * 0.75, 31);
    doc.bezierCurveTo(m + cw * 0.875, 23, m + cw, 41, m + cw, 36).strokeColor(TROPICAL).lineWidth(0.5).stroke();

    doc.font('Helvetica-Bold').fontSize(13).fillColor(OCEAN).text('Acknowledgments', m, 55, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(m + cw * 0.3, doc.y).lineTo(m + cw * 0.7, doc.y).strokeColor(CORAL_P).lineWidth(1.5).stroke();
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(
      'The family extends their deepest aloha and gratitude for your love, prayers, and support. Your presence has been a source of comfort like the ocean tide — constant and sure.',
      m + 10, doc.y, { width: cw - 20, align: 'center', lineGap: 2 }
    );
    doc.moveDown(2);
    renderPallbearers(doc, c, m, cw, OCEAN);

    doc.moveDown(1);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(
      '"The ocean stirs the heart, inspires the imagination, and brings eternal joy to the soul."',
      m + 15, doc.y, { width: cw - 30, align: 'center' }
    );

    // Bottom wave motif
    doc.moveTo(m, 545).bezierCurveTo(m + cw * 0.25, 535, m + cw * 0.5, 555, m + cw * 0.75, 540);
    doc.bezierCurveTo(m + cw * 0.875, 532, m + cw, 550, m + cw, 545).strokeColor(OCEAN).lineWidth(1).stroke();
    renderFuneralHomeFooter(doc, m, 558, cw, OCEAN);

    // Front Cover
    const fx = pw + m;
    doc.rect(pw, 0, pw, 4).fill(OCEAN);
    doc.rect(pw, 4, pw, 2).fill(TROPICAL);

    // Top wave decoration
    doc.moveTo(fx - m, 50).bezierCurveTo(fx + cw * 0.15, 38, fx + cw * 0.35, 58, fx + cw * 0.55, 43);
    doc.bezierCurveTo(fx + cw * 0.75, 30, fx + cw * 0.9, 55, fx + cw + m, 45).strokeColor(OCEAN).lineWidth(2).stroke();
    doc.moveTo(fx - m, 55).bezierCurveTo(fx + cw * 0.15, 43, fx + cw * 0.35, 63, fx + cw * 0.55, 48);
    doc.bezierCurveTo(fx + cw * 0.75, 35, fx + cw * 0.9, 60, fx + cw + m, 50).strokeColor(TROPICAL).lineWidth(0.5).stroke();

    doc.font('Helvetica-Bold').fontSize(16).fillColor(CORAL_P).text('Aloha', fx, 75, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(11).fillColor(MUTED).text('In Loving Memory of', fx, doc.y, { width: cw, align: 'center' });
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(26).fillColor(OCEAN).text(name, fx, doc.y, { width: cw, align: 'center' });
    doc.moveDown(1);
    doc.moveTo(fx + cw / 2 - 40, doc.y).lineTo(fx + cw / 2 + 40, doc.y).strokeColor(CORAL_P).lineWidth(2).stroke();
    doc.moveDown(1);
    if (dob && dod) {
      doc.font('Helvetica').fontSize(12).fillColor(TEXT).text(`${dob}  —  ${dod}`, fx, doc.y, { width: cw, align: 'center' });
    }
    doc.moveDown(2);
    renderPhotoPlaceholder(doc, fx + cw / 2 - 60, doc.y, 120, 150, OCEAN);

    // Bottom wave
    doc.moveTo(fx - m, 570).bezierCurveTo(fx + cw * 0.15, 558, fx + cw * 0.35, 578, fx + cw * 0.55, 563);
    doc.bezierCurveTo(fx + cw * 0.75, 550, fx + cw * 0.9, 575, fx + cw + m, 565).strokeColor(OCEAN).lineWidth(1.5).stroke();

    doc.rect(pw, 606, pw, 2).fill(TROPICAL);
    doc.rect(pw, 608, pw, 4).fill(OCEAN);

    // ── Page 2: Inside Left (Order of Service) + Inside Right (Obituary) ─
    doc.addPage();
    renderOrderOfService(doc, c, m, 40, cw, OCEAN, CORAL_P);

    // Obituary (right panel)
    const ox = pw + m;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(OCEAN).text('Life Story', ox, 40, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(ox + cw * 0.3, doc.y).lineTo(ox + cw * 0.7, doc.y).strokeColor(CORAL_P).lineWidth(1.5).stroke();
    doc.moveDown(1);
    const text = obit?.full_text || 'Obituary text will appear here once approved by the family.';
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(text, ox + 4, doc.y, { width: cw - 8, lineGap: 2.5 });

    doc.end();
    return promise;
  },
};

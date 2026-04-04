import { ProgramTemplate, CaseData, ObituaryData, fullName, formatDate, createBifoldDoc, bufferFromDoc, renderOrderOfService, renderPallbearers, renderPhotoPlaceholder, renderFuneralHomeFooter } from '../template-base';

const SAGE = '#7d9f85';
const BLUSH = '#d4a5a5';
const CREAM = '#faf5ef';
const TEXT = '#4a4a4a';
const MUTED = '#8a7a7a';

export const watercolorFloral: ProgramTemplate = {
  id: 'watercolor-floral',
  name: 'Watercolor Floral',
  pageCount: 4,
  culturalContext: ['general', 'feminine', 'garden'],
  description: 'Soft pastel design with sage green, blush pink, and cream. Delicate and feminine, popular for women.',

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
    // Cream background full page
    doc.rect(0, 0, pw * 2, 612).fill(CREAM);

    // Back Cover
    // Delicate floral rule top
    doc.moveTo(m + 20, 40).lineTo(m + cw - 20, 40).strokeColor(BLUSH).lineWidth(0.5).stroke();
    doc.moveTo(m + 40, 43).lineTo(m + cw - 40, 43).strokeColor(SAGE).lineWidth(0.5).stroke();

    doc.font('Helvetica-Bold').fontSize(13).fillColor(SAGE).text('Acknowledgments', m, 60, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    // Petal-like decorative dots
    doc.moveTo(m + cw / 2 - 30, doc.y).lineTo(m + cw / 2 + 30, doc.y).strokeColor(BLUSH).lineWidth(1).stroke();
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(
      'The family of ' + name + ' extends their heartfelt gratitude for the love, kindness, and support shown during this difficult time. Your gentle presence has been a source of comfort and peace.',
      m + 12, doc.y, { width: cw - 24, align: 'center', lineGap: 2 }
    );
    doc.moveDown(2);
    renderPallbearers(doc, c, m, cw, SAGE);

    // Delicate poem
    doc.moveDown(1);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(
      '"She lived with grace, she loved with heart,\nShe touched the world, a work of art."',
      m + 20, doc.y, { width: cw - 40, align: 'center', lineGap: 2 }
    );

    // Bottom floral rules
    doc.moveTo(m + 40, 540).lineTo(m + cw - 40, 540).strokeColor(SAGE).lineWidth(0.5).stroke();
    doc.moveTo(m + 20, 543).lineTo(m + cw - 20, 543).strokeColor(BLUSH).lineWidth(0.5).stroke();
    renderFuneralHomeFooter(doc, m, 555, cw, SAGE);

    // Front Cover
    const fx = pw + m;
    // Soft blush accent bar
    doc.rect(pw, 0, pw, 3).fill(BLUSH);
    doc.rect(pw, 609, pw, 3).fill(BLUSH);

    // Top floral decoration
    doc.moveTo(fx + 20, 50).lineTo(fx + cw - 20, 50).strokeColor(SAGE).lineWidth(0.5).stroke();
    doc.moveTo(fx + 40, 53).lineTo(fx + cw - 40, 53).strokeColor(BLUSH).lineWidth(0.5).stroke();
    doc.moveTo(fx + 60, 56).lineTo(fx + cw - 60, 56).strokeColor(SAGE).lineWidth(0.3).stroke();

    doc.font('Helvetica').fontSize(11).fillColor(MUTED).text('In Loving Memory of', fx, 80, { width: cw, align: 'center' });
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(26).fillColor(SAGE).text(name, fx, doc.y, { width: cw, align: 'center' });
    doc.moveDown(1);
    // Blush rule
    doc.moveTo(fx + cw / 2 - 35, doc.y).lineTo(fx + cw / 2 + 35, doc.y).strokeColor(BLUSH).lineWidth(1.5).stroke();
    doc.moveDown(1);
    if (dob && dod) {
      doc.font('Helvetica').fontSize(12).fillColor(TEXT).text(`Sunrise: ${dob}`, fx, doc.y, { width: cw, align: 'center' });
      doc.moveDown(0.3);
      doc.text(`Sunset: ${dod}`, fx, doc.y, { width: cw, align: 'center' });
    }
    doc.moveDown(2);
    renderPhotoPlaceholder(doc, fx + cw / 2 - 60, doc.y, 120, 150, BLUSH);

    // Bottom floral decoration
    doc.moveTo(fx + 60, 560).lineTo(fx + cw - 60, 560).strokeColor(SAGE).lineWidth(0.3).stroke();
    doc.moveTo(fx + 40, 563).lineTo(fx + cw - 40, 563).strokeColor(BLUSH).lineWidth(0.5).stroke();
    doc.moveTo(fx + 20, 566).lineTo(fx + cw - 20, 566).strokeColor(SAGE).lineWidth(0.5).stroke();

    // ── Page 2: Inside Left (Order of Service) + Inside Right (Obituary) ─
    doc.addPage();
    doc.rect(0, 0, pw * 2, 612).fill(CREAM);

    renderOrderOfService(doc, c, m, 40, cw, SAGE, BLUSH);

    // Obituary (right panel)
    const ox = pw + m;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(SAGE).text('Life Story', ox, 40, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(ox + cw * 0.3, doc.y).lineTo(ox + cw * 0.7, doc.y).strokeColor(BLUSH).lineWidth(1.5).stroke();
    doc.moveDown(1);
    const text = obit?.full_text || 'Obituary text will appear here once approved by the family.';
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(text, ox + 4, doc.y, { width: cw - 8, lineGap: 2.5 });

    doc.end();
    return promise;
  },
};

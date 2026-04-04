import { ProgramTemplate, CaseData, ObituaryData, fullName, formatDate, createBifoldDoc, bufferFromDoc, renderOrderOfService, renderPallbearers, renderPhotoPlaceholder, renderFuneralHomeFooter } from '../template-base';

const BRAND = '#1a1a2e';
const ACCENT = '#c9a96e';
const TEXT = '#333333';
const MUTED = '#666666';

export const classicElegant: ProgramTemplate = {
  id: 'classic-elegant',
  name: 'Classic Elegant',
  pageCount: 4,
  culturalContext: ['general', 'traditional'],
  description: 'Timeless design with navy and gold accents. Suitable for traditional funeral services.',

  async render(c: CaseData, obit: ObituaryData | null): Promise<Buffer> {
    const doc = createBifoldDoc();
    const promise = bufferFromDoc(doc);
    const name = fullName(c);
    const dob = formatDate(c.date_of_birth);
    const dod = formatDate(c.date_of_death);
    const pw = 396; // panel width
    const m = 36;
    const cw = pw - m * 2;

    // ── Page 1: Back Cover (left) + Front Cover (right) ──────────────────
    // Back Cover
    doc.y = 50;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(BRAND).text('Acknowledgments', m, doc.y, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(m + cw * 0.3, doc.y).lineTo(m + cw * 0.7, doc.y).strokeColor(ACCENT).lineWidth(1.5).stroke();
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(
      'The family sincerely thanks you for your expressions of love, prayers, and support during this time. Your presence and kindness mean more than words can express.',
      m + 8, doc.y, { width: cw - 16, align: 'center', lineGap: 2 }
    );
    doc.moveDown(2);
    renderPallbearers(doc, c, m, cw, BRAND);
    renderFuneralHomeFooter(doc, m, 550, cw, ACCENT);

    // Front Cover
    const fx = pw + m;
    doc.rect(pw, 0, pw, 4).fill(ACCENT);
    doc.font('Helvetica').fontSize(12).fillColor(MUTED).text('In Loving Memory of', fx, 120, { width: cw, align: 'center' });
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(28).fillColor(BRAND).text(name, fx, doc.y, { width: cw, align: 'center' });
    doc.moveDown(1);
    const ry = doc.y;
    doc.moveTo(fx + cw / 2 - 40, ry).lineTo(fx + cw / 2 + 40, ry).strokeColor(ACCENT).lineWidth(2).stroke();
    doc.moveDown(1);
    if (dob && dod) {
      doc.font('Helvetica').fontSize(13).fillColor(TEXT).text(`Sunrise: ${dob}`, fx, doc.y, { width: cw, align: 'center' });
      doc.moveDown(0.3);
      doc.text(`Sunset: ${dod}`, fx, doc.y, { width: cw, align: 'center' });
    }
    doc.moveDown(2);
    renderPhotoPlaceholder(doc, fx + cw / 2 - 60, doc.y, 120, 150, ACCENT);
    doc.rect(pw, 608, pw, 4).fill(ACCENT);

    // ── Page 2: Inside Left (Order of Service) + Inside Right (Obituary) ─
    doc.addPage();
    renderOrderOfService(doc, c, m, 40, cw, BRAND, ACCENT);

    // Obituary (right panel)
    const ox = pw + m;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(BRAND).text('Life Story', ox, 40, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(ox + cw * 0.3, doc.y).lineTo(ox + cw * 0.7, doc.y).strokeColor(ACCENT).lineWidth(1.5).stroke();
    doc.moveDown(1);
    const text = obit?.full_text || 'Obituary text will appear here once approved by the family.';
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(text, ox + 4, doc.y, { width: cw - 8, lineGap: 2.5 });

    doc.end();
    return promise;
  },
};

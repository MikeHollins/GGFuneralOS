import { ProgramTemplate, CaseData, ObituaryData, fullName, formatDate, createBifoldDoc, bufferFromDoc, renderOrderOfService, renderPallbearers, renderPhotoPlaceholder, renderFuneralHomeFooter } from '../template-base';

const MAHOGANY = '#4a1c1c';
const FOREST = '#2d4a22';
const CREAM = '#faf5ef';
const TEXT = '#333333';
const MUTED = '#6b5b4b';

export const southernTraditional: ProgramTemplate = {
  id: 'southern-traditional',
  name: 'Southern Traditional',
  pageCount: 4,
  culturalContext: ['southern', 'traditional', 'fraternal', 'lodge', 'masonic'],
  description: 'Forest green, mahogany, and cream with classic southern feel. Includes oak tree reference and lodge/fraternal section.',

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
    doc.rect(0, 0, pw * 2, 612).fill(CREAM);

    // Back Cover
    doc.rect(0, 0, pw, 5).fill(MAHOGANY);
    doc.rect(0, 607, pw, 5).fill(MAHOGANY);

    doc.font('Helvetica-Bold').fontSize(13).fillColor(MAHOGANY).text('Acknowledgments', m, 50, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(m + cw * 0.25, doc.y).lineTo(m + cw * 0.75, doc.y).strokeColor(FOREST).lineWidth(1.5).stroke();
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(
      'The family wishes to express their sincere gratitude for the many kindnesses shown during this time. Your prayers, visits, and support have been a blessing beyond measure.',
      m + 10, doc.y, { width: cw - 20, align: 'center', lineGap: 2 }
    );
    doc.moveDown(2);
    renderPallbearers(doc, c, m, cw, MAHOGANY);

    // Lodge/Fraternal section
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(FOREST).text('Fraternal & Lodge Affiliations', m, doc.y, { width: cw, align: 'center' });
    doc.moveDown(0.3);
    doc.moveTo(m + cw * 0.35, doc.y).lineTo(m + cw * 0.65, doc.y).strokeColor(MAHOGANY).lineWidth(0.5).stroke();
    doc.moveDown(0.5);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(
      'Lodge affiliations will be listed here.',
      m + 20, doc.y, { width: cw - 40, align: 'center' }
    );

    // Oak tree reference
    doc.moveDown(2);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(
      '"Like a mighty oak, deeply rooted and wide reaching,\ntheir life provided shade, shelter, and strength to all."',
      m + 15, doc.y, { width: cw - 30, align: 'center', lineGap: 2 }
    );

    renderFuneralHomeFooter(doc, m, 555, cw, FOREST);

    // Front Cover
    const fx = pw + m;
    doc.rect(pw, 0, pw, 5).fill(MAHOGANY);
    doc.rect(pw, 5, pw, 2).fill(FOREST);
    doc.rect(pw, 605, pw, 2).fill(FOREST);
    doc.rect(pw, 607, pw, 5).fill(MAHOGANY);

    // Oak leaf decorative rules
    doc.moveTo(fx + 30, 55).lineTo(fx + cw - 30, 55).strokeColor(FOREST).lineWidth(1).stroke();
    doc.moveTo(fx + 50, 58).lineTo(fx + cw - 50, 58).strokeColor(MAHOGANY).lineWidth(0.5).stroke();

    doc.font('Helvetica').fontSize(11).fillColor(MUTED).text('In Loving Memory of', fx, 75, { width: cw, align: 'center' });
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(26).fillColor(MAHOGANY).text(name, fx, doc.y, { width: cw, align: 'center' });
    doc.moveDown(1);
    doc.moveTo(fx + cw / 2 - 40, doc.y).lineTo(fx + cw / 2 + 40, doc.y).strokeColor(FOREST).lineWidth(2).stroke();
    doc.moveDown(1);
    if (dob && dod) {
      doc.font('Helvetica').fontSize(12).fillColor(TEXT).text(`Sunrise: ${dob}`, fx, doc.y, { width: cw, align: 'center' });
      doc.moveDown(0.3);
      doc.text(`Sunset: ${dod}`, fx, doc.y, { width: cw, align: 'center' });
    }
    doc.moveDown(2);
    renderPhotoPlaceholder(doc, fx + cw / 2 - 60, doc.y, 120, 150, MAHOGANY);

    // Bottom rules
    doc.moveTo(fx + 50, 570).lineTo(fx + cw - 50, 570).strokeColor(MAHOGANY).lineWidth(0.5).stroke();
    doc.moveTo(fx + 30, 573).lineTo(fx + cw - 30, 573).strokeColor(FOREST).lineWidth(1).stroke();

    // ── Page 2: Inside Left (Order of Service) + Inside Right (Obituary) ─
    doc.addPage();
    doc.rect(0, 0, pw * 2, 612).fill(CREAM);

    renderOrderOfService(doc, c, m, 40, cw, MAHOGANY, FOREST);

    // Obituary (right panel)
    const ox = pw + m;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(MAHOGANY).text('Life Story', ox, 40, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(ox + cw * 0.3, doc.y).lineTo(ox + cw * 0.7, doc.y).strokeColor(FOREST).lineWidth(1.5).stroke();
    doc.moveDown(1);
    const text = obit?.full_text || 'Obituary text will appear here once approved by the family.';
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(text, ox + 4, doc.y, { width: cw - 8, lineGap: 2.5 });

    doc.end();
    return promise;
  },
};

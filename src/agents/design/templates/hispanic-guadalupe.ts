import { ProgramTemplate, CaseData, ObituaryData, fullName, formatDate, createBifoldDoc, bufferFromDoc, renderOrderOfService, renderPallbearers, renderPhotoPlaceholder, renderFuneralHomeFooter } from '../template-base';

const DEEP_RED = '#8b0000';
const GOLD = '#d4a843';
const CREAM = '#fdf5e6';
const TEXT = '#333333';
const MUTED = '#6b5b4b';

export const hispanicGuadalupe: ProgramTemplate = {
  id: 'hispanic-guadalupe',
  name: 'Hispanic Guadalupe',
  pageCount: 4,
  culturalContext: ['hispanic', 'catholic', 'guadalupe', 'latino'],
  description: 'Deep red and gold with floral accents and Catholic elements. Includes "En Memoria de" option for Hispanic families.',

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
    doc.rect(0, 0, pw, 5).fill(DEEP_RED);
    doc.rect(0, 5, pw, 2).fill(GOLD);
    doc.rect(0, 605, pw, 2).fill(GOLD);
    doc.rect(0, 607, pw, 5).fill(DEEP_RED);

    doc.font('Helvetica-Bold').fontSize(13).fillColor(DEEP_RED).text('Agradecimientos', m, 50, { width: cw, align: 'center' });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Acknowledgments', m, doc.y, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(m + cw * 0.25, doc.y).lineTo(m + cw * 0.75, doc.y).strokeColor(GOLD).lineWidth(1.5).stroke();
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(
      'La familia agradece sinceramente sus expresiones de amor, oraciones y apoyo durante este tiempo. Su presencia y bondad significan mas de lo que las palabras pueden expresar.',
      m + 10, doc.y, { width: cw - 20, align: 'center', lineGap: 2 }
    );
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(
      'The family sincerely thanks you for your love, prayers, and support during this time.',
      m + 10, doc.y, { width: cw - 20, align: 'center', lineGap: 2 }
    );
    doc.moveDown(2);
    renderPallbearers(doc, c, m, cw, DEEP_RED);

    // Floral accent rules
    doc.moveTo(m + 30, 500).lineTo(m + cw - 30, 500).strokeColor(GOLD).lineWidth(0.5).stroke();
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED).text(
      '"Dios te salve, Maria, llena eres de gracia."',
      m, 510, { width: cw, align: 'center' }
    );
    renderFuneralHomeFooter(doc, m, 555, cw, GOLD);

    // Front Cover
    const fx = pw + m;
    doc.rect(pw, 0, pw, 5).fill(DEEP_RED);
    doc.rect(pw, 5, pw, 2).fill(GOLD);
    doc.rect(pw, 605, pw, 2).fill(GOLD);
    doc.rect(pw, 607, pw, 5).fill(DEEP_RED);

    // Cross
    doc.font('Helvetica-Bold').fontSize(30).fillColor(GOLD).text('✝', fx, 60, { width: cw, align: 'center' });
    doc.moveDown(0.5);

    // Floral decorative rules
    doc.moveTo(fx + 30, doc.y).lineTo(fx + cw - 30, doc.y).strokeColor(DEEP_RED).lineWidth(0.5).stroke();
    doc.moveTo(fx + 50, doc.y + 3).lineTo(fx + cw - 50, doc.y + 3).strokeColor(GOLD).lineWidth(0.5).stroke();
    doc.moveDown(1);

    doc.font('Helvetica').fontSize(11).fillColor(MUTED).text('En Memoria de', fx, doc.y, { width: cw, align: 'center' });
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('In Loving Memory of', fx, doc.y, { width: cw, align: 'center' });
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(26).fillColor(DEEP_RED).text(name, fx, doc.y, { width: cw, align: 'center' });
    doc.moveDown(1);
    doc.moveTo(fx + cw / 2 - 40, doc.y).lineTo(fx + cw / 2 + 40, doc.y).strokeColor(GOLD).lineWidth(2).stroke();
    doc.moveDown(1);
    if (dob && dod) {
      doc.font('Helvetica').fontSize(12).fillColor(TEXT).text(`${dob}  —  ${dod}`, fx, doc.y, { width: cw, align: 'center' });
    }
    doc.moveDown(2);
    renderPhotoPlaceholder(doc, fx + cw / 2 - 60, doc.y, 120, 150, GOLD);

    // Bottom floral rules
    doc.moveTo(fx + 50, 570).lineTo(fx + cw - 50, 570).strokeColor(GOLD).lineWidth(0.5).stroke();
    doc.moveTo(fx + 30, 573).lineTo(fx + cw - 30, 573).strokeColor(DEEP_RED).lineWidth(0.5).stroke();

    // ── Page 2: Inside Left (Order of Service) + Inside Right (Obituary) ─
    doc.addPage();
    doc.rect(0, 0, pw * 2, 612).fill(CREAM);

    renderOrderOfService(doc, c, m, 40, cw, DEEP_RED, GOLD);

    // Obituary (right panel)
    const ox = pw + m;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(DEEP_RED).text('Historia de Vida', ox, 40, { width: cw, align: 'center' });
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Life Story', ox, doc.y, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(ox + cw * 0.3, doc.y).lineTo(ox + cw * 0.7, doc.y).strokeColor(GOLD).lineWidth(1.5).stroke();
    doc.moveDown(1);
    const text = obit?.full_text || 'Obituary text will appear here once approved by the family.';
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(text, ox + 4, doc.y, { width: cw - 8, lineGap: 2.5 });

    doc.end();
    return promise;
  },
};

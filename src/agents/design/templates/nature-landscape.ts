import { ProgramTemplate, CaseData, ObituaryData, fullName, formatDate, createBifoldDoc, bufferFromDoc, renderOrderOfService, renderPallbearers, renderPhotoPlaceholder, renderFuneralHomeFooter } from '../template-base';

const FOREST = '#2d4a22';
const STONE = '#8b8680';
const SKY = '#87ceeb';
const TEXT = '#333333';
const MUTED = '#6b6b6b';

export const natureLandscape: ProgramTemplate = {
  id: 'nature-landscape',
  name: 'Nature Landscape',
  pageCount: 4,
  culturalContext: ['general', 'nature', 'masculine', 'outdoors'],
  description: 'Earth-toned design with forest green, stone, and sky blue. Mountain and nature motifs with a masculine feel.',

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
    // Mountain motif: layered horizontal rules suggesting ridgeline
    doc.moveTo(m, 35).lineTo(m + cw * 0.3, 20).lineTo(m + cw * 0.5, 30).lineTo(m + cw * 0.7, 15).lineTo(m + cw, 35).strokeColor(STONE).lineWidth(1.5).stroke();
    doc.moveTo(m, 40).lineTo(m + cw, 40).strokeColor(FOREST).lineWidth(0.5).stroke();

    doc.font('Helvetica-Bold').fontSize(13).fillColor(FOREST).text('Acknowledgments', m, 55, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(m + cw * 0.3, doc.y).lineTo(m + cw * 0.7, doc.y).strokeColor(STONE).lineWidth(1).stroke();
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(
      'The family wishes to thank everyone for the kindness, love, and support shown during this time. Like the enduring mountains, your steadfast presence has been a source of strength.',
      m + 10, doc.y, { width: cw - 20, align: 'center', lineGap: 2 }
    );
    doc.moveDown(2);
    renderPallbearers(doc, c, m, cw, FOREST);

    doc.moveDown(1);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(STONE).text(
      '"The mountains are calling, and I must go." — John Muir',
      m + 20, doc.y, { width: cw - 40, align: 'center' }
    );

    renderFuneralHomeFooter(doc, m, 550, cw, FOREST);

    // Front Cover
    const fx = pw + m;
    doc.rect(pw, 0, pw, 4).fill(FOREST);

    // Mountain ridgeline motif
    doc.moveTo(fx - m, 70).lineTo(fx + cw * 0.2, 45).lineTo(fx + cw * 0.4, 60).lineTo(fx + cw * 0.6, 35).lineTo(fx + cw * 0.8, 55).lineTo(fx + cw + m, 70).strokeColor(STONE).lineWidth(2).stroke();
    doc.moveTo(fx - m, 75).lineTo(fx + cw + m, 75).strokeColor(FOREST).lineWidth(0.5).stroke();

    // Sky-colored horizon rule
    doc.moveTo(fx + 20, 80).lineTo(fx + cw - 20, 80).strokeColor(SKY).lineWidth(1).stroke();

    doc.font('Helvetica').fontSize(11).fillColor(STONE).text('In Loving Memory of', fx, 100, { width: cw, align: 'center' });
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(26).fillColor(FOREST).text(name, fx, doc.y, { width: cw, align: 'center' });
    doc.moveDown(1);
    doc.moveTo(fx + cw / 2 - 40, doc.y).lineTo(fx + cw / 2 + 40, doc.y).strokeColor(STONE).lineWidth(1.5).stroke();
    doc.moveDown(1);
    if (dob && dod) {
      doc.font('Helvetica').fontSize(12).fillColor(TEXT).text(`${dob}  —  ${dod}`, fx, doc.y, { width: cw, align: 'center' });
    }
    doc.moveDown(2);
    renderPhotoPlaceholder(doc, fx + cw / 2 - 60, doc.y, 120, 150, FOREST);

    doc.rect(pw, 608, pw, 4).fill(FOREST);

    // ── Page 2: Inside Left (Order of Service) + Inside Right (Obituary) ─
    doc.addPage();
    // Subtle earth-tone top rule
    doc.moveTo(m, 30).lineTo(m + cw, 30).strokeColor(FOREST).lineWidth(0.5).stroke();
    doc.moveTo(m, 33).lineTo(m + cw, 33).strokeColor(SKY).lineWidth(0.3).stroke();

    renderOrderOfService(doc, c, m, 45, cw, FOREST, STONE);

    // Obituary (right panel)
    const ox = pw + m;
    doc.moveTo(ox, 30).lineTo(ox + cw, 30).strokeColor(FOREST).lineWidth(0.5).stroke();
    doc.moveTo(ox, 33).lineTo(ox + cw, 33).strokeColor(SKY).lineWidth(0.3).stroke();

    doc.font('Helvetica-Bold').fontSize(14).fillColor(FOREST).text('Life Story', ox, 45, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(ox + cw * 0.3, doc.y).lineTo(ox + cw * 0.7, doc.y).strokeColor(STONE).lineWidth(1.5).stroke();
    doc.moveDown(1);
    const text = obit?.full_text || 'Obituary text will appear here once approved by the family.';
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(text, ox + 4, doc.y, { width: cw - 8, lineGap: 2.5 });

    doc.end();
    return promise;
  },
};

import { ProgramTemplate, CaseData, ObituaryData, fullName, formatDate, createBifoldDoc, bufferFromDoc, renderOrderOfService, renderPallbearers, renderPhotoPlaceholder, renderFuneralHomeFooter } from '../template-base';

const AMBER = '#f59e0b';
const CORAL = '#ef6461';
const GOLDEN = '#fbbf24';
const TEXT = '#3d2c1e';
const MUTED = '#7a6a5a';

export const celebrationOfLife: ProgramTemplate = {
  id: 'celebration-of-life',
  name: 'Celebration of Life',
  pageCount: 4,
  culturalContext: ['general', 'celebration', 'upbeat'],
  description: 'Warm sunset palette with amber, coral, and golden tones. Joyful and upbeat, celebrating a life well lived.',

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
    doc.rect(0, 0, pw, 4).fill(CORAL);
    doc.rect(0, 608, pw, 4).fill(CORAL);

    doc.font('Helvetica-Bold').fontSize(13).fillColor(CORAL).text('With Gratitude', m, 60, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(m + cw * 0.25, doc.y).lineTo(m + cw * 0.75, doc.y).strokeColor(GOLDEN).lineWidth(1.5).stroke();
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(
      'The family extends warm thanks to everyone who has shared in this celebration of life. Your love, laughter, and memories have been a gift. Thank you for honoring ' + name + ' with your presence.',
      m + 10, doc.y, { width: cw - 20, align: 'center', lineGap: 2 }
    );
    doc.moveDown(2);
    renderPallbearers(doc, c, m, cw, CORAL);

    doc.moveDown(1);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(
      '"What a wonderful world."',
      m, doc.y, { width: cw, align: 'center' }
    );

    renderFuneralHomeFooter(doc, m, 550, cw, AMBER);

    // Front Cover — warm sunset feel
    const fx = pw + m;
    doc.rect(pw, 0, pw, 5).fill(AMBER);
    doc.rect(pw, 5, pw, 3).fill(GOLDEN);
    doc.rect(pw, 604, pw, 3).fill(GOLDEN);
    doc.rect(pw, 607, pw, 5).fill(AMBER);

    doc.font('Helvetica-Bold').fontSize(12).fillColor(AMBER).text('Celebrating the Life of', fx, 100, { width: cw, align: 'center' });
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(28).fillColor(CORAL).text(name, fx, doc.y, { width: cw, align: 'center' });
    doc.moveDown(1);
    // Sunset-like graduated rules
    doc.moveTo(fx + cw / 2 - 50, doc.y).lineTo(fx + cw / 2 + 50, doc.y).strokeColor(AMBER).lineWidth(2).stroke();
    doc.moveTo(fx + cw / 2 - 35, doc.y + 4).lineTo(fx + cw / 2 + 35, doc.y + 4).strokeColor(GOLDEN).lineWidth(1.5).stroke();
    doc.moveTo(fx + cw / 2 - 20, doc.y + 7).lineTo(fx + cw / 2 + 20, doc.y + 7).strokeColor(CORAL).lineWidth(1).stroke();
    doc.moveDown(1.5);
    if (dob && dod) {
      doc.font('Helvetica').fontSize(12).fillColor(TEXT).text(`${dob}  ~  ${dod}`, fx, doc.y, { width: cw, align: 'center' });
    }
    doc.moveDown(2);
    renderPhotoPlaceholder(doc, fx + cw / 2 - 60, doc.y, 120, 150, AMBER);

    // ── Page 2: Inside Left (Order of Service) + Inside Right (Obituary) ─
    doc.addPage();
    renderOrderOfService(doc, c, m, 40, cw, CORAL, AMBER);

    // Obituary (right panel)
    const ox = pw + m;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(CORAL).text('A Life Well Lived', ox, 40, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(ox + cw * 0.25, doc.y).lineTo(ox + cw * 0.75, doc.y).strokeColor(GOLDEN).lineWidth(1.5).stroke();
    doc.moveDown(1);
    const text = obit?.full_text || 'Obituary text will appear here once approved by the family.';
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(text, ox + 4, doc.y, { width: cw - 8, lineGap: 2.5 });

    doc.end();
    return promise;
  },
};

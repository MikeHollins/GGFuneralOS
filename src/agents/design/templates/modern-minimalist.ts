import { ProgramTemplate, CaseData, ObituaryData, fullName, formatDate, createBifoldDoc, bufferFromDoc, renderOrderOfService, renderPallbearers, renderPhotoPlaceholder, renderFuneralHomeFooter } from '../template-base';

const CHARCOAL = '#2d2d2d';
const WHITE = '#ffffff';
const TEAL = '#2d8f8f';
const MUTED = '#888888';

export const modernMinimalist: ProgramTemplate = {
  id: 'modern-minimalist',
  name: 'Modern Minimalist',
  pageCount: 4,
  culturalContext: ['general', 'modern', 'secular'],
  description: 'Clean, contemporary design with charcoal, white, and teal accent. Generous whitespace and large photo area.',

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
    // Back Cover — minimal acknowledgments
    doc.font('Helvetica-Bold').fontSize(13).fillColor(CHARCOAL).text('Acknowledgments', m, 80, { width: cw, align: 'center' });
    doc.moveDown(0.8);
    doc.moveTo(m + cw / 2 - 20, doc.y).lineTo(m + cw / 2 + 20, doc.y).strokeColor(TEAL).lineWidth(2).stroke();
    doc.moveDown(1.5);
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(
      'Thank you for being here. Your presence, kindness, and love mean everything to the family.',
      m + 20, doc.y, { width: cw - 40, align: 'center', lineGap: 3 }
    );
    doc.moveDown(3);
    renderPallbearers(doc, c, m, cw, CHARCOAL);
    renderFuneralHomeFooter(doc, m, 555, cw, TEAL);

    // Front Cover — large hero photo area
    const fx = pw + m;
    doc.rect(pw, 0, pw, 2).fill(TEAL);

    // Large hero photo placeholder
    renderPhotoPlaceholder(doc, fx + 20, 50, cw - 40, 280, TEAL);

    doc.moveDown(2);
    doc.font('Helvetica-Bold').fontSize(30).fillColor(CHARCOAL).text(name, fx, 360, { width: cw, align: 'center' });
    doc.moveDown(0.8);
    doc.moveTo(fx + cw / 2 - 25, doc.y).lineTo(fx + cw / 2 + 25, doc.y).strokeColor(TEAL).lineWidth(2.5).stroke();
    doc.moveDown(1);
    if (dob && dod) {
      doc.font('Helvetica').fontSize(11).fillColor(MUTED).text(`${dob}  —  ${dod}`, fx, doc.y, { width: cw, align: 'center' });
    }

    doc.rect(pw, 610, pw, 2).fill(TEAL);

    // ── Page 2: Inside Left (Order of Service) + Inside Right (Obituary) ─
    doc.addPage();
    doc.moveTo(m, 30).lineTo(m + cw, 30).strokeColor(TEAL).lineWidth(0.5).stroke();
    renderOrderOfService(doc, c, m, 45, cw, CHARCOAL, TEAL);

    // Obituary (right panel)
    const ox = pw + m;
    doc.moveTo(ox, 30).lineTo(ox + cw, 30).strokeColor(TEAL).lineWidth(0.5).stroke();
    doc.font('Helvetica-Bold').fontSize(14).fillColor(CHARCOAL).text('Life Story', ox, 45, { width: cw, align: 'center' });
    doc.moveDown(0.8);
    doc.moveTo(ox + cw / 2 - 20, doc.y).lineTo(ox + cw / 2 + 20, doc.y).strokeColor(TEAL).lineWidth(2).stroke();
    doc.moveDown(1);
    const text = obit?.full_text || 'Obituary text will appear here once approved by the family.';
    doc.font('Helvetica').fontSize(9.5).fillColor(CHARCOAL).text(text, ox + 4, doc.y, { width: cw - 8, lineGap: 2.5 });

    doc.end();
    return promise;
  },
};

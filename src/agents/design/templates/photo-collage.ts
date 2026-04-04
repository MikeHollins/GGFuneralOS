import { ProgramTemplate, CaseData, ObituaryData, fullName, formatDate, createBifoldDoc, bufferFromDoc, renderOrderOfService, renderPallbearers, renderPhotoPlaceholder, renderFuneralHomeFooter } from '../template-base';

const FRAME = '#f5f5f0';
const ACCENT = '#555555';
const TEXT = '#333333';
const MUTED = '#888888';

export const photoCollage: ProgramTemplate = {
  id: 'photo-collage',
  name: 'Photo Collage',
  pageCount: 4,
  culturalContext: ['general', 'photo-focused', 'modern'],
  description: 'Neutral-framed design where photos dominate. Magazine-style layout with 6-8 photo placeholders and minimal text.',

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
    // Full background
    doc.rect(0, 0, pw * 2, 612).fill(FRAME);

    // Back Cover — Photo grid (3x2 magazine layout)
    // Row 1: two landscape photos
    renderPhotoPlaceholder(doc, m, 40, cw / 2 - 5, 120, ACCENT);
    renderPhotoPlaceholder(doc, m + cw / 2 + 5, 40, cw / 2 - 5, 120, ACCENT);
    // Row 2: one wide panoramic
    renderPhotoPlaceholder(doc, m, 170, cw, 100, ACCENT);
    // Row 3: two landscape photos
    renderPhotoPlaceholder(doc, m, 280, cw / 2 - 5, 120, ACCENT);
    renderPhotoPlaceholder(doc, m + cw / 2 + 5, 280, cw / 2 - 5, 120, ACCENT);

    // Minimal acknowledgments
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(
      'Thank you for celebrating this life with us.',
      m, 420, { width: cw, align: 'center' }
    );
    doc.moveDown(1.5);
    renderPallbearers(doc, c, m, cw, ACCENT);
    renderFuneralHomeFooter(doc, m, 555, cw, ACCENT);

    // Front Cover — Hero photo + name
    const fx = pw + m;
    // Large hero photo
    renderPhotoPlaceholder(doc, fx + 10, 40, cw - 20, 300, ACCENT);

    doc.font('Helvetica-Bold').fontSize(28).fillColor(ACCENT).text(name, fx, 370, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(fx + cw / 2 - 30, doc.y).lineTo(fx + cw / 2 + 30, doc.y).strokeColor(ACCENT).lineWidth(1.5).stroke();
    doc.moveDown(0.8);
    if (dob && dod) {
      doc.font('Helvetica').fontSize(11).fillColor(MUTED).text(`${dob}  —  ${dod}`, fx, doc.y, { width: cw, align: 'center' });
    }

    // Two small photos at bottom
    renderPhotoPlaceholder(doc, fx, 490, cw / 2 - 5, 90, ACCENT);
    renderPhotoPlaceholder(doc, fx + cw / 2 + 5, 490, cw / 2 - 5, 90, ACCENT);

    // ── Page 2: Inside Left (Order of Service) + Inside Right (Obituary) ─
    doc.addPage();
    doc.rect(0, 0, pw * 2, 612).fill(FRAME);

    renderOrderOfService(doc, c, m, 40, cw, ACCENT, ACCENT);

    // Obituary (right panel)
    const ox = pw + m;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(ACCENT).text('Life Story', ox, 40, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(ox + cw * 0.3, doc.y).lineTo(ox + cw * 0.7, doc.y).strokeColor(ACCENT).lineWidth(1).stroke();
    doc.moveDown(1);
    const text = obit?.full_text || 'Obituary text will appear here once approved by the family.';
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(text, ox + 4, doc.y, { width: cw - 8, lineGap: 2.5 });

    doc.end();
    return promise;
  },
};

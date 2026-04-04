import { ProgramTemplate, CaseData, ObituaryData, fullName, formatDate, createBifoldDoc, bufferFromDoc, renderOrderOfService, renderPallbearers, renderPhotoPlaceholder, renderFuneralHomeFooter } from '../template-base';

const AMBER = '#d97706';
const WARM_GOLD = '#b8860b';
const LIGHT = '#fffbeb';
const TEXT = '#3d3020';
const MUTED = '#8a7a5a';

export const nonDenominational: ProgramTemplate = {
  id: 'non-denominational-sunrise',
  name: 'Non-Denominational Sunrise',
  pageCount: 4,
  culturalContext: ['general', 'spiritual', 'non-denominational', 'secular'],
  description: 'Warm amber to gold design. Spiritual but not religious, with "A Life Remembered" heading.',

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
    doc.rect(0, 0, pw * 2, 612).fill(LIGHT);

    // Back Cover
    // Warm gradient-feel: layered amber/gold rules at top
    doc.rect(0, 0, pw, 3).fill(AMBER);
    doc.rect(0, 3, pw, 2).fill(WARM_GOLD);
    doc.rect(0, 607, pw, 2).fill(WARM_GOLD);
    doc.rect(0, 609, pw, 3).fill(AMBER);

    doc.font('Helvetica-Bold').fontSize(13).fillColor(AMBER).text('With Gratitude', m, 50, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(m + cw * 0.3, doc.y).lineTo(m + cw * 0.7, doc.y).strokeColor(WARM_GOLD).lineWidth(1.5).stroke();
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(
      'The family extends heartfelt thanks for your warmth, compassion, and presence. Like the dawn that greets each new day, your kindness brings light and hope.',
      m + 10, doc.y, { width: cw - 20, align: 'center', lineGap: 2 }
    );
    doc.moveDown(2);
    renderPallbearers(doc, c, m, cw, AMBER);

    doc.moveDown(1.5);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(
      '"Every sunset brings the promise of a new dawn."',
      m + 20, doc.y, { width: cw - 40, align: 'center' }
    );

    renderFuneralHomeFooter(doc, m, 555, cw, WARM_GOLD);

    // Front Cover — warm sunrise feel
    const fx = pw + m;
    // Gradient-like top bars: amber → gold → light
    doc.rect(pw, 0, pw, 4).fill(AMBER);
    doc.rect(pw, 4, pw, 3).fill(WARM_GOLD);
    doc.rect(pw, 605, pw, 3).fill(WARM_GOLD);
    doc.rect(pw, 608, pw, 4).fill(AMBER);

    // Sunrise rays: radiating horizontal rules
    doc.moveTo(fx + cw / 2 - 80, 55).lineTo(fx + cw / 2 + 80, 55).strokeColor(WARM_GOLD).lineWidth(0.5).stroke();
    doc.moveTo(fx + cw / 2 - 60, 59).lineTo(fx + cw / 2 + 60, 59).strokeColor(AMBER).lineWidth(0.8).stroke();
    doc.moveTo(fx + cw / 2 - 40, 63).lineTo(fx + cw / 2 + 40, 63).strokeColor(WARM_GOLD).lineWidth(1).stroke();
    doc.moveTo(fx + cw / 2 - 20, 67).lineTo(fx + cw / 2 + 20, 67).strokeColor(AMBER).lineWidth(1.5).stroke();

    doc.font('Helvetica-Bold').fontSize(13).fillColor(AMBER).text('A Life Remembered', fx, 85, { width: cw, align: 'center' });
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(28).fillColor(WARM_GOLD).text(name, fx, doc.y, { width: cw, align: 'center' });
    doc.moveDown(1);
    doc.moveTo(fx + cw / 2 - 40, doc.y).lineTo(fx + cw / 2 + 40, doc.y).strokeColor(AMBER).lineWidth(2).stroke();
    doc.moveDown(1);
    if (dob && dod) {
      doc.font('Helvetica').fontSize(12).fillColor(TEXT).text(`${dob}  —  ${dod}`, fx, doc.y, { width: cw, align: 'center' });
    }
    doc.moveDown(2);
    renderPhotoPlaceholder(doc, fx + cw / 2 - 60, doc.y, 120, 150, WARM_GOLD);

    // Bottom sunrise rays (inverted)
    doc.moveTo(fx + cw / 2 - 20, 555).lineTo(fx + cw / 2 + 20, 555).strokeColor(AMBER).lineWidth(1.5).stroke();
    doc.moveTo(fx + cw / 2 - 40, 559).lineTo(fx + cw / 2 + 40, 559).strokeColor(WARM_GOLD).lineWidth(1).stroke();
    doc.moveTo(fx + cw / 2 - 60, 563).lineTo(fx + cw / 2 + 60, 563).strokeColor(AMBER).lineWidth(0.8).stroke();
    doc.moveTo(fx + cw / 2 - 80, 567).lineTo(fx + cw / 2 + 80, 567).strokeColor(WARM_GOLD).lineWidth(0.5).stroke();

    // ── Page 2: Inside Left (Order of Service) + Inside Right (Obituary) ─
    doc.addPage();
    doc.rect(0, 0, pw * 2, 612).fill(LIGHT);

    renderOrderOfService(doc, c, m, 40, cw, AMBER, WARM_GOLD);

    // Obituary (right panel)
    const ox = pw + m;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(AMBER).text('A Life Remembered', ox, 40, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(ox + cw * 0.3, doc.y).lineTo(ox + cw * 0.7, doc.y).strokeColor(WARM_GOLD).lineWidth(1.5).stroke();
    doc.moveDown(1);
    const text = obit?.full_text || 'Obituary text will appear here once approved by the family.';
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(text, ox + 4, doc.y, { width: cw - 8, lineGap: 2.5 });

    doc.end();
    return promise;
  },
};

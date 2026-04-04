import { ProgramTemplate, CaseData, ObituaryData, fullName, formatDate, createBifoldDoc, bufferFromDoc, renderOrderOfService, renderPallbearers, renderPhotoPlaceholder, renderFuneralHomeFooter } from '../template-base';

const NAVY = '#0a1628';
const RED = '#b71c1c';
const WHITE = '#ffffff';
const TEXT = '#2d2d2d';
const MUTED = '#555555';

const TAPS_LYRICS = `Day is done, gone the sun,
From the lake, from the hills, from the sky;
All is well, safely rest, God is nigh.

Fading light, dims the sight,
And a star gems the sky, gleaming bright.
From afar, drawing nigh, falls the night.

Thanks and praise, for our days,
'Neath the sun, 'neath the stars, 'neath the sky;
As we go, this we know, God is nigh.`;

export const militaryVeterans: ProgramTemplate = {
  id: 'military-veterans',
  name: 'Military Veterans',
  pageCount: 4,
  culturalContext: ['military', 'veterans', 'patriotic'],
  description: 'Red, navy, and white patriotic design honoring military service with rank, branch, and Taps lyrics.',

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
    // Back Cover — Taps lyrics + Acknowledgments
    doc.rect(0, 0, pw, 4).fill(RED);
    doc.rect(0, 608, pw, 4).fill(RED);

    doc.font('Helvetica-Bold').fontSize(14).fillColor(NAVY).text('Taps', m, 50, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(m + cw * 0.3, doc.y).lineTo(m + cw * 0.7, doc.y).strokeColor(RED).lineWidth(1.5).stroke();
    doc.moveDown(1);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(TAPS_LYRICS, m + 20, doc.y, { width: cw - 40, align: 'center', lineGap: 2 });
    doc.moveDown(2);

    doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text('Acknowledgments', m, doc.y, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(9).fillColor(TEXT).text(
      'The family sincerely thanks you for your expressions of love, prayers, and support. We are grateful for the service and sacrifice of our loved one and for the community that has stood with us.',
      m + 8, doc.y, { width: cw - 16, align: 'center', lineGap: 2 }
    );
    doc.moveDown(1.5);
    renderPallbearers(doc, c, m, cw, NAVY);
    renderFuneralHomeFooter(doc, m, 550, cw, RED);

    // Front Cover
    const fx = pw + m;
    doc.rect(pw, 0, pw, 6).fill(NAVY);
    doc.rect(pw, 6, pw, 3).fill(RED);
    doc.rect(pw, 603, pw, 3).fill(RED);
    doc.rect(pw, 606, pw, 6).fill(NAVY);

    // Eagle motif via decorative rules
    doc.moveTo(fx + cw / 2 - 60, 80).lineTo(fx + cw / 2 + 60, 80).strokeColor(NAVY).lineWidth(2).stroke();
    doc.moveTo(fx + cw / 2 - 40, 85).lineTo(fx + cw / 2 + 40, 85).strokeColor(RED).lineWidth(1).stroke();

    doc.font('Helvetica-Bold').fontSize(10).fillColor(RED).text('★  IN HONOR AND MEMORY  ★', fx, 100, { width: cw, align: 'center' });
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(26).fillColor(NAVY).text(name, fx, doc.y, { width: cw, align: 'center' });
    doc.moveDown(1);

    // Decorative rule
    doc.moveTo(fx + cw / 2 - 50, doc.y).lineTo(fx + cw / 2 + 50, doc.y).strokeColor(RED).lineWidth(2).stroke();
    doc.moveDown(1);

    if (dob && dod) {
      doc.font('Helvetica').fontSize(12).fillColor(TEXT).text(`${dob} — ${dod}`, fx, doc.y, { width: cw, align: 'center' });
      doc.moveDown(1.5);
    }

    renderPhotoPlaceholder(doc, fx + cw / 2 - 60, doc.y, 120, 150, NAVY);

    // Military service details
    const serviceY = doc.y > 380 ? doc.y : 380;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('UNITED STATES ARMED FORCES', fx, serviceY + 160, { width: cw, align: 'center' });
    doc.moveDown(0.3);
    doc.moveTo(fx + cw * 0.2, doc.y).lineTo(fx + cw * 0.8, doc.y).strokeColor(RED).lineWidth(0.5).stroke();
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text('Rank • Branch • Theater', fx, doc.y, { width: cw, align: 'center' });

    // ── Page 2: Inside Left (Order of Service) + Inside Right (Obituary) ─
    doc.addPage();

    // Decorative top rules on inside spread
    doc.moveTo(m, 30).lineTo(m + cw, 30).strokeColor(NAVY).lineWidth(1).stroke();
    doc.moveTo(m, 33).lineTo(m + cw, 33).strokeColor(RED).lineWidth(0.5).stroke();

    renderOrderOfService(doc, c, m, 45, cw, NAVY, RED);

    // Military service section
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text('Military Service', m, doc.y, { width: cw, align: 'center' });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9).fillColor(TEXT);
    doc.text('Rank: ____________________', m + 20, doc.y, { width: cw - 40 });
    doc.moveDown(0.3);
    doc.text('Branch: __________________', m + 20, doc.y, { width: cw - 40 });
    doc.moveDown(0.3);
    doc.text('Service Dates: ___________', m + 20, doc.y, { width: cw - 40 });
    doc.moveDown(0.3);
    doc.text('Theater: _________________', m + 20, doc.y, { width: cw - 40 });

    // Obituary (right panel)
    const ox = pw + m;
    doc.moveTo(ox, 30).lineTo(ox + cw, 30).strokeColor(NAVY).lineWidth(1).stroke();
    doc.moveTo(ox, 33).lineTo(ox + cw, 33).strokeColor(RED).lineWidth(0.5).stroke();

    doc.font('Helvetica-Bold').fontSize(14).fillColor(NAVY).text('Life & Service', ox, 45, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(ox + cw * 0.3, doc.y).lineTo(ox + cw * 0.7, doc.y).strokeColor(RED).lineWidth(1.5).stroke();
    doc.moveDown(1);
    const text = obit?.full_text || 'Obituary text will appear here once approved by the family.';
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(text, ox + 4, doc.y, { width: cw - 8, lineGap: 2.5 });

    doc.end();
    return promise;
  },
};

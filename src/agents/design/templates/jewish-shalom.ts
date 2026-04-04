import { ProgramTemplate, CaseData, ObituaryData, fullName, formatDate, createBifoldDoc, bufferFromDoc, renderOrderOfService, renderPallbearers, renderPhotoPlaceholder, renderFuneralHomeFooter } from '../template-base';

const BLUE = '#1a3a5c';
const SILVER = '#c0c0c0';
const WHITE = '#ffffff';
const TEXT = '#2d2d2d';
const MUTED = '#666666';

export const jewishShalom: ProgramTemplate = {
  id: 'jewish-shalom',
  name: 'Jewish Shalom',
  pageCount: 4,
  culturalContext: ['jewish', 'hebrew', 'shalom', 'conservative', 'reform', 'orthodox'],
  description: 'Blue, white, and silver design with Star of David. Hebrew elements and "May their memory be a blessing."',

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
    doc.rect(0, 0, pw, 3).fill(BLUE);
    doc.rect(0, 609, pw, 3).fill(BLUE);

    doc.font('Helvetica-Bold').fontSize(13).fillColor(BLUE).text('Acknowledgments', m, 50, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(m + cw * 0.3, doc.y).lineTo(m + cw * 0.7, doc.y).strokeColor(SILVER).lineWidth(1.5).stroke();
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(
      'The family sincerely thanks you for your expressions of sympathy, comfort, and support. Your presence has been a source of strength during this time of mourning.',
      m + 10, doc.y, { width: cw - 20, align: 'center', lineGap: 2 }
    );
    doc.moveDown(2);
    renderPallbearers(doc, c, m, cw, BLUE);

    // Kaddish/memorial note
    doc.moveDown(1.5);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(
      'May their memory be a blessing.',
      m, doc.y, { width: cw, align: 'center' }
    );
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(8).fillColor(BLUE).text(
      'Zikhronam livrakha — זכרונם לברכה',
      m, doc.y, { width: cw, align: 'center' }
    );

    renderFuneralHomeFooter(doc, m, 555, cw, BLUE);

    // Front Cover
    const fx = pw + m;
    doc.rect(pw, 0, pw, 4).fill(BLUE);
    doc.rect(pw, 608, pw, 4).fill(BLUE);

    // Star of David
    doc.font('Helvetica').fontSize(32).fillColor(BLUE).text('✡', fx, 65, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    // Silver accent lines
    doc.moveTo(fx + cw * 0.25, doc.y).lineTo(fx + cw * 0.75, doc.y).strokeColor(SILVER).lineWidth(1).stroke();
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(11).fillColor(MUTED).text('In Loving Memory of', fx, doc.y, { width: cw, align: 'center' });
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(26).fillColor(BLUE).text(name, fx, doc.y, { width: cw, align: 'center' });
    doc.moveDown(1);
    doc.moveTo(fx + cw / 2 - 40, doc.y).lineTo(fx + cw / 2 + 40, doc.y).strokeColor(SILVER).lineWidth(2).stroke();
    doc.moveDown(1);
    if (dob && dod) {
      doc.font('Helvetica').fontSize(12).fillColor(TEXT).text(`${dob}  —  ${dod}`, fx, doc.y, { width: cw, align: 'center' });
    }
    doc.moveDown(2);
    renderPhotoPlaceholder(doc, fx + cw / 2 - 60, doc.y, 120, 150, SILVER);

    // Bottom blessing
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(BLUE).text(
      'May their memory be a blessing.',
      fx, 575, { width: cw, align: 'center' }
    );

    // ── Page 2: Inside Left (Order of Service) + Inside Right (Obituary) ─
    doc.addPage();
    // Subtle blue top rules
    doc.moveTo(m, 30).lineTo(m + cw, 30).strokeColor(BLUE).lineWidth(0.5).stroke();
    doc.moveTo(m, 33).lineTo(m + cw, 33).strokeColor(SILVER).lineWidth(0.3).stroke();

    renderOrderOfService(doc, c, m, 45, cw, BLUE, SILVER);

    // Obituary (right panel)
    const ox = pw + m;
    doc.moveTo(ox, 30).lineTo(ox + cw, 30).strokeColor(BLUE).lineWidth(0.5).stroke();
    doc.moveTo(ox, 33).lineTo(ox + cw, 33).strokeColor(SILVER).lineWidth(0.3).stroke();

    doc.font('Helvetica-Bold').fontSize(14).fillColor(BLUE).text('Life Story', ox, 45, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(ox + cw * 0.3, doc.y).lineTo(ox + cw * 0.7, doc.y).strokeColor(SILVER).lineWidth(1.5).stroke();
    doc.moveDown(1);
    const text = obit?.full_text || 'Obituary text will appear here once approved by the family.';
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(text, ox + 4, doc.y, { width: cw - 8, lineGap: 2.5 });

    doc.end();
    return promise;
  },
};

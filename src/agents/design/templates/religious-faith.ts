import { ProgramTemplate, CaseData, ObituaryData, fullName, formatDate, createBifoldDoc, bufferFromDoc, renderOrderOfService, renderPallbearers, renderPhotoPlaceholder, renderFuneralHomeFooter } from '../template-base';

const BURGUNDY = '#722f37';
const GOLD = '#c9a96e';
const TEXT = '#333333';
const MUTED = '#666666';

export const religiousFaith: ProgramTemplate = {
  id: 'religious-faith',
  name: 'Religious Faith',
  pageCount: 4,
  culturalContext: ['christian', 'catholic', 'protestant', 'religious'],
  description: 'Burgundy and gold design with cross symbol, scripture, and hymn sections. Ideal for faith-centered services.',

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
    doc.rect(0, 0, pw, 4).fill(BURGUNDY);
    doc.rect(0, 608, pw, 4).fill(BURGUNDY);

    doc.font('Helvetica-Bold').fontSize(13).fillColor(BURGUNDY).text('Acknowledgments', m, 50, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(m + cw * 0.3, doc.y).lineTo(m + cw * 0.7, doc.y).strokeColor(GOLD).lineWidth(1.5).stroke();
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(
      'The family gratefully acknowledges your prayers, words of comfort, and expressions of love. May God bless each of you for your kindness during this time.',
      m + 10, doc.y, { width: cw - 20, align: 'center', lineGap: 2 }
    );
    doc.moveDown(2);
    renderPallbearers(doc, c, m, cw, BURGUNDY);

    // Hymns section
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BURGUNDY).text('Hymns', m, doc.y, { width: cw, align: 'center' });
    doc.moveDown(0.3);
    const music = c.music_selections || [];
    if (music.length > 0) {
      for (const s of music) {
        doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`♪ ${s.title || s}`, m + 20, doc.y, { width: cw - 40, align: 'center' });
        doc.moveDown(0.3);
      }
    } else {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text('Amazing Grace • How Great Thou Art • It Is Well', m + 20, doc.y, { width: cw - 40, align: 'center' });
    }

    // Scripture
    doc.moveDown(1.5);
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text(
      '"The Lord is my shepherd; I shall not want." — Psalm 23:1',
      m + 20, doc.y, { width: cw - 40, align: 'center' }
    );

    renderFuneralHomeFooter(doc, m, 550, cw, GOLD);

    // Front Cover
    const fx = pw + m;
    doc.rect(pw, 0, pw, 5).fill(BURGUNDY);
    doc.rect(pw, 607, pw, 5).fill(BURGUNDY);

    // Cross symbol
    doc.font('Helvetica-Bold').fontSize(36).fillColor(GOLD).text('✝', fx, 70, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(11).fillColor(MUTED).text('In Loving Memory of', fx, doc.y, { width: cw, align: 'center' });
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(26).fillColor(BURGUNDY).text(name, fx, doc.y, { width: cw, align: 'center' });
    doc.moveDown(1);
    doc.moveTo(fx + cw / 2 - 40, doc.y).lineTo(fx + cw / 2 + 40, doc.y).strokeColor(GOLD).lineWidth(2).stroke();
    doc.moveDown(1);
    if (dob && dod) {
      doc.font('Helvetica').fontSize(12).fillColor(TEXT).text(`Sunrise: ${dob}`, fx, doc.y, { width: cw, align: 'center' });
      doc.moveDown(0.3);
      doc.text(`Sunset: ${dod}`, fx, doc.y, { width: cw, align: 'center' });
    }
    doc.moveDown(2);
    renderPhotoPlaceholder(doc, fx + cw / 2 - 60, doc.y, 120, 150, GOLD);

    // Bottom scripture
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(GOLD).text(
      '"Well done, good and faithful servant." — Matthew 25:21',
      fx, 570, { width: cw, align: 'center' }
    );

    // ── Page 2: Inside Left (Order of Service) + Inside Right (Obituary) ─
    doc.addPage();
    renderOrderOfService(doc, c, m, 40, cw, BURGUNDY, GOLD);

    // Scripture readings section
    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BURGUNDY).text('Scripture Readings', m, doc.y, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    const readings = c.readings || [];
    if (readings.length > 0) {
      for (const r of readings) {
        doc.font('Helvetica-Oblique').fontSize(9).fillColor(TEXT).text(r.text || r.type || 'Scripture', m + 12, doc.y, { width: cw - 24 });
        doc.moveDown(0.4);
      }
    } else {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(MUTED).text('Psalm 23 • John 14:1-6 • Romans 8:38-39', m + 12, doc.y, { width: cw - 24, align: 'center' });
    }

    // Obituary (right panel)
    const ox = pw + m;
    doc.font('Helvetica-Bold').fontSize(14).fillColor(BURGUNDY).text('Life Story', ox, 40, { width: cw, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(ox + cw * 0.3, doc.y).lineTo(ox + cw * 0.7, doc.y).strokeColor(GOLD).lineWidth(1.5).stroke();
    doc.moveDown(1);
    const text = obit?.full_text || 'Obituary text will appear here once approved by the family.';
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(text, ox + 4, doc.y, { width: cw - 8, lineGap: 2.5 });

    doc.end();
    return promise;
  },
};

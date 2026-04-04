import { ProgramTemplate, CaseData, ObituaryData, fullName, formatDate, createBookletDoc, bufferFromDoc, renderOrderOfService, renderPallbearers, renderFuneralHomeFooter } from '../template-base';

const ROYAL_PURPLE = '#4a0e78';
const GOLD = '#d4a843';
const TEXT = '#2d2d2d';

export const homegoingGlory: ProgramTemplate = {
  id: 'homegoing-glory',
  name: 'Homegoing Glory',
  pageCount: 8,
  culturalContext: ['african-american', 'baptist', 'ame', 'cogic', 'homegoing'],
  description: '8-page booklet with royal purple and gold. Designed for Homegoing celebrations in the Black church tradition.',

  async render(c: CaseData, obit: ObituaryData | null): Promise<Buffer> {
    const doc = createBookletDoc();
    const promise = bufferFromDoc(doc);
    const name = fullName(c);
    const dob = formatDate(c.date_of_birth);
    const dod = formatDate(c.date_of_death);
    const m = 30;
    const w = 396 - m * 2;

    // ── Page 1: Front Cover ─────────────────────────────────────────────
    doc.rect(0, 0, 396, 612).fill(ROYAL_PURPLE);
    doc.rect(0, 0, 396, 6).fill(GOLD);
    doc.rect(0, 606, 396, 6).fill(GOLD);
    doc.font('Helvetica').fontSize(11).fillColor(GOLD).text('Homegoing Celebration for', m, 80, { width: w, align: 'center' });
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(26).fillColor('#ffffff').text(name, m, doc.y, { width: w, align: 'center' });
    doc.moveDown(1);
    doc.moveTo(m + w * 0.2, doc.y).lineTo(m + w * 0.8, doc.y).strokeColor(GOLD).lineWidth(2).stroke();
    doc.moveDown(1);
    if (dob && dod) {
      doc.font('Helvetica').fontSize(12).fillColor(GOLD);
      doc.text(`Sunrise: ${dob}`, m, doc.y, { width: w, align: 'center' });
      doc.moveDown(0.3);
      doc.text(`Sunset: ${dod}`, m, doc.y, { width: w, align: 'center' });
    }
    doc.moveDown(2);
    doc.rect(m + w / 2 - 65, doc.y, 130, 160).strokeColor(GOLD).lineWidth(1.5).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(GOLD).text('Photo', m + w / 2 - 65, doc.y + 70, { width: 130, align: 'center' });

    // ── Page 2: Obituary ────────────────────────────────────────────────
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(16).fillColor(ROYAL_PURPLE).text('Life Story', m, 40, { width: w, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(m, doc.y).lineTo(m + w, doc.y).strokeColor(GOLD).lineWidth(1).stroke();
    doc.moveDown(1);
    const obituaryText = obit?.full_text || 'The life story will appear here.';
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(obituaryText, m + 4, doc.y, { width: w - 8, lineGap: 2.5 });

    // ── Page 3: Obituary continued / Photo Collage ──────────────────────
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(14).fillColor(ROYAL_PURPLE).text('Cherished Memories', m, 40, { width: w, align: 'center' });
    doc.moveDown(1);
    // Photo grid placeholder (3x2)
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        const px = m + col * (w / 2 + 5);
        const py = doc.y + row * 155;
        doc.rect(px, py, w / 2 - 10, 140).strokeColor(GOLD).lineWidth(0.5).stroke();
        doc.font('Helvetica').fontSize(7).fillColor('#999').text('Photo', px, py + 65, { width: w / 2 - 10, align: 'center' });
      }
    }

    // ── Page 4: Order of Service ────────────────────────────────────────
    doc.addPage();
    renderOrderOfService(doc, c, m, 40, w, ROYAL_PURPLE, GOLD);

    // ── Page 5: Musical Selections / Scripture ──────────────────────────
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(14).fillColor(ROYAL_PURPLE).text('Musical Selections', m, 40, { width: w, align: 'center' });
    doc.moveDown(1);
    const music = c.music_selections || [];
    if (music.length > 0) {
      for (const s of music) {
        doc.font('Helvetica').fontSize(10).fillColor(TEXT).text(`♪ ${s.title || s}`, m + 20, doc.y, { width: w - 40 });
        doc.moveDown(0.5);
      }
    }
    doc.moveDown(2);
    doc.font('Helvetica-Bold').fontSize(14).fillColor(ROYAL_PURPLE).text('Scripture Readings', m, doc.y, { width: w, align: 'center' });
    doc.moveDown(1);
    const readings = c.readings || [];
    for (const r of readings) {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor(TEXT).text(r.text || r.type || 'Scripture', m + 20, doc.y, { width: w - 40 });
      doc.moveDown(0.5);
    }
    if (readings.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor('#888').text('"The Lord is my shepherd; I shall not want." — Psalm 23:1', m + 20, doc.y, { width: w - 40, align: 'center' });
    }

    // ── Page 6: Tributes / Reflections ──────────────────────────────────
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(14).fillColor(ROYAL_PURPLE).text('Tributes & Reflections', m, 40, { width: w, align: 'center' });
    doc.moveDown(1);
    doc.font('Helvetica-Oblique').fontSize(10).fillColor(TEXT).text(
      '"Those we love don\'t go away, they walk beside us every day. Unseen, unheard, but always near; still loved, still missed, and very dear."',
      m + 20, doc.y, { width: w - 40, align: 'center', lineGap: 3 }
    );

    // ── Page 7: Acknowledgments / Pallbearers ───────────────────────────
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(14).fillColor(ROYAL_PURPLE).text('Acknowledgments', m, 40, { width: w, align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(m, doc.y).lineTo(m + w, doc.y).strokeColor(GOLD).lineWidth(1).stroke();
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9.5).fillColor(TEXT).text(
      'The family of ' + name + ' sincerely thanks each and every one of you for the many acts of kindness, expressions of sympathy, prayers, and support extended during this time. Your love and generosity have been a tremendous blessing and source of comfort.',
      m + 8, doc.y, { width: w - 16, align: 'center', lineGap: 2 }
    );
    doc.moveDown(2);
    renderPallbearers(doc, c, m, w, ROYAL_PURPLE);

    // ── Page 8: Back Cover ──────────────────────────────────────────────
    doc.addPage();
    doc.rect(0, 0, 396, 612).fill(ROYAL_PURPLE);
    doc.font('Helvetica-Oblique').fontSize(11).fillColor(GOLD).text(
      '"Precious in the sight of the Lord is the death of his saints." — Psalm 116:15',
      m, 200, { width: w, align: 'center', lineGap: 3 }
    );
    doc.moveDown(3);
    doc.font('Helvetica').fontSize(10).fillColor('#ffffff').text(name, m, doc.y, { width: w, align: 'center' });
    doc.moveDown(0.3);
    if (dob && dod) doc.text(`${dob} — ${dod}`, m, doc.y, { width: w, align: 'center' });
    renderFuneralHomeFooter(doc, m, 550, w, GOLD);

    doc.end();
    return promise;
  },
};

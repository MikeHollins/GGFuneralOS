import PDFDocument from 'pdfkit';

/**
 * Program Template Interface — all templates implement this.
 *
 * Bifold standard: 8.5x11 landscape → 5.5x8.5 folded
 * 8-page booklet: 4 sheets, saddle-stapled
 */

export interface CaseData {
  decedent_first_name: string;
  decedent_middle_name: string | null;
  decedent_last_name: string;
  decedent_aka: string | null;
  date_of_birth: string | null;
  date_of_death: string | null;
  service_date: string | null;
  service_time: string | null;
  service_location: string | null;
  visitation_date: string | null;
  visitation_location: string | null;
  committal_location: string | null;
  officiant_name: string | null;
  music_selections: any[];
  readings: any[];
  pallbearers: any[];
  honorary_pallbearers: any[];
  special_requests: string | null;
  cemetery_name: string | null;
  disposition_type: string | null;
  armed_forces: boolean;
  open_casket: boolean | null;
}

export interface ObituaryData {
  full_text: string;
  summary_text?: string;
  survivors_list?: any[];
}

export interface ProgramTemplate {
  id: string;
  name: string;
  pageCount: 4 | 8;
  culturalContext: string[];
  description: string;
  render(caseData: CaseData, obituary: ObituaryData | null, photoUrls?: string[]): Promise<Buffer>;
}

// ─── Shared Rendering Utilities ─────────────────────────────────────────────

export function fullName(c: CaseData): string {
  return [c.decedent_first_name, c.decedent_middle_name, c.decedent_last_name]
    .filter(Boolean).join(' ');
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function createBifoldDoc(): PDFKit.PDFDocument {
  return new PDFDocument({
    size: [792, 612], // 11x8.5 landscape
    layout: 'landscape',
    margins: { top: 36, bottom: 36, left: 36, right: 36 },
  });
}

export function createBookletDoc(): PDFKit.PDFDocument {
  return new PDFDocument({
    size: [396, 612], // 5.5x8.5 portrait (individual pages of the booklet)
    margins: { top: 36, bottom: 36, left: 30, right: 30 },
  });
}

export function bufferFromDoc(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

export function renderPhotoPlaceholder(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, color: string = '#e5e7eb'): void {
  doc.rect(x, y, w, h).strokeColor(color).lineWidth(1).stroke();
  doc.font('Helvetica').fontSize(8).fillColor('#999').text('Photo', x, y + h / 2 - 4, { width: w, align: 'center' });
}

export function renderOrderOfService(doc: PDFKit.PDFDocument, c: CaseData, x: number, y: number, w: number, titleColor: string, accentColor: string): void {
  doc.font('Helvetica-Bold').fontSize(14).fillColor(titleColor).text('Order of Service', x, y, { width: w, align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(x + w * 0.3, doc.y).lineTo(x + w * 0.7, doc.y).strokeColor(accentColor).lineWidth(1.5).stroke();
  doc.moveDown(1);

  const items: string[] = [
    'Processional',
    c.officiant_name ? `Opening Prayer — ${c.officiant_name}` : 'Opening Prayer',
    'Scripture Reading',
  ];

  const music = c.music_selections || [];
  items.push(music.length > 0 ? `Musical Selection — ${(music[0]?.title || music[0] || '')}` : 'Musical Selection');
  items.push('Reflections & Remarks');
  items.push('Reading of Obituary');

  const readings = c.readings || [];
  for (const r of readings) items.push(r.type ? `${r.type} — ${r.text || ''}` : r.text || 'Reading');

  items.push(music.length > 1 ? `Musical Selection — ${(music[1]?.title || music[1] || '')}` : 'Musical Selection');
  items.push('Eulogy');
  items.push(c.officiant_name ? `Benediction — ${c.officiant_name}` : 'Recessional');
  if (c.cemetery_name) items.push(`Committal — ${c.cemetery_name}`);

  for (const item of items) {
    doc.font('Helvetica').fontSize(10).fillColor('#333').text(item, x + 12, doc.y, { width: w - 24 });
    doc.moveDown(0.4);
  }
}

export function renderPallbearers(doc: PDFKit.PDFDocument, c: CaseData, x: number, w: number, titleColor: string): void {
  const pall = c.pallbearers || [];
  if (pall.length > 0) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(titleColor).text('Pallbearers', x, doc.y, { width: w, align: 'center' });
    doc.moveDown(0.3);
    const names = pall.map((p: any) => p.name || p).join('   •   ');
    doc.font('Helvetica').fontSize(9).fillColor('#555').text(names, x + 8, doc.y, { width: w - 16, align: 'center' });
    doc.moveDown(1);
  }

  const hon = c.honorary_pallbearers || [];
  if (hon.length > 0) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(titleColor).text('Honorary Pallbearers', x, doc.y, { width: w, align: 'center' });
    doc.moveDown(0.3);
    const names = hon.map((p: any) => p.name || p).join('   •   ');
    doc.font('Helvetica').fontSize(9).fillColor('#555').text(names, x + 8, doc.y, { width: w - 16, align: 'center' });
    doc.moveDown(1);
  }
}

export function renderFuneralHomeFooter(doc: PDFKit.PDFDocument, x: number, y: number, w: number, accentColor: string): void {
  const homeName = process.env.FUNERAL_HOME_NAME || 'KC Golden Gate Funeral Home';
  const homeCity = 'Kansas City, Missouri';
  const homeUrl = process.env.FUNERAL_HOME_WEBSITE || 'kcgoldengate.com';

  doc.moveTo(x, y).lineTo(x + w, y).strokeColor('#ddd').lineWidth(0.5).stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(accentColor).text(homeName, x, y + 8, { width: w, align: 'center' });
  doc.font('Helvetica').fontSize(7).fillColor('#999').text(`${homeCity} • ${homeUrl}`, x, y + 20, { width: w, align: 'center' });
}

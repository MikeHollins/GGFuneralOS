import PDFDocument from 'pdfkit';

/**
 * Funeral Program Generator — Design Agent
 *
 * Generates a bifold funeral program:
 * - Unfolded: 8.5" x 11" (landscape orientation)
 * - Folded: 5.5" x 8.5"
 * - 4 panels: Front Cover, Inside Left (Order of Service), Inside Right (Obituary), Back Cover
 *
 * PDFKit uses points (1 inch = 72 points)
 * Letter landscape: 792 x 612 points
 * Each panel: 396 x 612 points
 */

const BRAND_COLOR = '#1a1a2e';
const ACCENT_COLOR = '#c9a96e';  // gold
const TEXT_COLOR = '#333333';
const MUTED_COLOR = '#666666';
const RULE_COLOR = '#d4d4d4';

interface CaseData {
  decedent_first_name: string;
  decedent_middle_name: string | null;
  decedent_last_name: string;
  date_of_birth: string | null;
  date_of_death: string | null;
  service_date: string | null;
  service_time: string | null;
  service_location: string | null;
  visitation_date: string | null;
  officiant_name: string | null;
  music_selections: any[];
  readings: any[];
  pallbearers: any[];
  honorary_pallbearers: any[];
  special_requests: string | null;
  cemetery_name: string | null;
}

interface ObituaryData {
  full_text: string;
  survivors_list: any[];
}

export async function generateProgram(
  caseData: CaseData,
  obituary: ObituaryData | null,
  _templateName: string = 'classic-elegant'
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Landscape letter: 11" wide x 8.5" tall
    const doc = new PDFDocument({
      size: [792, 612],
      layout: 'landscape',
      margins: { top: 36, bottom: 36, left: 36, right: 36 },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fullName = [caseData.decedent_first_name, caseData.decedent_middle_name, caseData.decedent_last_name]
      .filter(Boolean).join(' ');
    const dob = caseData.date_of_birth ? formatDate(caseData.date_of_birth) : '';
    const dod = caseData.date_of_death ? formatDate(caseData.date_of_death) : '';

    const panelWidth = 396;
    const panelHeight = 612;
    const margin = 36;
    const contentWidth = panelWidth - margin * 2;

    // ─── PAGE 1: BACK COVER (left) + FRONT COVER (right) ─────────────────
    // When folded, the right half becomes the front cover

    // Back Cover (Panel 4 — left side of page 1)
    renderBackCover(doc, caseData, 0, margin, contentWidth, panelHeight);

    // Front Cover (Panel 1 — right side of page 1)
    renderFrontCover(doc, fullName, dob, dod, panelWidth, margin, contentWidth, panelHeight);

    // ─── PAGE 2: INSIDE LEFT + INSIDE RIGHT ──────────────────────────────
    doc.addPage();

    // Inside Left (Panel 2 — Order of Service)
    renderOrderOfService(doc, caseData, 0, margin, contentWidth, panelHeight);

    // Inside Right (Panel 3 — Obituary)
    renderObituary(doc, obituary, panelWidth, margin, contentWidth, panelHeight);

    doc.end();
  });
}

function renderFrontCover(
  doc: PDFKit.PDFDocument,
  fullName: string, dob: string, dod: string,
  panelX: number, margin: number, contentWidth: number, panelHeight: number
): void {
  const x = panelX + margin;
  const centerX = panelX + contentWidth / 2 + margin;

  // Background accent bar at top
  doc.rect(panelX, 0, 396, 4).fill(ACCENT_COLOR);

  // "In Loving Memory of"
  doc.y = 120;
  doc
    .font('Helvetica')
    .fontSize(12)
    .fillColor(MUTED_COLOR)
    .text('In Loving Memory of', x, doc.y, { width: contentWidth, align: 'center' });

  doc.moveDown(1.5);

  // Name
  doc
    .font('Helvetica-Bold')
    .fontSize(28)
    .fillColor(BRAND_COLOR)
    .text(fullName, x, doc.y, { width: contentWidth, align: 'center' });

  doc.moveDown(1);

  // Decorative rule
  const ruleY = doc.y;
  doc
    .moveTo(centerX - 40, ruleY)
    .lineTo(centerX + 40, ruleY)
    .strokeColor(ACCENT_COLOR)
    .lineWidth(2)
    .stroke();

  doc.moveDown(1);

  // Dates
  if (dob && dod) {
    doc
      .font('Helvetica')
      .fontSize(13)
      .fillColor(TEXT_COLOR)
      .text(`Sunrise: ${dob}`, x, doc.y, { width: contentWidth, align: 'center' });
    doc.moveDown(0.3);
    doc
      .text(`Sunset: ${dod}`, x, doc.y, { width: contentWidth, align: 'center' });
  }

  // Photo placeholder
  doc.moveDown(2);
  doc
    .rect(centerX - 60, doc.y, 120, 140)
    .strokeColor(RULE_COLOR)
    .lineWidth(1)
    .stroke();
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED_COLOR)
    .text('Photo', centerX - 60, doc.y + 60, { width: 120, align: 'center' });

  // Bottom accent bar
  doc.rect(panelX, panelHeight - 4, 396, 4).fill(ACCENT_COLOR);
}

function renderOrderOfService(
  doc: PDFKit.PDFDocument,
  caseData: CaseData,
  panelX: number, margin: number, contentWidth: number, _panelHeight: number
): void {
  const x = panelX + margin;

  doc.y = 40;
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(BRAND_COLOR)
    .text('Order of Service', x, doc.y, { width: contentWidth, align: 'center' });

  doc.moveDown(0.5);
  doc.moveTo(x, doc.y).lineTo(x + contentWidth, doc.y).strokeColor(ACCENT_COLOR).lineWidth(1.5).stroke();
  doc.moveDown(1);

  const orderItems = [
    { label: 'Processional', detail: '' },
    { label: 'Opening Prayer / Invocation', detail: caseData.officiant_name || '' },
    { label: 'Scripture Reading', detail: '' },
  ];

  // Add music selections
  const music = caseData.music_selections || [];
  if (music.length > 0) {
    orderItems.push({ label: 'Musical Selection', detail: music.map((m: any) => m.title || m).join(', ') });
  } else {
    orderItems.push({ label: 'Musical Selection', detail: '' });
  }

  orderItems.push(
    { label: 'Reflections & Remarks', detail: 'Family and Friends' },
    { label: 'Reading of Obituary', detail: '' },
  );

  // Add readings
  const readings = caseData.readings || [];
  if (readings.length > 0) {
    for (const r of readings) {
      orderItems.push({ label: r.type || 'Reading', detail: r.text || '' });
    }
  }

  orderItems.push(
    { label: 'Musical Selection', detail: '' },
    { label: 'Eulogy', detail: '' },
    { label: 'Recessional / Closing Prayer', detail: caseData.officiant_name || '' },
  );

  if (caseData.cemetery_name) {
    orderItems.push({ label: 'Committal', detail: caseData.cemetery_name });
  }

  for (const item of orderItems) {
    doc
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .fillColor(TEXT_COLOR)
      .text(item.label, x + 8, doc.y, { width: contentWidth - 16 });

    if (item.detail) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(MUTED_COLOR)
        .text(item.detail, x + 16, doc.y, { width: contentWidth - 24 });
    }

    doc.moveDown(0.5);
  }
}

function renderObituary(
  doc: PDFKit.PDFDocument,
  obituary: ObituaryData | null,
  panelX: number, margin: number, contentWidth: number, _panelHeight: number
): void {
  const x = panelX + margin;

  doc.y = 40;
  doc
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(BRAND_COLOR)
    .text('Life Story', x, doc.y, { width: contentWidth, align: 'center' });

  doc.moveDown(0.5);
  doc.moveTo(x, doc.y).lineTo(x + contentWidth, doc.y).strokeColor(ACCENT_COLOR).lineWidth(1.5).stroke();
  doc.moveDown(1);

  const text = obituary?.full_text || 'Obituary text will be placed here once approved by the family.';

  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor(TEXT_COLOR)
    .text(text, x + 4, doc.y, { width: contentWidth - 8, lineGap: 2.5 });
}

function renderBackCover(
  doc: PDFKit.PDFDocument,
  caseData: CaseData,
  panelX: number, margin: number, contentWidth: number, panelHeight: number
): void {
  const x = panelX + margin;

  doc.y = 40;

  // Acknowledgment
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor(BRAND_COLOR)
    .text('Acknowledgments', x, doc.y, { width: contentWidth, align: 'center' });

  doc.moveDown(0.5);
  doc.moveTo(x, doc.y).lineTo(x + contentWidth, doc.y).strokeColor(ACCENT_COLOR).lineWidth(1.5).stroke();
  doc.moveDown(1);

  doc
    .font('Helvetica')
    .fontSize(9.5)
    .fillColor(TEXT_COLOR)
    .text(
      'The family sincerely thanks you for your expressions of love, prayers, and support during this time. Your presence and kindness mean more than words can express.',
      x + 4, doc.y, { width: contentWidth - 8, lineGap: 2, align: 'center' }
    );

  doc.moveDown(1.5);

  // Pallbearers
  const pallbearers = caseData.pallbearers || [];
  if (pallbearers.length > 0) {
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(BRAND_COLOR)
      .text('Pallbearers', x, doc.y, { width: contentWidth, align: 'center' });
    doc.moveDown(0.5);

    const names = pallbearers.map((p: any) => p.name || p).join('   •   ');
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(TEXT_COLOR)
      .text(names, x + 4, doc.y, { width: contentWidth - 8, align: 'center' });

    doc.moveDown(1);
  }

  // Honorary pallbearers
  const honorary = caseData.honorary_pallbearers || [];
  if (honorary.length > 0) {
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(BRAND_COLOR)
      .text('Honorary Pallbearers', x, doc.y, { width: contentWidth, align: 'center' });
    doc.moveDown(0.5);

    const names = honorary.map((p: any) => p.name || p).join('   •   ');
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(TEXT_COLOR)
      .text(names, x + 4, doc.y, { width: contentWidth - 8, align: 'center' });

    doc.moveDown(1);
  }

  // Funeral home footer
  const footerY = panelHeight - 60;
  doc
    .moveTo(x, footerY)
    .lineTo(x + contentWidth, footerY)
    .strokeColor(RULE_COLOR)
    .lineWidth(0.5)
    .stroke();

  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(ACCENT_COLOR)
    .text('KC Golden Gate Funeral Home', x, footerY + 10, { width: contentWidth, align: 'center' });

  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(MUTED_COLOR)
    .text('Kansas City, Missouri • kcgoldengate.com', x, footerY + 24, { width: contentWidth, align: 'center' });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

import PDFDocument from 'pdfkit';

/**
 * Authorization Document Generator — Compliance Agent
 *
 * Generates PDFs for DocuSign signing:
 * - Embalming authorization
 * - Cremation authorization (UETA-compliant for MO)
 * - Service contract / Statement of Goods and Services
 * - Insurance assignment form
 *
 * Each PDF includes DocuSign anchor tags (/sig1/, /date1/) for signature placement.
 */

const FUNERAL_HOME = process.env.FUNERAL_HOME_NAME || 'KC Golden Gate Funeral Home';
const FUNERAL_HOME_ADDR = process.env.FUNERAL_HOME_ADDRESS || 'Kansas City, MO';
const FUNERAL_HOME_PHONE = process.env.FUNERAL_HOME_PHONE || '';

export async function generateAuthDocument(
  caseData: any,
  signerContact: any,
  docType: string
): Promise<{ pdfBuffer: Buffer; documentName: string }> {
  switch (docType) {
    case 'embalming_auth': return generateEmbalmingAuth(caseData, signerContact);
    case 'cremation_auth': return generateCremationAuth(caseData, signerContact);
    case 'service_contract': return generateServiceContract(caseData, signerContact);
    case 'insurance_assignment': return generateInsuranceAssignment(caseData, signerContact);
    default: throw new Error(`Unknown doc_type: ${docType}`);
  }
}

async function generateEmbalmingAuth(caseData: any, signer: any): Promise<{ pdfBuffer: Buffer; documentName: string }> {
  const fullName = decedentName(caseData);
  const signerName = `${signer.first_name} ${signer.last_name || ''}`.trim();

  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 72, bottom: 72, left: 72, right: 72 } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve({ pdfBuffer: Buffer.concat(chunks), documentName: `Embalming Authorization — ${fullName}.pdf` }));
    doc.on('error', reject);

    renderHeader(doc, 'AUTHORIZATION FOR EMBALMING');
    doc.moveDown(2);
    doc.font('Helvetica').fontSize(11).fillColor('#333');

    doc.text(`I, ${signerName}, as the authorized representative for ${fullName}, deceased, hereby authorize ${FUNERAL_HOME} to embalm the remains of the above-named decedent.`);
    doc.moveDown();
    doc.text('I understand that:');
    doc.moveDown(0.5);
    doc.text('1. Embalming is not required by law in most cases.', { indent: 20 });
    doc.text('2. Embalming may be necessary for viewing, visitation, or if the funeral is delayed.', { indent: 20 });
    doc.text('3. I have the right to choose arrangements that do not require embalming, such as direct cremation or immediate burial.', { indent: 20 });
    doc.moveDown(2);

    renderDecedentInfo(doc, caseData);
    renderSignatureBlock(doc, signerName, signer.relationship || 'Authorized Representative');

    doc.end();
  });
}

async function generateCremationAuth(caseData: any, signer: any): Promise<{ pdfBuffer: Buffer; documentName: string }> {
  const fullName = decedentName(caseData);
  const signerName = `${signer.first_name} ${signer.last_name || ''}`.trim();

  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 72, bottom: 72, left: 72, right: 72 } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve({ pdfBuffer: Buffer.concat(chunks), documentName: `Cremation Authorization — ${fullName}.pdf` }));
    doc.on('error', reject);

    renderHeader(doc, 'AUTHORIZATION FOR CREMATION');
    doc.moveDown(2);
    doc.font('Helvetica').fontSize(11).fillColor('#333');

    doc.text(`I, ${signerName}, as the legal next of kin / authorized representative for ${fullName}, deceased, hereby authorize ${FUNERAL_HOME} and its designated crematory to cremate the remains of the above-named decedent.`);
    doc.moveDown();
    doc.text('I hereby represent and warrant that:');
    doc.moveDown(0.5);
    doc.text('1. I am the person with the legal right to authorize cremation under Missouri law (RSMo 194.400).', { indent: 20 });
    doc.text('2. I have made reasonable effort to contact all persons of equal or higher priority in the next-of-kin hierarchy.', { indent: 20 });
    doc.text('3. There are no objections to cremation from any person with equal or higher legal authority.', { indent: 20 });
    doc.text(`4. To my knowledge, the decedent ${caseData.pacemaker_present ? 'HAS' : 'DOES NOT HAVE'} a pacemaker or other implanted mechanical device.`, { indent: 20 });
    doc.text('5. I understand that cremation is irreversible and that identification of remains is impossible after cremation.', { indent: 20 });
    doc.moveDown();
    doc.text('I agree to hold harmless and indemnify the funeral home and crematory from any claims arising from this authorization.');
    doc.moveDown(2);

    renderDecedentInfo(doc, caseData);
    renderSignatureBlock(doc, signerName, signer.relationship || 'Authorized Next of Kin');

    doc.end();
  });
}

async function generateServiceContract(caseData: any, signer: any): Promise<{ pdfBuffer: Buffer; documentName: string }> {
  const fullName = decedentName(caseData);
  const signerName = `${signer.first_name} ${signer.last_name || ''}`.trim();

  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 72, bottom: 72, left: 72, right: 72 } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve({ pdfBuffer: Buffer.concat(chunks), documentName: `Service Agreement — ${fullName}.pdf` }));
    doc.on('error', reject);

    renderHeader(doc, 'STATEMENT OF FUNERAL GOODS AND SERVICES SELECTED');
    doc.moveDown();
    doc.font('Helvetica').fontSize(9).fillColor('#666');
    doc.text('Pursuant to the Federal Trade Commission Funeral Rule (16 CFR Part 453)');
    doc.moveDown(2);
    doc.font('Helvetica').fontSize(11).fillColor('#333');

    doc.text(`Decedent: ${fullName}`);
    doc.text(`Date of Death: ${caseData.date_of_death || 'TBD'}`);
    doc.text(`Type of Service: ${caseData.service_type || 'TBD'}`);
    doc.text(`Disposition: ${caseData.disposition_type || 'TBD'}`);
    doc.moveDown();

    // Itemized charges
    doc.font('Helvetica-Bold').text('ITEMIZED CHARGES:');
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(10);

    const items: [string, string][] = [];
    if (caseData.casket_selection) items.push([`Casket: ${caseData.casket_selection}`, `$${(caseData.casket_price || 0).toFixed(2)}`]);
    if (caseData.vault_selection) items.push([`Vault: ${caseData.vault_selection}`, `$${(caseData.vault_price || 0).toFixed(2)}`]);
    if (caseData.urn_selection) items.push([`Urn: ${caseData.urn_selection}`, `$${(caseData.urn_price || 0).toFixed(2)}`]);
    items.push(['Professional Services', 'See General Price List']);

    if (caseData.total_charges) {
      items.push(['', '']);
      items.push(['TOTAL', `$${Number(caseData.total_charges).toFixed(2)}`]);
    }

    for (const [desc, amt] of items) {
      if (desc === 'TOTAL') doc.font('Helvetica-Bold');
      doc.text(`${desc}`, 72, doc.y, { width: 350, continued: !!amt });
      if (amt) doc.text(amt, { align: 'right', width: 100 });
      doc.font('Helvetica');
    }

    doc.moveDown(2);
    doc.font('Helvetica').fontSize(9).fillColor('#666');
    doc.text('"The goods and services shown above are those you have selected. You are entitled to choose only those goods and services you want. However, any legal, cemetery, or crematory requirements will be explained to you."');
    doc.moveDown(2);

    renderSignatureBlock(doc, signerName, 'Purchaser / Authorized Representative');

    doc.end();
  });
}

async function generateInsuranceAssignment(caseData: any, signer: any): Promise<{ pdfBuffer: Buffer; documentName: string }> {
  const fullName = decedentName(caseData);
  const signerName = `${signer.first_name} ${signer.last_name || ''}`.trim();

  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 72, bottom: 72, left: 72, right: 72 } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve({ pdfBuffer: Buffer.concat(chunks), documentName: `Insurance Assignment — ${fullName}.pdf` }));
    doc.on('error', reject);

    renderHeader(doc, 'ASSIGNMENT OF LIFE INSURANCE BENEFITS');
    doc.moveDown(2);
    doc.font('Helvetica').fontSize(11).fillColor('#333');

    doc.text(`I, ${signerName}, as the beneficiary of life insurance policy number ${caseData.insurance_policy_number || '____________'} issued by ${caseData.insurance_carrier || '________________________'} on the life of ${fullName}, deceased, do hereby irrevocably assign to ${FUNERAL_HOME} all benefits payable under said policy, up to the total amount owed for funeral services and merchandise.`);
    doc.moveDown();
    doc.text(`I authorize the insurance company to pay directly to ${FUNERAL_HOME} the proceeds of the above-referenced policy. Any proceeds in excess of the funeral home charges shall be returned to the undersigned beneficiary.`);
    doc.moveDown();
    doc.text(`Policy Number: ${caseData.insurance_policy_number || '____________'}`);
    doc.text(`Insurance Company: ${caseData.insurance_carrier || '________________________'}`);
    doc.text(`Estimated Benefit Amount: $${caseData.total_charges ? Number(caseData.total_charges).toFixed(2) : '____________'}`);
    doc.moveDown(2);

    renderSignatureBlock(doc, signerName, 'Policy Beneficiary');

    doc.end();
  });
}

// ─── Helpers ─────────────────────���───────────────��──────────────────────────

function decedentName(c: any): string {
  return [c.decedent_first_name, c.decedent_middle_name, c.decedent_last_name].filter(Boolean).join(' ');
}

function renderHeader(doc: PDFKit.PDFDocument, title: string): void {
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#c9a96e').text(FUNERAL_HOME, { align: 'center' });
  doc.font('Helvetica').fontSize(8).fillColor('#666').text(`${FUNERAL_HOME_ADDR}  •  ${FUNERAL_HOME_PHONE}`, { align: 'center' });
  doc.moveDown(2);
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#1a1a2e').text(title, { align: 'center' });
}

function renderDecedentInfo(doc: PDFKit.PDFDocument, c: any): void {
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#333').text('DECEDENT INFORMATION:');
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(10);
  doc.text(`Name: ${decedentName(c)}`);
  if (c.date_of_death) doc.text(`Date of Death: ${c.date_of_death}`);
  if (c.date_of_birth) doc.text(`Date of Birth: ${c.date_of_birth}`);
  doc.moveDown();
}

function renderSignatureBlock(doc: PDFKit.PDFDocument, signerName: string, title: string): void {
  const y = doc.y + 20;
  doc.font('Helvetica').fontSize(10).fillColor('#333');

  // DocuSign anchor tags — invisible but parsed by DocuSign
  doc.text('/sig1/', 72, y, { width: 250 });
  doc.moveDown(0.5);
  doc.moveTo(72, doc.y).lineTo(300, doc.y).stroke('#333');
  doc.moveDown(0.3);
  doc.text(`${signerName}`, 72);
  doc.text(`${title}`, 72);
  doc.moveDown();

  doc.text('/date1/', 350, y);
  doc.moveDown(0.5);
  doc.moveTo(350, doc.y).lineTo(520, doc.y).stroke('#333');
  doc.moveDown(0.3);
  doc.text('Date', 350);
}

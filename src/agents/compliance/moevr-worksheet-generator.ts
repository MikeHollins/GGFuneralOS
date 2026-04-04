import PDFDocument from 'pdfkit';
import { mapCaseToMoEVR, MoEVRDemographic } from './mo-death-cert';

/**
 * MoEVR Worksheet PDF Generator — Compliance Agent
 *
 * Generates a print-ready worksheet that mirrors the Missouri Electronic
 * Vital Records (MoEVR) demographic form. Director prints this and copies
 * into the MoEVR browser interface.
 *
 * Missing fields are highlighted in red so the director knows what to collect.
 */

export async function generateMoEVRWorksheet(
  caseData: any,
  contacts: any[]
): Promise<Buffer> {
  const demo = mapCaseToMoEVR(caseData, contacts);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 48, bottom: 48, left: 48, right: 48 } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const w = 516; // page width - margins
    const m = 48;

    // ── Header ──────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1a1a2e').text('MISSOURI DEATH CERTIFICATE', m, 48, { width: w, align: 'center' });
    doc.font('Helvetica').fontSize(8).fillColor('#666').text('DEMOGRAPHIC WORKSHEET — Pre-filled from GGFuneralOS', { width: w, align: 'center' });
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(7).fillColor('#999').text(`Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} | Case: GG-${caseData.case_number || ''}`, { width: w, align: 'center' });
    doc.moveDown(0.5);

    // Completion bar
    const pct = demo.fields_total > 0 ? Math.round((demo.fields_complete / demo.fields_total) * 100) : 0;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(pct === 100 ? '#16a34a' : '#dc2626');
    doc.text(`Completion: ${demo.fields_complete}/${demo.fields_total} fields (${pct}%)`, { width: w, align: 'center' });
    if (demo.missing_fields.length > 0) {
      doc.font('Helvetica').fontSize(7).fillColor('#dc2626');
      doc.text(`Missing: ${demo.missing_fields.join(', ')}`, { width: w, align: 'center' });
    }
    doc.moveDown(1);
    doc.moveTo(m, doc.y).lineTo(m + w, doc.y).strokeColor('#ddd').lineWidth(0.5).stroke();
    doc.moveDown(0.5);

    // ── Section A: Decedent ─────────────────────────────────────────────
    sectionHeader(doc, 'SECTION A — DECEDENT INFORMATION', m, w);

    fieldRow(doc, '1. Legal Name', demo.legal_name, m, w);
    fieldRow(doc, '2. AKA / Maiden Name', demo.aka, m, w);
    fieldRow(doc, '3. Sex', demo.sex, m, w, true);
    fieldRow(doc, '4. Date of Birth', demo.date_of_birth, m, w, true);
    fieldRow(doc, '5. Age', demo.age, m, w, true);
    fieldRow(doc, '6. Social Security Number', demo.ssn, m, w, true);
    fieldRow(doc, '7. Birthplace (state/country)', demo.birthplace, m, w, true);
    fieldRow(doc, '8. Armed Forces?', demo.armed_forces ? 'Yes' : 'No', m, w);
    fieldRow(doc, '9. Marital Status', demo.marital_status, m, w, true);
    fieldRow(doc, '10. Surviving Spouse', demo.surviving_spouse, m, w);
    fieldRow(doc, '11. Occupation', demo.occupation, m, w, true);
    fieldRow(doc, '12. Industry', demo.industry, m, w);
    fieldRow(doc, '13. Education', demo.education, m, w, true);

    // ── Section B: Race/Ethnicity ───────────────────────────────────────
    sectionHeader(doc, 'SECTION B — RACE & ETHNICITY', m, w);

    fieldRow(doc, '14. Race', demo.race, m, w, true);
    fieldRow(doc, '15. Hispanic Origin', demo.hispanic_origin, m, w);

    // ── Section C: Residence ────────────────────────────────────────────
    sectionHeader(doc, 'SECTION C — RESIDENCE', m, w);

    fieldRow(doc, '16. State', demo.residence_state, m, w, true);
    fieldRow(doc, '17. County', demo.residence_county, m, w);
    fieldRow(doc, '18. City/Town', demo.residence_city, m, w, true);
    fieldRow(doc, '19. Street & Number', demo.residence_street, m, w, true);
    fieldRow(doc, '20. Zip Code', demo.residence_zip, m, w, true);
    fieldRow(doc, '21. Inside City Limits?', demo.inside_city_limits === null ? null : (demo.inside_city_limits ? 'Yes' : 'No'), m, w);

    // ── Section D: Parents ──────────────────────────────────────────────
    sectionHeader(doc, 'SECTION D — PARENTS', m, w);

    fieldRow(doc, '22. Father\'s Name', demo.father_name, m, w, true);
    fieldRow(doc, '23. Mother\'s Maiden Name', demo.mother_maiden_name, m, w, true);

    // New page if needed
    if (doc.y > 650) doc.addPage();

    // ── Section E: Informant ────────────────────────────────────────────
    sectionHeader(doc, 'SECTION E — INFORMANT', m, w);

    fieldRow(doc, '24. Informant Name', demo.informant_name, m, w, true);
    fieldRow(doc, '25. Relationship', demo.informant_relationship, m, w, true);
    fieldRow(doc, '26. Informant Address', demo.informant_address, m, w);

    // ── Section F: Place of Death ───────────────────────────────────────
    sectionHeader(doc, 'SECTION F — PLACE OF DEATH', m, w);

    fieldRow(doc, '27. Type', demo.place_of_death_type, m, w);
    fieldRow(doc, '28. Facility Name', demo.facility_name, m, w);
    fieldRow(doc, '29. City', demo.death_city, m, w, true);
    fieldRow(doc, '30. County', demo.death_county, m, w, true);
    fieldRow(doc, '31. State', demo.death_state, m, w);
    fieldRow(doc, '32. Zip Code', demo.death_zip, m, w);

    // ── Section G: Disposition ──────────────────────────────────────────
    sectionHeader(doc, 'SECTION G — DISPOSITION', m, w);

    fieldRow(doc, '33. Method', demo.disposition_method, m, w, true);
    fieldRow(doc, '34. Place', demo.disposition_place, m, w);
    fieldRow(doc, '35. City, State', demo.disposition_city_state, m, w);
    fieldRow(doc, '36. Funeral Director', demo.funeral_director_name, m, w);
    fieldRow(doc, '37. License #', demo.funeral_director_license, m, w);
    fieldRow(doc, '38. Funeral Home', demo.funeral_home_name, m, w);
    fieldRow(doc, '39. Address', demo.funeral_home_address, m, w);
    fieldRow(doc, '40. Date of Disposition', demo.disposition_date, m, w);

    // ── Footer ──────────────────────────────────────────────────────────
    doc.moveDown(2);
    doc.moveTo(m, doc.y).lineTo(m + w, doc.y).strokeColor('#ddd').lineWidth(0.5).stroke();
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(7).fillColor('#999');
    doc.text('Missouri RSMo 193.145 — Death certificate must be filed within 5 days of death.', m, doc.y, { width: w, align: 'center' });
    doc.text('Medical certification must be completed within 72 hours.', { width: w, align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#c9a96e');
    doc.text('KC Golden Gate Funeral Home — GGFuneralOS', { width: w, align: 'center' });

    doc.end();
  });
}

function sectionHeader(doc: PDFKit.PDFDocument, title: string, m: number, w: number): void {
  if (doc.y > 680) doc.addPage();
  doc.moveDown(0.5);
  doc.rect(m, doc.y, w, 16).fill('#f0f0f5');
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#1a1a2e').text(title, m + 6, doc.y + 3, { width: w - 12 });
  doc.y += 20;
}

function fieldRow(doc: PDFKit.PDFDocument, label: string, value: string | null | undefined, m: number, w: number, required = false): void {
  if (doc.y > 700) doc.addPage();
  const isEmpty = !value || value === '' || value === '[ENCRYPTED]';
  const y = doc.y;

  // Label
  doc.font('Helvetica').fontSize(7.5).fillColor('#666').text(label, m + 4, y, { width: 180 });

  // Value (or red "MISSING" indicator)
  if (isEmpty && required) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#dc2626').text('_________ (REQUIRED)', m + 190, y, { width: w - 194 });
  } else if (isEmpty) {
    doc.font('Helvetica').fontSize(8).fillColor('#ccc').text('_________', m + 190, y, { width: w - 194 });
  } else {
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#1a1a2e').text(value!, m + 190, y, { width: w - 194 });
  }

  doc.y = y + 14;
}

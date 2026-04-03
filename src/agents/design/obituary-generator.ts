import { query, queryOne } from '../../db/client';

/**
 * Obituary Generator — Design Agent
 *
 * Generates obituary text from case data + contacts + biographical data.
 * Uses a structured template approach; can be enhanced with LLM for prose.
 */

interface CaseData {
  decedent_first_name: string;
  decedent_middle_name: string | null;
  decedent_last_name: string;
  decedent_aka: string | null;
  date_of_birth: string | null;
  date_of_death: string | null;
  birthplace: string | null;
  residence_city: string | null;
  residence_state: string | null;
  occupation: string | null;
  armed_forces: boolean;
  marital_status: string | null;
  surviving_spouse: string | null;
  service_date: string | null;
  service_time: string | null;
  service_location: string | null;
  visitation_date: string | null;
  visitation_time: string | null;
  visitation_location: string | null;
  cemetery_name: string | null;
  special_requests: string | null;
}

interface Contact {
  first_name: string;
  last_name: string | null;
  relationship: string;
  city: string | null;
  state: string | null;
}

export async function generateObituary(
  caseData: CaseData,
  contacts: Contact[]
): Promise<{ full_text: string; summary_text: string; survivors_list: any[]; preceded_by: any[] }> {
  const fullName = [caseData.decedent_first_name, caseData.decedent_middle_name, caseData.decedent_last_name]
    .filter(Boolean).join(' ');
  const aka = caseData.decedent_aka ? ` (${caseData.decedent_aka})` : '';

  const dob = caseData.date_of_birth ? formatDate(caseData.date_of_birth) : '';
  const dod = caseData.date_of_death ? formatDate(caseData.date_of_death) : '';

  // Get biographical data from obituary table if available
  const obitData = await queryOne(
    'SELECT biographical_data FROM obituaries WHERE case_id = (SELECT id FROM cases WHERE decedent_first_name = $1 AND decedent_last_name = $2 LIMIT 1)',
    [caseData.decedent_first_name, caseData.decedent_last_name]
  );
  const bio: Record<string, string> = (obitData as any)?.biographical_data || {};

  // ─── Build obituary paragraphs ────────────────────────────────────────────

  const paragraphs: string[] = [];

  // Opening
  const city = caseData.residence_city || 'Kansas City';
  const state = caseData.residence_state || 'Missouri';
  paragraphs.push(
    `${fullName}${aka}, ${dob ? `born ${dob}` : ''}${caseData.birthplace ? ` in ${caseData.birthplace}` : ''}, passed away ${dod ? `on ${dod}` : 'recently'}${city ? ` in ${city}, ${state}` : ''}.`
  );

  // Life summary
  if (caseData.occupation) {
    paragraphs.push(
      `${caseData.decedent_first_name} dedicated their career to ${caseData.occupation}${bio.industry ? ` in the ${bio.industry} industry` : ''}.`
    );
  }

  if (caseData.armed_forces) {
    paragraphs.push(
      `${caseData.decedent_first_name} proudly served in the United States Armed Forces.`
    );
  }

  if (bio.church) {
    paragraphs.push(`They were a faithful member of ${bio.church}.`);
  }

  if (bio.organizations) {
    paragraphs.push(`They were actively involved with ${bio.organizations}.`);
  }

  if (bio.hobbies) {
    paragraphs.push(`${caseData.decedent_first_name} enjoyed ${bio.hobbies}.`);
  }

  // Survivors
  const survivors = contacts.filter(c =>
    ['SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'GRANDCHILD'].includes(c.relationship)
  );
  const survivorsList: any[] = [];

  if (caseData.surviving_spouse) {
    survivorsList.push({ relationship: 'spouse', name: caseData.surviving_spouse });
  }

  for (const s of survivors) {
    const name = [s.first_name, s.last_name].filter(Boolean).join(' ');
    const location = s.city ? `of ${s.city}${s.state ? `, ${s.state}` : ''}` : '';
    survivorsList.push({ relationship: s.relationship.toLowerCase(), name, location });
  }

  if (survivorsList.length > 0) {
    const survivorsText = survivorsList.map(s =>
      `${s.name}${s.location ? ` ${s.location}` : ''} (${s.relationship})`
    ).join('; ');
    paragraphs.push(`${caseData.decedent_first_name} is survived by: ${survivorsText}.`);
  }

  // Preceded in death (from bio data)
  const precededBy: any[] = [];
  if (bio.preceded_by_text) {
    paragraphs.push(`${caseData.decedent_first_name} was preceded in death by ${bio.preceded_by_text}.`);
  }

  // Service info
  if (caseData.service_date) {
    const sDate = formatDate(caseData.service_date);
    const sTime = caseData.service_time || '';
    const sLoc = caseData.service_location || 'KC Golden Gate Funeral Home';
    paragraphs.push(`Services will be held ${sDate}${sTime ? ` at ${sTime}` : ''} at ${sLoc}.`);
  }

  if (caseData.visitation_date) {
    const vDate = formatDate(caseData.visitation_date);
    const vTime = caseData.visitation_time || '';
    const vLoc = caseData.visitation_location || 'KC Golden Gate Funeral Home';
    paragraphs.push(`Visitation will be ${vDate}${vTime ? ` at ${vTime}` : ''} at ${vLoc}.`);
  }

  if (caseData.cemetery_name) {
    paragraphs.push(`Interment will follow at ${caseData.cemetery_name}.`);
  }

  // Memorial donations
  paragraphs.push(
    'The family kindly requests that in lieu of flowers, memorial contributions may be made to a charity of your choice.'
  );

  const fullText = paragraphs.join('\n\n');
  const summaryText = paragraphs.slice(0, 2).join(' '); // First two paragraphs for social

  // Store in DB
  await query(
    `INSERT INTO obituaries (case_id, full_text, summary_text, survivors_list, preceded_by, status)
     SELECT c.id, $2, $3, $4, $5, 'DRAFT'
     FROM cases c WHERE c.decedent_first_name = $6 AND c.decedent_last_name = $7
     LIMIT 1
     ON CONFLICT DO NOTHING`,
    [
      null, fullText, summaryText,
      JSON.stringify(survivorsList), JSON.stringify(precededBy),
      caseData.decedent_first_name, caseData.decedent_last_name
    ]
  );

  return { full_text: fullText, summary_text: summaryText, survivors_list: survivorsList, preceded_by: precededBy };
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

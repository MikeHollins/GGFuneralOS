/**
 * Intake Agent — Field Definitions
 *
 * Complete field set for Missouri death certificate + funeral program.
 * Ordered conversationally: warm-up → death cert demographics → sensitive (portal) → obituary → scheduling.
 *
 * 27 fields total. Groups:
 * - warmup: easy, non-sensitive, builds rapport
 * - death_cert: required for MO death certificate (5-day filing deadline)
 * - sensitive: SSN, insurance — redirected to secure portal
 * - obituary: biographical info for the program and obituary
 * - scheduling: arrangement conference booking
 */

export interface IntakeField {
  id: string;
  db_column: string;        // maps to cases table column (prefix _ = obituary biographical_data)
  prompt: string;           // what the agent says to ask for this
  follow_up?: string;       // optional follow-up if they seem unsure
  skip_message: string;     // what to say if they want to skip
  required: boolean;        // required for death certificate or essential operations
  redirect_to_portal?: boolean; // true = send portal link instead of collecting via SMS
  group: 'warmup' | 'death_cert' | 'sensitive' | 'obituary' | 'scheduling';
  sort_order: number;
}

export const INTAKE_FIELDS: IntakeField[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 1: WARM-UP — Easy, non-sensitive, builds rapport
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'full_name',
    db_column: 'decedent_first_name',
    prompt: "Could you confirm the full legal name of your loved one? First, middle, and last name.",
    skip_message: "That's okay — we can come back to this.",
    required: true,
    group: 'warmup',
    sort_order: 1,
  },
  {
    id: 'aka',
    db_column: 'decedent_aka',
    prompt: "Did they go by any other names? A nickname, or a maiden name?",
    skip_message: "No problem.",
    required: false,
    group: 'warmup',
    sort_order: 2,
  },
  {
    id: 'disposition',
    db_column: 'disposition_type',
    prompt: "Has the family had a chance to decide on burial or cremation? It's completely fine if that hasn't been decided yet.",
    follow_up: "We can discuss all the options when we meet. No rush on that decision at all.",
    skip_message: "That's something we can talk through together when we meet.",
    required: false,
    group: 'warmup',
    sort_order: 3,
  },
  {
    id: 'service_type',
    db_column: 'service_type',
    prompt: "Are you thinking of a traditional funeral service, a memorial service, or a celebration of life?",
    follow_up: "We can go over all the options when we meet in person.",
    skip_message: "We'll talk through that together.",
    required: false,
    group: 'warmup',
    sort_order: 4,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 2: DEATH CERTIFICATE DEMOGRAPHICS — Required within 5 days (MO law)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'date_of_birth',
    db_column: 'date_of_birth',
    prompt: "What was their date of birth?",
    skip_message: "We can get that later.",
    required: true,
    group: 'death_cert',
    sort_order: 5,
  },
  {
    id: 'birthplace',
    db_column: 'birthplace',
    prompt: "Where were they born? City and state, or country if outside the US.",
    skip_message: "No worries.",
    required: true,
    group: 'death_cert',
    sort_order: 6,
  },
  {
    id: 'sex',
    db_column: 'sex',
    prompt: "For the official records, what was their sex? Male or female.",
    skip_message: "We can note that later.",
    required: true,
    group: 'death_cert',
    sort_order: 7,
  },
  {
    id: 'marital_status',
    db_column: 'marital_status',
    prompt: "What was their marital status? Married, widowed, divorced, or never married?",
    skip_message: "We can come back to that.",
    required: true,
    group: 'death_cert',
    sort_order: 8,
  },
  {
    id: 'surviving_spouse',
    db_column: 'surviving_spouse',
    prompt: "What is the surviving spouse's full name, including maiden name if applicable?",
    skip_message: "That's fine.",
    required: false,
    group: 'death_cert',
    sort_order: 9,
  },
  {
    id: 'residence',
    db_column: 'residence_street',
    prompt: "What was their home address? Street, city, state, and zip code.",
    skip_message: "We can get that another time.",
    required: true,
    group: 'death_cert',
    sort_order: 10,
  },
  {
    id: 'occupation',
    db_column: 'occupation',
    prompt: "What kind of work did they do during most of their working life?",
    skip_message: "We can skip that for now.",
    required: true,
    group: 'death_cert',
    sort_order: 11,
  },
  {
    id: 'industry',
    db_column: 'industry',
    prompt: "What type of business or industry was that in?",
    skip_message: "That's fine.",
    required: false,
    group: 'death_cert',
    sort_order: 12,
  },
  {
    id: 'education',
    db_column: 'education',
    prompt: "What was the highest level of education they completed? For example: high school, some college, bachelor's degree, etc.",
    skip_message: "We can fill that in later.",
    required: true,
    group: 'death_cert',
    sort_order: 13,
  },
  {
    id: 'race',
    db_column: 'race',
    prompt: "For the death certificate, what was their race? This is a required field on the state form.",
    skip_message: "We can handle that when we meet.",
    required: true,
    group: 'death_cert',
    sort_order: 14,
  },
  {
    id: 'hispanic_origin',
    db_column: 'hispanic_origin',
    prompt: "Were they of Hispanic or Latino origin?",
    skip_message: "Noted.",
    required: true,
    group: 'death_cert',
    sort_order: 15,
  },
  {
    id: 'armed_forces',
    db_column: 'armed_forces',
    prompt: "Did they serve in the US Armed Forces?",
    skip_message: "Okay.",
    required: true,
    group: 'death_cert',
    sort_order: 16,
  },
  {
    id: 'father_name',
    db_column: 'father_name',
    prompt: "What is their father's full name? First, middle, and last.",
    skip_message: "That's okay — we can get that later.",
    required: true,
    group: 'death_cert',
    sort_order: 17,
  },
  {
    id: 'mother_maiden_name',
    db_column: 'mother_maiden_name',
    prompt: "What is their mother's full name before she was first married? First, middle, and maiden name.",
    skip_message: "No problem at all.",
    required: true,
    group: 'death_cert',
    sort_order: 18,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 3: SENSITIVE — Redirected to secure portal (not collected via SMS)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'ssn',
    db_column: 'ssn_encrypted',
    prompt: "We'll need their Social Security Number for the death certificate. For your security, we have a secure link where you can enter that privately.",
    skip_message: "Completely fine — you can provide that when you're ready.",
    required: true,
    redirect_to_portal: true,
    group: 'sensitive',
    sort_order: 19,
  },
  {
    id: 'insurance',
    db_column: 'insurance_carrier',
    prompt: "If there's a life insurance policy, you can enter the company name and policy number through our secure link as well.",
    skip_message: "No rush on that — we can handle insurance details when we meet.",
    required: false,
    redirect_to_portal: true,
    group: 'sensitive',
    sort_order: 20,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 4: OBITUARY & PROGRAM — Biographical info for the service
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'church',
    db_column: '_church',
    prompt: "Were they a member of a church or religious organization?",
    skip_message: "That's fine.",
    required: false,
    group: 'obituary',
    sort_order: 21,
  },
  {
    id: 'organizations',
    db_column: '_organizations',
    prompt: "Were they a member of any clubs, lodges, fraternities, or organizations?",
    skip_message: "No problem.",
    required: false,
    group: 'obituary',
    sort_order: 22,
  },
  {
    id: 'hobbies',
    db_column: '_hobbies',
    prompt: "What did they enjoy doing? Hobbies, interests, passions — anything that captures who they were as a person.",
    skip_message: "We can talk about that when we meet.",
    required: false,
    group: 'obituary',
    sort_order: 23,
  },
  {
    id: 'survivors',
    db_column: '_survivors_text',
    prompt: "Could you list the surviving family members? Start with spouse, then children, grandchildren, parents (if living), and siblings. Include their cities if you know them.",
    skip_message: "We can put that list together later — no rush.",
    required: false,
    group: 'obituary',
    sort_order: 24,
  },
  {
    id: 'preceded_by',
    db_column: '_preceded_by_text',
    prompt: "Was there anyone who preceded them in death? Parents, siblings, children, or spouse?",
    skip_message: "We can come back to that.",
    required: false,
    group: 'obituary',
    sort_order: 25,
  },
  {
    id: 'special_requests',
    db_column: 'special_requests',
    prompt: "Is there anything special the family would like included in the service? Specific songs, readings, cultural traditions, or anything meaningful?",
    skip_message: "We can discuss all of that when we meet.",
    required: false,
    group: 'obituary',
    sort_order: 26,
  },
  {
    id: 'photos',
    db_column: '_photos',
    prompt: "If you have any favorite photos you'd like us to use for the program and tribute, you can send them here or upload them through our secure link anytime.",
    skip_message: "No rush on photos — send them whenever you're ready.",
    required: false,
    redirect_to_portal: true,
    group: 'obituary',
    sort_order: 27,
  },
];

export function getNextField(collectedFields: Set<string>): IntakeField | null {
  for (const field of INTAKE_FIELDS) {
    if (!collectedFields.has(field.id)) return field;
  }
  return null;
}

export function getRequiredIncomplete(collectedFields: Set<string>): IntakeField[] {
  return INTAKE_FIELDS.filter(f => f.required && !collectedFields.has(f.id));
}

export function getDeathCertIncomplete(collectedFields: Set<string>): IntakeField[] {
  return INTAKE_FIELDS.filter(f => f.group === 'death_cert' && !collectedFields.has(f.id));
}

export function getCompletionStats(collectedFields: Set<string>): { total: number; completed: number; deathCertComplete: boolean } {
  const total = INTAKE_FIELDS.length;
  const completed = INTAKE_FIELDS.filter(f => collectedFields.has(f.id)).length;
  const deathCertFields = INTAKE_FIELDS.filter(f => f.group === 'death_cert');
  const deathCertComplete = deathCertFields.every(f => collectedFields.has(f.id));
  return { total, completed, deathCertComplete };
}

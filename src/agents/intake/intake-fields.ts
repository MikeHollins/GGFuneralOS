/**
 * Intake Agent — Field Definitions
 *
 * Fields collected from families via SMS, in conversational order.
 * Each field has a prompt, validation, and mapping to the cases table.
 */

export interface IntakeField {
  id: string;
  db_column: string;        // maps to cases table column
  prompt: string;           // what the agent says to ask for this
  follow_up?: string;       // optional follow-up if they seem unsure
  skip_message: string;     // what to say if they want to skip
  validation?: RegExp;      // optional validation pattern
  required: boolean;
  group: 'identity' | 'service' | 'biographical' | 'survivors' | 'special';
  sort_order: number;
}

export const INTAKE_FIELDS: IntakeField[] = [
  // ── Identity (needed for death certificate) ───────────────────────────────
  {
    id: 'full_name',
    db_column: 'decedent_first_name',
    prompt: "Could you confirm the full legal name of your loved one? First, middle, and last name.",
    skip_message: "That's okay — we can come back to this later.",
    required: true,
    group: 'identity',
    sort_order: 1,
  },
  {
    id: 'date_of_birth',
    db_column: 'date_of_birth',
    prompt: "What was their date of birth?",
    skip_message: "No problem, we can fill that in later.",
    required: true,
    group: 'identity',
    sort_order: 2,
  },
  {
    id: 'ssn',
    db_column: 'ssn_encrypted',
    prompt: "We'll need their Social Security Number for the death certificate. If you don't have it handy right now, we can get it later.",
    skip_message: "Completely fine — you can provide that when you have it available.",
    required: false,
    group: 'identity',
    sort_order: 3,
  },
  {
    id: 'marital_status',
    db_column: 'marital_status',
    prompt: "What was their marital status? Married, widowed, divorced, or never married?",
    skip_message: "We can come back to that.",
    required: true,
    group: 'identity',
    sort_order: 4,
  },
  {
    id: 'surviving_spouse',
    db_column: 'surviving_spouse',
    prompt: "What is the surviving spouse's full name, including maiden name if applicable?",
    skip_message: "That's fine.",
    required: false,
    group: 'identity',
    sort_order: 5,
  },
  {
    id: 'residence',
    db_column: 'residence_street',
    prompt: "What was their home address? Street, city, state, and zip.",
    skip_message: "We can get that another time.",
    required: true,
    group: 'identity',
    sort_order: 6,
  },
  {
    id: 'birthplace',
    db_column: 'birthplace',
    prompt: "Where were they born? City and state, or country if outside the US.",
    skip_message: "No worries.",
    required: true,
    group: 'identity',
    sort_order: 7,
  },
  {
    id: 'father_name',
    db_column: 'father_name',
    prompt: "What is their father's full name?",
    skip_message: "That's okay — we can get that later.",
    required: true,
    group: 'identity',
    sort_order: 8,
  },
  {
    id: 'mother_maiden_name',
    db_column: 'mother_maiden_name',
    prompt: "What is their mother's full name before she was first married (maiden name)?",
    skip_message: "No problem at all.",
    required: true,
    group: 'identity',
    sort_order: 9,
  },
  {
    id: 'occupation',
    db_column: 'occupation',
    prompt: "What kind of work did they do during most of their working life?",
    skip_message: "We can skip that for now.",
    required: true,
    group: 'identity',
    sort_order: 10,
  },
  {
    id: 'education',
    db_column: 'education',
    prompt: "What was the highest level of education they completed?",
    skip_message: "That's fine.",
    required: false,
    group: 'identity',
    sort_order: 11,
  },
  {
    id: 'armed_forces',
    db_column: 'armed_forces',
    prompt: "Did they serve in the US Armed Forces?",
    skip_message: "Okay.",
    required: true,
    group: 'identity',
    sort_order: 12,
  },

  // ── Service Preferences ───────────────────────────────────────────────────
  {
    id: 'disposition',
    db_column: 'disposition_type',
    prompt: "Has the family decided on burial or cremation?",
    follow_up: "It's perfectly fine if that hasn't been decided yet. We can discuss options when we meet.",
    skip_message: "No rush on that decision at all.",
    required: false,
    group: 'service',
    sort_order: 13,
  },
  {
    id: 'service_type',
    db_column: 'service_type',
    prompt: "Are you thinking of a traditional funeral service, a memorial service, or a celebration of life?",
    follow_up: "We can go over all the options when we meet in person.",
    skip_message: "That's something we can talk through together.",
    required: false,
    group: 'service',
    sort_order: 14,
  },

  // ── Biographical (for obituary + program) ─────────────────────────────────
  {
    id: 'survivors',
    db_column: '_survivors_text',
    prompt: "Could you list the surviving family members? Start with spouse, then children, grandchildren, parents (if living), and siblings. Include their cities if you know them.",
    skip_message: "We can put that list together later — no rush.",
    required: false,
    group: 'survivors',
    sort_order: 15,
  },
  {
    id: 'preceded_by',
    db_column: '_preceded_by_text',
    prompt: "Was there anyone who preceded them in death? Parents, siblings, children, or spouse?",
    skip_message: "We can come back to that.",
    required: false,
    group: 'survivors',
    sort_order: 16,
  },
  {
    id: 'church',
    db_column: '_church',
    prompt: "Were they a member of a church or religious organization?",
    skip_message: "That's fine.",
    required: false,
    group: 'biographical',
    sort_order: 17,
  },
  {
    id: 'organizations',
    db_column: '_organizations',
    prompt: "Were they a member of any clubs, lodges, or organizations?",
    skip_message: "No problem.",
    required: false,
    group: 'biographical',
    sort_order: 18,
  },
  {
    id: 'hobbies',
    db_column: '_hobbies',
    prompt: "What did they enjoy doing? Hobbies, interests, passions — anything that captures who they were.",
    skip_message: "We can talk about that when we meet.",
    required: false,
    group: 'biographical',
    sort_order: 19,
  },

  // ── Special Requests ──────────────────────────────────────────────────────
  {
    id: 'special_requests',
    db_column: 'special_requests',
    prompt: "Is there anything special the family would like included in the service? Specific songs, readings, cultural traditions, or anything meaningful?",
    skip_message: "We can discuss all of that when we meet.",
    required: false,
    group: 'special',
    sort_order: 20,
  },
  {
    id: 'photo',
    db_column: '_photo',
    prompt: "If you have a favorite photo you'd like us to use for the program, you can text it to us anytime.",
    skip_message: "No rush on photos — send them whenever you're ready.",
    required: false,
    group: 'special',
    sort_order: 21,
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

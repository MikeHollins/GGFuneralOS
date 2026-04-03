/**
 * Missouri Death Certificate Field Mapper — Compliance Agent
 *
 * Maps case data to Missouri Electronic Vital Records (MoEVR) fields.
 * Missouri law (RSMo 193.145):
 * - Filing within 5 days of death
 * - Medical certification within 72 hours
 *
 * The funeral director completes the demographic section (fields 1-41).
 * The physician/coroner completes the medical certification (fields 42-58).
 */

export interface MoEVRDemographic {
  // Decedent
  legal_name: string;
  aka: string | null;
  sex: string | null;
  date_of_birth: string | null;
  age: string | null;
  ssn: string | null;
  birthplace: string | null;
  armed_forces: boolean;
  marital_status: string | null;
  surviving_spouse: string | null;
  occupation: string | null;
  industry: string | null;
  education: string | null;

  // Residence
  residence_state: string;
  residence_county: string | null;
  residence_city: string | null;
  residence_street: string | null;
  residence_zip: string | null;
  inside_city_limits: boolean | null;

  // Race/ethnicity
  race: string | null;
  hispanic_origin: string | null;

  // Parents
  father_name: string | null;
  mother_maiden_name: string | null;

  // Informant
  informant_name: string | null;
  informant_relationship: string | null;
  informant_address: string | null;

  // Place of death
  place_of_death_type: string | null;
  facility_name: string | null;
  death_city: string | null;
  death_county: string | null;
  death_state: string;
  death_zip: string | null;

  // Disposition
  disposition_method: string | null;
  disposition_place: string | null;
  disposition_city_state: string | null;
  funeral_director_name: string | null;
  funeral_director_license: string | null;
  funeral_home_name: string;
  funeral_home_address: string | null;
  disposition_date: string | null;

  // Completion status
  fields_complete: number;
  fields_total: number;
  missing_fields: string[];
}

export function mapCaseToMoEVR(caseData: any, contacts: any[]): MoEVRDemographic {
  const fullName = [caseData.decedent_first_name, caseData.decedent_middle_name, caseData.decedent_last_name, caseData.decedent_suffix]
    .filter(Boolean).join(' ');

  // Calculate age
  let age: string | null = null;
  if (caseData.date_of_birth && caseData.date_of_death) {
    const dob = new Date(caseData.date_of_birth);
    const dod = new Date(caseData.date_of_death);
    const years = Math.floor((dod.getTime() - dob.getTime()) / (365.25 * 86400000));
    age = `${years} years`;
  }

  // Find informant
  const informant = contacts.find((c: any) => c.is_informant) || contacts.find((c: any) => c.is_nok) || null;

  const result: MoEVRDemographic = {
    legal_name: fullName,
    aka: caseData.decedent_aka,
    sex: caseData.sex,
    date_of_birth: caseData.date_of_birth,
    age,
    ssn: caseData.ssn_encrypted ? '[ENCRYPTED]' : null,
    birthplace: caseData.birthplace,
    armed_forces: caseData.armed_forces || false,
    marital_status: caseData.marital_status,
    surviving_spouse: caseData.surviving_spouse,
    occupation: caseData.occupation,
    industry: caseData.industry,
    education: caseData.education,

    residence_state: caseData.residence_state || 'MO',
    residence_county: caseData.residence_county,
    residence_city: caseData.residence_city,
    residence_street: caseData.residence_street,
    residence_zip: caseData.residence_zip,
    inside_city_limits: caseData.residence_in_city_limits,

    race: caseData.race,
    hispanic_origin: caseData.hispanic_origin,

    father_name: caseData.father_name,
    mother_maiden_name: caseData.mother_maiden_name,

    informant_name: informant ? `${informant.first_name} ${informant.last_name || ''}`.trim() : null,
    informant_relationship: informant?.relationship || null,
    informant_address: informant ? [informant.address, informant.city, informant.state, informant.zip].filter(Boolean).join(', ') : null,

    place_of_death_type: caseData.place_of_death_type,
    facility_name: caseData.place_of_death_facility,
    death_city: caseData.place_of_death_city,
    death_county: caseData.place_of_death_county,
    death_state: caseData.place_of_death_state || 'MO',
    death_zip: caseData.place_of_death_zip,

    disposition_method: caseData.disposition_type,
    disposition_place: caseData.cemetery_name || caseData.crematory_name || null,
    disposition_city_state: caseData.cemetery_city ? `${caseData.cemetery_city}, ${caseData.cemetery_state || 'MO'}` : null,
    funeral_director_name: null, // filled by staff
    funeral_director_license: null,
    funeral_home_name: process.env.FUNERAL_HOME_NAME || 'KC Golden Gate Funeral Home',
    funeral_home_address: process.env.FUNERAL_HOME_ADDRESS || null,
    disposition_date: null,

    fields_complete: 0,
    fields_total: 41,
    missing_fields: [],
  };

  // Calculate completion
  const requiredFields = [
    'legal_name', 'sex', 'date_of_birth', 'age', 'ssn', 'birthplace',
    'marital_status', 'occupation', 'education',
    'residence_state', 'residence_city', 'residence_street', 'residence_zip',
    'race', 'father_name', 'mother_maiden_name',
    'informant_name', 'informant_relationship',
    'place_of_death_type', 'death_city', 'death_county',
    'disposition_method', 'funeral_home_name',
  ];

  const missing: string[] = [];
  let complete = 0;
  for (const field of requiredFields) {
    const val = (result as any)[field];
    if (val !== null && val !== undefined && val !== '' && val !== false) {
      complete++;
    } else {
      missing.push(field);
    }
  }

  result.fields_complete = complete;
  result.fields_total = requiredFields.length;
  result.missing_fields = missing;

  return result;
}

/**
 * Check if the death certificate filing deadline is approaching.
 * Missouri: 5 days from date of death.
 */
export function getDeathCertDeadline(dateOfDeath: string): { deadline: Date; daysRemaining: number; isOverdue: boolean } {
  const dod = new Date(dateOfDeath);
  const deadline = new Date(dod.getTime() + 5 * 86400000);
  const now = new Date();
  const daysRemaining = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);

  return {
    deadline,
    daysRemaining,
    isOverdue: daysRemaining < 0,
  };
}

/**
 * Check if medical certification deadline is approaching.
 * Missouri: 72 hours from death.
 */
export function getMedCertDeadline(dateOfDeath: string): { deadline: Date; hoursRemaining: number; isOverdue: boolean } {
  const dod = new Date(dateOfDeath);
  const deadline = new Date(dod.getTime() + 72 * 3600000);
  const now = new Date();
  const hoursRemaining = Math.ceil((deadline.getTime() - now.getTime()) / 3600000);

  return {
    deadline,
    hoursRemaining,
    isOverdue: hoursRemaining < 0,
  };
}

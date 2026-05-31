import type { OperationArea } from './operation-items';

export type MilestoneDef = {
  key: string;
  label: string;
  full: string;
  kind: 'date' | 'location' | 'select' | 'text';
  areas: OperationArea[];
  sourceKeys: string[];
  options?: string[];
  refSource?: 'cremation' | 'mokan' | 'dc';
};

// Golden Gate's service packages (from kcgoldengate.com/our-packages), cremation-tier first.
export const GG_SERVICE_OPTIONS = [
  'Direct Cremation',
  'The Direct',
  'The Memorial',
  'The Noble',
  'The Formal',
  'The Prestige',
  'The Gold',
  'The Imperial',
  'The Royal',
];

// Area-aware milestones: source-derived values are the default; staff overrides live in Neon.
export const DATE_MILESTONES: MilestoneDef[] = [
  { key: 'first_call', label: 'Call', full: 'First call', kind: 'date', areas: ['death-cert', 'paperwork'], sourceKeys: ['first_call_date', 'first_call', 'date_received', 'received_date'] },
  { key: 'service', label: 'Service', full: 'Service', kind: 'date', areas: ['service', 'arrangement'], sourceKeys: ['service_date', 'date'] },
  { key: 'cremation', label: 'Cremation', full: 'Cremation', kind: 'date', areas: ['crematory', 'cremains'], sourceKeys: ['cremation_date', 'date_of_cremation'] },
  { key: 'burial', label: 'Burial', full: 'Burial', kind: 'date', areas: ['service'], sourceKeys: ['committal_date', 'burial_date'] },
];

export const LOCATION_MILESTONES: MilestoneDef[] = [
  { key: 'service_location', label: 'Service', full: 'Service location', kind: 'location', areas: ['service', 'arrangement'], sourceKeys: ['service_location', 'location', 'chapel', 'church'] },
  { key: 'cremation_location', label: 'Cremation', full: 'Cremation location', kind: 'location', areas: ['crematory', 'cremains'], sourceKeys: ['crematory', 'crematory_name'] },
  { key: 'burial_location', label: 'Burial', full: 'Burial location', kind: 'location', areas: ['service'], sourceKeys: ['cemetery', 'cemetery_name', 'committal_location'] },
];

export const SERVICE_MILESTONES: MilestoneDef[] = [
  { key: 'service_type', label: 'Service', full: 'Service / package', kind: 'select', areas: ['arrangement', 'service'], sourceKeys: ['service_type', 'package', 'disposition_type', 'contract_type'], options: GG_SERVICE_OPTIONS },
];

export const SERVICE_EXTRA_MILESTONES: MilestoneDef[] = [
  { key: 'service_time', label: 'Time', full: 'Service time', kind: 'text', areas: ['service', 'arrangement'], sourceKeys: ['service_time', 'time'] },
  { key: 'service_lead', label: 'Lead', full: 'Lead director', kind: 'text', areas: ['service'], sourceKeys: ['lead'] },
  { key: 'service_lady', label: 'Lady', full: 'Lead lady', kind: 'text', areas: ['service'], sourceKeys: ['lady', 'lead_lady'] },
  { key: 'service_call', label: 'Call', full: 'On-call crew', kind: 'text', areas: ['service'], sourceKeys: ['call'] },
  { key: 'service_arrival', label: 'Arrival', full: 'Arrival time', kind: 'text', areas: ['service'], sourceKeys: ['arrival'] },
  { key: 'service_hearse', label: 'Hearse', full: 'Hearse', kind: 'text', areas: ['service'], sourceKeys: ['hearse'] },
  { key: 'service_limo', label: 'Limo', full: 'Limo', kind: 'text', areas: ['service'], sourceKeys: ['limo'] },
  { key: 'service_casket', label: 'Casket', full: 'Casket', kind: 'text', areas: ['service'], sourceKeys: ['casket'] },
  { key: 'service_color', label: 'Color', full: 'Casket / program color', kind: 'text', areas: ['service'], sourceKeys: ['color'] },
  { key: 'service_flowers', label: 'Flowers', full: 'Flowers', kind: 'text', areas: ['service'], sourceKeys: ['flowers'] },
  { key: 'service_programs', label: 'Programs', full: 'Programs', kind: 'text', areas: ['service'], sourceKeys: ['programs'] },
  { key: 'service_cemetery', label: 'Cemetery', full: 'Cemetery', kind: 'text', areas: ['service'], sourceKeys: ['cemetery'] },
  { key: 'service_extra', label: 'Extra', full: 'Extra crew', kind: 'text', areas: ['service'], sourceKeys: ['extra'] },
];

export const ARRANGEMENT_MILESTONES: MilestoneDef[] = [
  { key: 'arrangement_slot', label: 'Arrangement', full: 'Arrangement slot / package', kind: 'text', areas: ['arrangement'], sourceKeys: ['appointment_label', 'raw_cell', 'package', 'service_type'] },
  { key: 'arrangement_day', label: 'Day', full: 'Arrangement day', kind: 'text', areas: ['arrangement'], sourceKeys: ['day'] },
  { key: 'arrangement_time', label: 'Time', full: 'Arrangement time', kind: 'text', areas: ['arrangement'], sourceKeys: ['time'] },
];

export const DEATH_CERT_MILESTONES: MilestoneDef[] = [
  { key: 'dc_status_note', label: 'DC status', full: 'Death certificate status note', kind: 'text', areas: ['death-cert'], sourceKeys: ['column_3', 'status'] },
  { key: 'dc_doctor', label: 'Doctor', full: 'Doctor / certifier', kind: 'text', areas: ['death-cert'], sourceKeys: ['dr_name', 'doctor', 'physician', 'certifier'] },
  { key: 'dc_doctor_phone', label: 'Phone', full: 'Doctor phone', kind: 'text', areas: ['death-cert'], sourceKeys: ['phone'] },
  { key: 'dc_place_of_death', label: 'Place', full: 'Place of death', kind: 'text', areas: ['death-cert'], sourceKeys: ['place_of_death'] },
  { key: 'dc_state', label: 'State', full: 'Death certificate state', kind: 'text', areas: ['death-cert'], sourceKeys: ['state'] },
  { key: 'dc_hospice_nurse', label: 'Hospice', full: 'Hospice / nurse', kind: 'text', areas: ['death-cert'], sourceKeys: ['hospice_nurse'] },
  { key: 'dc_email_status', label: 'C&J email', full: 'C&J email DC', kind: 'text', areas: ['death-cert'], sourceKeys: ['c_j_email_dc'] },
  { key: 'dc_other_info', label: 'Other info', full: 'Death certificate other info', kind: 'text', areas: ['death-cert'], sourceKeys: ['other_info'] },
  { key: 'dc_missing_info', label: 'Missing', full: 'Missing death certificate info', kind: 'text', areas: ['death-cert'], sourceKeys: ['missing_info'] },
  { key: 'dc_ready_for_pickup', label: 'Ready', full: 'DC ready for pickup', kind: 'text', areas: ['death-cert'], sourceKeys: ['ready_for_pickup'] },
  { key: 'dc_drop_off_date', label: 'Drop off', full: 'DC drop-off date', kind: 'date', areas: ['death-cert'], sourceKeys: ['drop_off_date'] },
  { key: 'dc_pickup_date', label: 'Pickup', full: 'DC pickup date', kind: 'date', areas: ['death-cert'], sourceKeys: ['pick_up_date', 'pickup_date'] },
  { key: 'dc_pickup_address', label: 'Address', full: 'DC pickup address', kind: 'text', areas: ['death-cert'], sourceKeys: ['pick_up_address'] },
  { key: 'dc_drop_to_paper', label: 'Paper', full: 'Drop to paper', kind: 'text', areas: ['death-cert'], sourceKeys: ['drop2paper_y_n'] },
];

export const CREMATORY_MILESTONES: MilestoneDef[] = [
  { key: 'crematory_operator', label: 'Operator', full: 'Crematory operator', kind: 'text', areas: ['crematory'], sourceKeys: ['operator'] },
  { key: 'crematory_paperwork', label: 'Paperwork', full: 'Crematory paperwork', kind: 'text', areas: ['crematory'], sourceKeys: ['paperwork'] },
  { key: 'crematory_paperwork_issues', label: 'Issues', full: 'Crematory paperwork issues', kind: 'text', areas: ['crematory'], sourceKeys: ['paperwork_issues'] },
  { key: 'crematory_doctor', label: 'Doctor', full: 'Crematory doctor', kind: 'text', areas: ['crematory'], sourceKeys: ['doctor'] },
  { key: 'crematory_nok', label: 'NOK', full: 'NOK / DPOA', kind: 'text', areas: ['crematory'], sourceKeys: ['nok_or_dpoa'] },
  { key: 'crematory_at_mokan_since', label: 'At MoKan', full: 'At MoKan since', kind: 'date', areas: ['crematory'], sourceKeys: ['at_mokan_since'] },
  { key: 'crematory_ready', label: 'Ready', full: 'Crematory ready', kind: 'text', areas: ['crematory'], sourceKeys: ['ready'] },
];

export const CREMAINS_MILESTONES: MilestoneDef[] = [
  { key: 'cremains_return_date', label: 'Returned', full: 'Cremains returned date', kind: 'date', areas: ['cremains'], sourceKeys: ['date_of_return', 'return_date'] },
  { key: 'cremains_pickup_date', label: 'Pickup', full: 'Cremains pickup date', kind: 'date', areas: ['cremains'], sourceKeys: ['pick_up_date', 'pickup_date'] },
  { key: 'cremains_receiver', label: 'Receiver', full: 'Cremains receiver', kind: 'text', areas: ['cremains'], sourceKeys: ['signature_of_receiver', 'receiver', 'released_to'] },
  { key: 'cremains_property', label: 'Property', full: 'Cremains property', kind: 'text', areas: ['cremains'], sourceKeys: ['property'] },
  { key: 'cremains_urn', label: 'Urn', full: 'Urn', kind: 'text', areas: ['cremains'], sourceKeys: ['urn'] },
  { key: 'cremains_paid', label: 'Paid', full: 'Cremains paid', kind: 'text', areas: ['cremains'], sourceKeys: ['paid'] },
];

export const BELONGINGS_MILESTONES: MilestoneDef[] = [
  { key: 'belongings_type', label: 'Type', full: 'Type of belongings', kind: 'text', areas: ['belongings'], sourceKeys: ['type_of_belongings'] },
  { key: 'belongings_receiver', label: 'Receiver', full: 'Belongings released to', kind: 'text', areas: ['belongings'], sourceKeys: ['released_to', 'receiver', 'signature_of_receiver'] },
  { key: 'belongings_release_date', label: 'Release', full: 'Belongings release date', kind: 'date', areas: ['belongings'], sourceKeys: ['release_date', 'pick_up_date', 'pickup_date'] },
];

export const ALL_MILESTONES = [
  ...DATE_MILESTONES,
  ...LOCATION_MILESTONES,
  ...SERVICE_MILESTONES,
  ...SERVICE_EXTRA_MILESTONES,
  ...ARRANGEMENT_MILESTONES,
  ...DEATH_CERT_MILESTONES,
  ...CREMATORY_MILESTONES,
  ...CREMAINS_MILESTONES,
  ...BELONGINGS_MILESTONES,
];

// Documentation numbers shown in the Deceased cell and editable in the drawer. Staff overrides
// persist in case_milestones, while source values stay read-only.
export const IDENTITY_REF_DEFS: MilestoneDef[] = [
  { key: 'cremation_number', label: 'Cremation #', full: 'Cremation case #', kind: 'text', areas: ['crematory', 'cremains'], sourceKeys: [], refSource: 'cremation' },
  { key: 'mokan_number', label: 'MoKan #', full: 'MoKan #', kind: 'text', areas: ['crematory', 'cremains'], sourceKeys: ['mokan'], refSource: 'mokan' },
];

export const MILESTONE_KEY_ALLOWLIST = Array.from(new Set([
  ...ALL_MILESTONES.map((def) => def.key),
  ...IDENTITY_REF_DEFS.map((def) => def.key),
  // Kept for existing milestone audit rows and older clients; the UI no longer renders a duplicate
  // death-certificate number because the DC "Case" value is the Golden Gate case number.
  'dc_number',
]));

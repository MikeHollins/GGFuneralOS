/**
 * Case Phase Definitions — GGFuneralOS Orchestrator
 *
 * 8 phases from first call to archive. Each phase has:
 * - A set of tasks auto-generated when the case enters the phase
 * - Deadline calculations relative to date of death or phase entry
 * - Priority levels (CRITICAL > HIGH > MEDIUM > LOW)
 */

export type CasePhase =
  | 'FIRST_CALL'
  | 'PENDING_ARRANGEMENTS'
  | 'ACTIVE'
  | 'PREPARATION'
  | 'SERVICE'
  | 'POST_SERVICE'
  | 'AFTERCARE'
  | 'ARCHIVED';

export interface PhaseTaskTemplate {
  task_name: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** Days relative to date_of_death (positive = after). If null, deadline = phase entry + offset_from_entry_days */
  deadline_days_from_death: number | null;
  /** Days relative to when case enters this phase */
  deadline_days_from_entry: number | null;
  sort_order: number;
}

// ─── Phase 1: FIRST_CALL (Hour 0-4) ────────────────────────────────────────

export const FIRST_CALL_TASKS: PhaseTaskTemplate[] = [
  { task_name: 'Complete first call sheet', description: 'Capture all initial data: decedent info, NOK, location, physician, permissions', priority: 'CRITICAL', deadline_days_from_death: 0, deadline_days_from_entry: 0, sort_order: 1 },
  { task_name: 'Notify removal team', description: 'Dispatch removal team within 15 minutes', priority: 'CRITICAL', deadline_days_from_death: 0, deadline_days_from_entry: 0, sort_order: 2 },
  { task_name: 'Verify physician/coroner notification', description: 'Confirm attending physician or coroner has been notified of death', priority: 'HIGH', deadline_days_from_death: 0, deadline_days_from_entry: 0, sort_order: 3 },
  { task_name: 'Complete removal/transfer', description: 'Pick up decedent and transport to funeral home', priority: 'HIGH', deadline_days_from_death: 0, deadline_days_from_entry: 0, sort_order: 4 },
  { task_name: 'Log chain of custody', description: 'ID band on decedent, paperwork signed at pickup location', priority: 'HIGH', deadline_days_from_death: 0, deadline_days_from_entry: 0, sort_order: 5 },
  { task_name: 'Intake at funeral home', description: 'Refrigeration or prep room placement. Check for pacemaker, prosthetics.', priority: 'HIGH', deadline_days_from_death: 0, deadline_days_from_entry: 0, sort_order: 6 },
  { task_name: 'Notify family of safe arrival', description: 'Call or text family confirming their loved one is in our care', priority: 'MEDIUM', deadline_days_from_death: 0, deadline_days_from_entry: 0, sort_order: 7 },
  { task_name: 'Check for pre-arrangements on file', description: 'Check own records and preneed databases for existing arrangements', priority: 'MEDIUM', deadline_days_from_death: null, deadline_days_from_entry: 1, sort_order: 8 },
  { task_name: 'Deploy intake agent to family', description: 'Send digital planning link or deploy intake agent via SMS to family contact', priority: 'MEDIUM', deadline_days_from_death: null, deadline_days_from_entry: 1, sort_order: 9 },
];

// ─── Phase 2: PENDING_ARRANGEMENTS (Day 1-3) ───────────────────────────────

export const PENDING_ARRANGEMENTS_TASKS: PhaseTaskTemplate[] = [
  { task_name: 'Schedule arrangement conference', description: 'Contact family to schedule in-person arrangement meeting', priority: 'HIGH', deadline_days_from_death: null, deadline_days_from_entry: 1, sort_order: 1 },
  { task_name: 'Begin death certificate in MoEVR', description: 'Start demographic section in Missouri Electronic Vital Records system', priority: 'HIGH', deadline_days_from_death: 1, deadline_days_from_entry: null, sort_order: 2 },
  { task_name: 'Contact attending physician', description: 'Request medical certification — physician has 72 hours (MO law)', priority: 'CRITICAL', deadline_days_from_death: 1, deadline_days_from_entry: null, sort_order: 3 },
  { task_name: 'Review intake agent collected data', description: 'Review information gathered by intake agent, identify gaps', priority: 'MEDIUM', deadline_days_from_death: null, deadline_days_from_entry: 1, sort_order: 4 },
];

// ─── Phase 3: ACTIVE (Post-arrangement conference) ──────────────────────────

export const ACTIVE_TASKS: PhaseTaskTemplate[] = [
  { task_name: 'Present General Price List (FTC)', description: 'FTC Funeral Rule requires GPL before discussing prices. Document presentation.', priority: 'CRITICAL', deadline_days_from_death: null, deadline_days_from_entry: 0, sort_order: 1 },
  { task_name: 'Complete merchandise selection', description: 'Casket/urn, vault, register book, memorial stationery, flowers', priority: 'HIGH', deadline_days_from_death: null, deadline_days_from_entry: 0, sort_order: 2 },
  { task_name: 'Plan service details', description: 'Music, readings, pallbearers, officiant, special requests', priority: 'HIGH', deadline_days_from_death: null, deadline_days_from_entry: 0, sort_order: 3 },
  { task_name: 'Sign all authorizations', description: 'Embalming auth, cremation auth (if applicable), contract, statement of goods and services', priority: 'CRITICAL', deadline_days_from_death: null, deadline_days_from_entry: 0, sort_order: 4 },
  { task_name: 'Collect clothing and personal items', description: 'Clothing, eyeglasses, jewelry, DD-214, photos for tribute', priority: 'MEDIUM', deadline_days_from_death: null, deadline_days_from_entry: 1, sort_order: 5 },
  { task_name: 'Draft obituary', description: 'Generate obituary from intake data using Design Agent', priority: 'HIGH', deadline_days_from_death: null, deadline_days_from_entry: 1, sort_order: 6 },
  { task_name: 'Send obituary to family for approval', description: 'Text or email obituary draft to family for review', priority: 'HIGH', deadline_days_from_death: null, deadline_days_from_entry: 1, sort_order: 7 },
  { task_name: 'Submit obituary to newspaper', description: 'Publish approved obituary — newspapers have 2-3 day lead times', priority: 'MEDIUM', deadline_days_from_death: null, deadline_days_from_entry: 2, sort_order: 8 },
  { task_name: 'Publish obituary to website', description: 'Auto-publish approved obituary to kcgoldengate.com', priority: 'MEDIUM', deadline_days_from_death: null, deadline_days_from_entry: 1, sort_order: 9 },
  { task_name: 'Generate funeral program', description: 'Create bifold program PDF from case data using Design Agent', priority: 'HIGH', deadline_days_from_death: null, deadline_days_from_entry: 2, sort_order: 10 },
  { task_name: 'Order memorial stationery/programs', description: 'Send to printer — need 2-3 days before service', priority: 'MEDIUM', deadline_days_from_death: null, deadline_days_from_entry: 2, sort_order: 11 },
  { task_name: 'Order flowers', description: 'Coordinate casket spray and arrangements if funeral home is handling', priority: 'LOW', deadline_days_from_death: null, deadline_days_from_entry: 2, sort_order: 12 },
  { task_name: 'Confirm cemetery/crematory', description: 'Confirm grave opening or cremation slot scheduled', priority: 'HIGH', deadline_days_from_death: null, deadline_days_from_entry: 2, sort_order: 13 },
  { task_name: 'Confirm church/venue', description: 'Confirm service location availability and logistics', priority: 'HIGH', deadline_days_from_death: null, deadline_days_from_entry: 2, sort_order: 14 },
  { task_name: 'Confirm officiant', description: 'Confirm clergy/officiant for service', priority: 'MEDIUM', deadline_days_from_death: null, deadline_days_from_entry: 2, sort_order: 15 },
  { task_name: 'Confirm musicians/soloists', description: 'Confirm music arrangements for service', priority: 'LOW', deadline_days_from_death: null, deadline_days_from_entry: 2, sort_order: 16 },
  { task_name: 'Post memorial to social media', description: 'Generate and publish social media memorial post with CTA', priority: 'LOW', deadline_days_from_death: null, deadline_days_from_entry: 1, sort_order: 17 },
];

// ─── Phase 4: PREPARATION (Day 1-5) ────────────────────────────────────────

export const PREPARATION_TASKS: PhaseTaskTemplate[] = [
  { task_name: 'Embalming (if selected)', description: 'Complete embalming within 24-48 hours for viewing quality', priority: 'HIGH', deadline_days_from_death: 2, deadline_days_from_entry: null, sort_order: 1 },
  { task_name: 'Cosmetology and restorative art', description: 'Complete cosmetology work day before visitation', priority: 'HIGH', deadline_days_from_death: null, deadline_days_from_entry: 1, sort_order: 2 },
  { task_name: 'Dressing and casketing', description: 'Dress decedent per family instructions, place in casket', priority: 'HIGH', deadline_days_from_death: null, deadline_days_from_entry: 1, sort_order: 3 },
  { task_name: 'Hair styling', description: 'Style hair per family instructions or photo reference', priority: 'MEDIUM', deadline_days_from_death: null, deadline_days_from_entry: 1, sort_order: 4 },
  { task_name: 'Jewelry placement', description: 'Place jewelry per family instructions — document what goes on and what stays off', priority: 'MEDIUM', deadline_days_from_death: null, deadline_days_from_entry: 1, sort_order: 5 },
  { task_name: 'Pacemaker removal (if cremation)', description: 'MANDATORY for cremation — explosion risk. Must be removed before cremation.', priority: 'CRITICAL', deadline_days_from_death: null, deadline_days_from_entry: 0, sort_order: 6 },
  { task_name: 'Cremation authorization filed', description: 'Verify next-of-kin signature on cremation authorization form', priority: 'CRITICAL', deadline_days_from_death: null, deadline_days_from_entry: 0, sort_order: 7 },
];

// ─── Phase 5: SERVICE (Day of service) ──────────────────────────────────────

export const SERVICE_TASKS: PhaseTaskTemplate[] = [
  { task_name: 'Prepare visitation room/chapel', description: 'Set up 2 hours before. Flowers, casket position, lighting, AV.', priority: 'HIGH', deadline_days_from_death: null, deadline_days_from_entry: 0, sort_order: 1 },
  { task_name: 'Set up floral arrangements', description: 'Place all floral deliveries appropriately', priority: 'MEDIUM', deadline_days_from_death: null, deadline_days_from_entry: 0, sort_order: 2 },
  { task_name: 'Set up memory boards/tribute video', description: 'Display photos, memorabilia, play tribute slideshow', priority: 'MEDIUM', deadline_days_from_death: null, deadline_days_from_entry: 0, sort_order: 3 },
  { task_name: 'Place register book and programs', description: 'Set up guest register and distribute programs before guests arrive', priority: 'MEDIUM', deadline_days_from_death: null, deadline_days_from_entry: 0, sort_order: 4 },
  { task_name: 'Coordinate with officiant/musicians', description: 'Confirm arrival, review timeline, handle last-minute changes', priority: 'HIGH', deadline_days_from_death: null, deadline_days_from_entry: 0, sort_order: 5 },
  { task_name: 'Direct funeral service', description: 'Manage service timeline, cue speakers, manage flow', priority: 'HIGH', deadline_days_from_death: null, deadline_days_from_entry: 0, sort_order: 6 },
  { task_name: 'Coordinate funeral procession', description: 'Police escort, route planning, vehicle assignments', priority: 'HIGH', deadline_days_from_death: null, deadline_days_from_entry: 0, sort_order: 7 },
  { task_name: 'Direct graveside/committal', description: 'Conduct or coordinate committal service at cemetery', priority: 'HIGH', deadline_days_from_death: null, deadline_days_from_entry: 0, sort_order: 8 },
  { task_name: 'Return personal items to family', description: 'Return jewelry, flag, personal effects to designated family member', priority: 'MEDIUM', deadline_days_from_death: null, deadline_days_from_entry: 0, sort_order: 9 },
  { task_name: 'Collect funeral home property', description: 'Retrieve stands, equipment, church truck from cemetery/venue', priority: 'LOW', deadline_days_from_death: null, deadline_days_from_entry: 0, sort_order: 10 },
];

// ─── Phase 6: POST_SERVICE (Day 1-14 after service) ────────────────────────

export const POST_SERVICE_TASKS: PhaseTaskTemplate[] = [
  { task_name: 'Finalize account/process payment', description: 'Generate final invoice, process payment or file insurance assignment', priority: 'HIGH', deadline_days_from_death: null, deadline_days_from_entry: 7, sort_order: 1 },
  { task_name: 'File insurance assignment', description: 'Submit assignment of benefits paperwork to insurance carrier', priority: 'HIGH', deadline_days_from_death: null, deadline_days_from_entry: 3, sort_order: 2 },
  { task_name: 'Mail certified death certificates', description: 'Deliver certified copies to family as received from state', priority: 'MEDIUM', deadline_days_from_death: null, deadline_days_from_entry: 14, sort_order: 3 },
  { task_name: 'Complete death certificate filing', description: 'Ensure death certificate is filed with local registrar within 5 days (MO law)', priority: 'CRITICAL', deadline_days_from_death: 5, deadline_days_from_entry: null, sort_order: 4 },
  { task_name: 'Obtain burial/transit permit', description: 'Secure permit from local registrar after death certificate filed', priority: 'CRITICAL', deadline_days_from_death: 5, deadline_days_from_entry: null, sort_order: 5 },
  { task_name: 'File all signed documents', description: 'Scan and archive all signed authorizations, contracts, forms', priority: 'MEDIUM', deadline_days_from_death: null, deadline_days_from_entry: 7, sort_order: 6 },
  { task_name: 'File VA claim (if veteran)', description: 'Submit VA Form 40-1330 and VA Form 21P-530 with DD-214', priority: 'MEDIUM', deadline_days_from_death: null, deadline_days_from_entry: 7, sort_order: 7 },
  { task_name: 'Notify Social Security', description: 'Report death to SSA after death certificate filed', priority: 'LOW', deadline_days_from_death: null, deadline_days_from_entry: 14, sort_order: 8 },
];

// ─── Phase 7: AFTERCARE (30 days - 13 months) ──────────────────────────────

export const AFTERCARE_TASKS: PhaseTaskTemplate[] = [
  { task_name: 'Send thank-you card', description: 'Mail condolence/thank-you card to family', priority: 'MEDIUM', deadline_days_from_death: null, deadline_days_from_entry: 14, sort_order: 1 },
  { task_name: 'Initial check-in call/text', description: 'Reach out to family — how are they doing?', priority: 'MEDIUM', deadline_days_from_death: null, deadline_days_from_entry: 21, sort_order: 2 },
  { task_name: 'Share grief resources', description: 'Send grief support info — books, support groups, counseling referrals', priority: 'LOW', deadline_days_from_death: null, deadline_days_from_entry: 28, sort_order: 3 },
  { task_name: 'Request feedback/Google review', description: 'Ask for feedback and Google review — sensitively timed', priority: 'LOW', deadline_days_from_death: null, deadline_days_from_entry: 35, sort_order: 4 },
  { task_name: 'Birthday remembrance', description: 'Send card on decedent\'s birthday', priority: 'LOW', deadline_days_from_death: null, deadline_days_from_entry: 365, sort_order: 5 },
  { task_name: 'Holiday outreach', description: 'Send "thinking of you" card during first holiday season (Nov-Dec)', priority: 'LOW', deadline_days_from_death: null, deadline_days_from_entry: 270, sort_order: 6 },
  { task_name: 'First anniversary remembrance', description: 'Send card or call on first anniversary of death', priority: 'LOW', deadline_days_from_death: 365, deadline_days_from_entry: null, sort_order: 7 },
  { task_name: 'Introduce pre-need planning', description: 'Gently offer pre-planning consultation to surviving family members', priority: 'LOW', deadline_days_from_death: null, deadline_days_from_entry: 180, sort_order: 8 },
];

// ─── Phase map ──────────────────────────────────────────────────────────────

export const PHASE_TASKS: Record<string, PhaseTaskTemplate[]> = {
  FIRST_CALL: FIRST_CALL_TASKS,
  PENDING_ARRANGEMENTS: PENDING_ARRANGEMENTS_TASKS,
  ACTIVE: ACTIVE_TASKS,
  PREPARATION: PREPARATION_TASKS,
  SERVICE: SERVICE_TASKS,
  POST_SERVICE: POST_SERVICE_TASKS,
  AFTERCARE: AFTERCARE_TASKS,
};

export const PHASE_ORDER: CasePhase[] = [
  'FIRST_CALL', 'PENDING_ARRANGEMENTS', 'ACTIVE', 'PREPARATION',
  'SERVICE', 'POST_SERVICE', 'AFTERCARE', 'ARCHIVED'
];

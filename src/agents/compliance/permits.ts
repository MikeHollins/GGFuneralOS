/**
 * Permit Tracking — Compliance Agent
 *
 * Tracks burial permits, cremation authorizations,
 * and transit permits per case.
 */

import { query, queryOne } from '../../db/client';
import { logTimeline } from '../../api/routes/timeline-helper';

export async function markBurialPermitObtained(caseId: string): Promise<void> {
  await query('UPDATE cases SET burial_permit_obtained = true WHERE id = $1', [caseId]);
  await logTimeline(caseId, 'compliance', 'Burial/transit permit obtained', 'compliance-agent');
}

export async function markCremationAuthSigned(caseId: string): Promise<void> {
  await query('UPDATE cases SET cremation_auth_signed = true WHERE id = $1', [caseId]);
  await logTimeline(caseId, 'compliance', 'Cremation authorization signed by NOK', 'compliance-agent');
}

export async function markDeathCertFiled(caseId: string): Promise<void> {
  await query(
    'UPDATE cases SET death_cert_filed = true, death_cert_filed_date = CURRENT_DATE WHERE id = $1',
    [caseId]
  );
  await logTimeline(caseId, 'compliance', 'Death certificate filed with local registrar', 'compliance-agent');
}

export async function markGPLPresented(caseId: string): Promise<void> {
  await query('UPDATE cases SET gpl_presented = true WHERE id = $1', [caseId]);
  await logTimeline(caseId, 'compliance', 'General Price List presented to family (FTC)', 'compliance-agent');
}

export async function markContractSigned(caseId: string): Promise<void> {
  await query('UPDATE cases SET contract_signed = true WHERE id = $1', [caseId]);
  await logTimeline(caseId, 'compliance', 'Service contract signed', 'compliance-agent');
}

export async function getComplianceStatus(caseId: string): Promise<Record<string, boolean>> {
  const row = await queryOne(
    `SELECT death_cert_demographic_complete, death_cert_medical_complete,
            death_cert_filed, burial_permit_obtained, cremation_auth_signed,
            embalm_auth_signed, contract_signed, gpl_presented
     FROM cases WHERE id = $1`,
    [caseId]
  );
  if (!row) return {};
  return row as Record<string, boolean>;
}

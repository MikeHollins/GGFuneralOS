import { query } from '../../db/client';
import { getDeathCertDeadline, getMedCertDeadline } from './mo-death-cert';

/**
 * Compliance Agent — GGFuneralOS
 *
 * Monitors all active cases for approaching or overdue compliance deadlines.
 * Run on a schedule (hourly recommended).
 *
 * Missouri-specific deadlines:
 * - Death certificate: 5 days from death (RSMo 193.145)
 * - Medical certification: 72 hours
 * - FTC Funeral Rule: GPL must be presented before prices
 * - Cremation: Authorization required from legal NOK
 */

export interface ComplianceAlert {
  case_id: string;
  case_number: number;
  decedent_name: string;
  alert_type: 'death_cert_filing' | 'medical_cert' | 'cremation_auth' | 'gpl_compliance' | 'burial_permit' | 'overdue_task';
  severity: 'warning' | 'critical' | 'overdue';
  message: string;
  deadline: Date | null;
}

/**
 * Scan all active cases and return compliance alerts.
 */
export async function runComplianceScan(): Promise<ComplianceAlert[]> {
  const alerts: ComplianceAlert[] = [];

  const activeCases = await query(
    `SELECT id, case_number, decedent_first_name, decedent_last_name,
            date_of_death, phase, disposition_type,
            death_cert_filed, death_cert_demographic_complete, death_cert_medical_complete,
            burial_permit_obtained, cremation_auth_signed,
            gpl_presented, contract_signed
     FROM cases WHERE phase NOT IN ('ARCHIVED', 'AFTERCARE')`
  );

  for (const c of activeCases as any[]) {
    const name = `${c.decedent_first_name} ${c.decedent_last_name}`;

    // ── Death certificate filing deadline (5 days) ────────────────────────
    if (c.date_of_death && !c.death_cert_filed) {
      const { daysRemaining, isOverdue, deadline } = getDeathCertDeadline(c.date_of_death);

      if (isOverdue) {
        alerts.push({
          case_id: c.id, case_number: c.case_number, decedent_name: name,
          alert_type: 'death_cert_filing', severity: 'overdue',
          message: `OVERDUE: Death certificate filing is ${Math.abs(daysRemaining)} days past deadline`,
          deadline,
        });
      } else if (daysRemaining <= 2) {
        alerts.push({
          case_id: c.id, case_number: c.case_number, decedent_name: name,
          alert_type: 'death_cert_filing', severity: 'critical',
          message: `Death certificate must be filed within ${daysRemaining} day(s)`,
          deadline,
        });
      } else if (daysRemaining <= 4) {
        alerts.push({
          case_id: c.id, case_number: c.case_number, decedent_name: name,
          alert_type: 'death_cert_filing', severity: 'warning',
          message: `Death certificate due in ${daysRemaining} days`,
          deadline,
        });
      }
    }

    // ── Medical certification (72 hours) ──────────────────────────────────
    if (c.date_of_death && !c.death_cert_medical_complete) {
      const { hoursRemaining, isOverdue, deadline } = getMedCertDeadline(c.date_of_death);

      if (isOverdue) {
        alerts.push({
          case_id: c.id, case_number: c.case_number, decedent_name: name,
          alert_type: 'medical_cert', severity: 'overdue',
          message: `OVERDUE: Physician medical certification is ${Math.abs(hoursRemaining)} hours past deadline. Follow up immediately.`,
          deadline,
        });
      } else if (hoursRemaining <= 24) {
        alerts.push({
          case_id: c.id, case_number: c.case_number, decedent_name: name,
          alert_type: 'medical_cert', severity: 'critical',
          message: `Medical certification due within ${hoursRemaining} hours`,
          deadline,
        });
      }
    }

    // ── Cremation authorization ───────────────────────────────────────────
    if (c.disposition_type === 'CREMATION' && !c.cremation_auth_signed &&
        ['ACTIVE', 'PREPARATION'].includes(c.phase)) {
      alerts.push({
        case_id: c.id, case_number: c.case_number, decedent_name: name,
        alert_type: 'cremation_auth', severity: 'critical',
        message: 'Cremation authorization NOT signed — cannot proceed with cremation',
        deadline: null,
      });
    }

    // ── FTC GPL compliance ────────────────────────────────────────────────
    if (!c.gpl_presented && ['ACTIVE', 'PREPARATION', 'SERVICE'].includes(c.phase)) {
      alerts.push({
        case_id: c.id, case_number: c.case_number, decedent_name: name,
        alert_type: 'gpl_compliance', severity: 'warning',
        message: 'General Price List not yet presented to family (FTC Funeral Rule requirement)',
        deadline: null,
      });
    }

    // ── Burial permit ─────────────────────────────────────────────────────
    if (!c.burial_permit_obtained && ['PREPARATION', 'SERVICE'].includes(c.phase)) {
      alerts.push({
        case_id: c.id, case_number: c.case_number, decedent_name: name,
        alert_type: 'burial_permit', severity: 'critical',
        message: 'Burial/transit permit not obtained — cannot proceed with disposition',
        deadline: null,
      });
    }
  }

  if (alerts.length > 0) {
    console.log(`[compliance-agent] Scan complete: ${alerts.length} alert(s)`);
  }

  return alerts;
}

/**
 * Format alerts for Max to deliver via text.
 */
export function formatAlertsForMax(alerts: ComplianceAlert[]): string {
  if (alerts.length === 0) return 'All cases are in compliance. No alerts.';

  const overdue = alerts.filter(a => a.severity === 'overdue');
  const critical = alerts.filter(a => a.severity === 'critical');
  const warnings = alerts.filter(a => a.severity === 'warning');

  const lines: string[] = [];

  if (overdue.length > 0) {
    lines.push(`🔴 ${overdue.length} OVERDUE:`);
    for (const a of overdue) {
      lines.push(`  GG-${a.case_number} (${a.decedent_name}): ${a.message}`);
    }
  }

  if (critical.length > 0) {
    lines.push(`🟡 ${critical.length} CRITICAL:`);
    for (const a of critical) {
      lines.push(`  GG-${a.case_number} (${a.decedent_name}): ${a.message}`);
    }
  }

  if (warnings.length > 0) {
    lines.push(`⚪ ${warnings.length} WARNING:`);
    for (const a of warnings) {
      lines.push(`  GG-${a.case_number} (${a.decedent_name}): ${a.message}`);
    }
  }

  return lines.join('\n');
}

'use client';

import Link from 'next/link';
import { Case } from '@/lib/api';

const DISPOSITION_BADGES: Record<string, string> = {
  BURIAL: 'bg-amber-100 text-amber-800',
  CREMATION: 'bg-blue-100 text-blue-800',
  DONATION: 'bg-purple-100 text-purple-800',
  OTHER: 'bg-gray-100 text-gray-700',
};

const PAYMENT_BADGES: Record<string, string> = {
  PAID: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-yellow-100 text-yellow-700',
  PENDING: 'bg-gray-100 text-gray-600',
  INSURANCE_PENDING: 'bg-orange-100 text-orange-700',
  OVERDUE: 'bg-red-100 text-red-700',
};

export function CaseCard({ c }: { c: Case }) {
  const hasOverdue = (c.tasks_overdue ?? 0) > 0;
  const tasksComplete = c.tasks_completed ?? 0;
  const tasksTotal = c.tasks_total ?? 0;
  const progressPct = tasksTotal > 0 ? Math.round((tasksComplete / tasksTotal) * 100) : 0;

  const serviceDate = c.service_date
    ? new Date(c.service_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  return (
    <Link href={`/case/${c.id}`}>
      <div
        className={`bg-white rounded-lg shadow-sm border p-3 mb-2 cursor-pointer hover:shadow-md transition-shadow ${
          hasOverdue ? 'border-red-300 border-l-4 border-l-red-500' : 'border-gray-200'
        }`}
      >
        {/* Header */}
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="font-semibold text-sm text-brand-dark">
              {c.decedent_first_name} {c.decedent_last_name}
            </p>
            <p className="text-[10px] text-gray-400">GG-{c.case_number}</p>
          </div>
          {c.disposition_type && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${DISPOSITION_BADGES[c.disposition_type] || DISPOSITION_BADGES.OTHER}`}>
              {c.disposition_type}
            </span>
          )}
        </div>

        {/* Service date */}
        {serviceDate && (
          <p className="text-xs text-gray-500 mb-2">
            Service: {serviceDate}
            {c.service_location ? ` @ ${c.service_location}` : ''}
          </p>
        )}

        {/* Director */}
        {c.director_first_name && (
          <p className="text-[10px] text-gray-400 mb-2">
            Dir: {c.director_first_name} {c.director_last_name}
          </p>
        )}

        {/* Compliance indicators */}
        <div className="flex gap-1.5 mb-2">
          <ComplianceDot label="DC" done={c.death_cert_filed} />
          <ComplianceDot label="BP" done={c.burial_permit_obtained} />
          <ComplianceDot label="K" done={c.contract_signed} />
        </div>

        {/* Task progress bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${hasOverdue ? 'bg-red-400' : 'bg-gold'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400">{tasksComplete}/{tasksTotal}</span>
        </div>

        {/* Payment */}
        {c.payment_status && c.payment_status !== 'PENDING' && (
          <div className="mt-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${PAYMENT_BADGES[c.payment_status] || ''}`}>
              {c.payment_status.replace('_', ' ')}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

function ComplianceDot({ label, done }: { label: string; done: boolean }) {
  return (
    <span
      className={`text-[9px] px-1.5 py-0.5 rounded ${
        done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
      }`}
      title={`${label}: ${done ? 'Complete' : 'Pending'}`}
    >
      {label} {done ? '✓' : '○'}
    </span>
  );
}

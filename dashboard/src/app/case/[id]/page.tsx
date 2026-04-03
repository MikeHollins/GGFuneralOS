'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getCase, updateCase, completeTask, skipTask, CaseDetail, CaseTask, sendText } from '@/lib/api';
import { InlineEdit } from '@/components/InlineEdit';
import { SendTextDialog } from '@/components/SendTextDialog';
import Link from 'next/link';

const PHASE_OPTIONS = [
  { value: 'FIRST_CALL', label: 'First Call' },
  { value: 'PENDING_ARRANGEMENTS', label: 'Pending Arrangements' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PREPARATION', label: 'Preparation' },
  { value: 'SERVICE', label: 'Service' },
  { value: 'POST_SERVICE', label: 'Post-Service' },
  { value: 'AFTERCARE', label: 'Aftercare' },
  { value: 'ARCHIVED', label: 'Archived' },
];

const DISPOSITION_OPTIONS = [
  { value: 'BURIAL', label: 'Burial' },
  { value: 'CREMATION', label: 'Cremation' },
  { value: 'DONATION', label: 'Donation' },
  { value: 'ENTOMBMENT', label: 'Entombment' },
  { value: 'GREEN_BURIAL', label: 'Green Burial' },
  { value: 'OTHER', label: 'Other' },
];

const SERVICE_TYPE_OPTIONS = [
  { value: 'TRADITIONAL', label: 'Traditional' },
  { value: 'MEMORIAL', label: 'Memorial' },
  { value: 'CELEBRATION_OF_LIFE', label: 'Celebration of Life' },
  { value: 'GRAVESIDE_ONLY', label: 'Graveside Only' },
  { value: 'DIRECT_CREMATION', label: 'Direct Cremation' },
  { value: 'DIRECT_BURIAL', label: 'Direct Burial' },
];

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [textDialog, setTextDialog] = useState<{ phone: string; name: string } | null>(null);

  const load = () => {
    getCase(id).then(setCaseData).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  const handleSave = async (field: string, value: any) => {
    await updateCase(id, { [field]: value });
    load(); // refresh
  };

  const handleCompleteTask = async (taskId: string) => {
    await completeTask(taskId);
    load();
  };

  const handleSkipTask = async (taskId: string) => {
    await skipTask(taskId);
    load();
  };

  const handleSendText = async (to: string, body: string) => {
    await sendText(to, body);
  };

  if (loading) return <div className="p-8 text-gray-400">Loading case...</div>;
  if (!caseData) return <div className="p-8 text-red-500">Case not found</div>;

  const c = caseData;
  const fullName = [c.decedent_first_name, c.decedent_middle_name, c.decedent_last_name].filter(Boolean).join(' ');
  const nokContact = c.contacts?.find(ct => ct.is_nok);

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Back link */}
      <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 mb-4 inline-block">&larr; Back to Board</Link>

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border p-5 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-brand-dark">{fullName}</h1>
            <p className="text-sm text-gray-400 mt-1">GG-{c.case_number}</p>
          </div>
          <div className="flex items-center gap-3">
            <InlineEdit value={c.phase} field="phase" type="select" options={PHASE_OPTIONS} onSave={handleSave} label="Phase" />
            {nokContact?.phone && (
              <button
                onClick={() => setTextDialog({ phone: nokContact.phone!, name: `${nokContact.first_name} ${nokContact.last_name || ''}` })}
                className="bg-gold text-white text-xs px-3 py-1.5 rounded-lg hover:bg-gold-dark"
              >
                Text Family
              </button>
            )}
          </div>
        </div>

        {/* Compliance bar */}
        <div className="flex gap-3 mt-4">
          <ComplianceBadge label="Death Cert" done={c.death_cert_filed} field="death_cert_filed" onSave={handleSave} />
          <ComplianceBadge label="Burial Permit" done={c.burial_permit_obtained} field="burial_permit_obtained" onSave={handleSave} />
          <ComplianceBadge label="Contract" done={c.contract_signed} field="contract_signed" onSave={handleSave} />
          <ComplianceBadge label="GPL" done={c.gpl_presented} field="gpl_presented" onSave={handleSave} />
          {c.disposition_type === 'CREMATION' && (
            <ComplianceBadge label="Cremation Auth" done={c.cremation_auth_signed} field="cremation_auth_signed" onSave={handleSave} />
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-3 gap-4">
        {/* Left: Case data sections */}
        <div className="col-span-2 space-y-4">
          <Section title="Decedent Information">
            <FieldRow label="First Name" value={c.decedent_first_name} field="decedent_first_name" onSave={handleSave} />
            <FieldRow label="Middle Name" value={c.decedent_middle_name} field="decedent_middle_name" onSave={handleSave} />
            <FieldRow label="Last Name" value={c.decedent_last_name} field="decedent_last_name" onSave={handleSave} />
            <FieldRow label="AKA / Maiden" value={c.decedent_aka} field="decedent_aka" onSave={handleSave} />
            <FieldRow label="Date of Birth" value={c.date_of_birth} field="date_of_birth" type="date" onSave={handleSave} />
            <FieldRow label="Date of Death" value={c.date_of_death} field="date_of_death" type="date" onSave={handleSave} />
            <FieldRow label="Sex" value={c.sex} field="sex" onSave={handleSave} />
            <FieldRow label="Marital Status" value={c.marital_status} field="marital_status" onSave={handleSave} />
            <FieldRow label="Surviving Spouse" value={c.surviving_spouse} field="surviving_spouse" onSave={handleSave} />
            <FieldRow label="SSN" value={c.ssn_encrypted ? '***-**-****' : null} field="ssn_encrypted" onSave={handleSave} />
          </Section>

          <Section title="Residence & Background">
            <FieldRow label="Street" value={c.residence_street} field="residence_street" onSave={handleSave} />
            <FieldRow label="City" value={c.residence_city} field="residence_city" onSave={handleSave} />
            <FieldRow label="State" value={c.residence_state} field="residence_state" onSave={handleSave} />
            <FieldRow label="Zip" value={c.residence_zip} field="residence_zip" onSave={handleSave} />
            <FieldRow label="Birthplace" value={c.birthplace} field="birthplace" onSave={handleSave} />
            <FieldRow label="Occupation" value={c.occupation} field="occupation" onSave={handleSave} />
            <FieldRow label="Education" value={c.education} field="education" onSave={handleSave} />
            <FieldRow label="Armed Forces" value={c.armed_forces} field="armed_forces" type="boolean" onSave={handleSave} />
            <FieldRow label="Father's Name" value={c.father_name} field="father_name" onSave={handleSave} />
            <FieldRow label="Mother's Maiden" value={c.mother_maiden_name} field="mother_maiden_name" onSave={handleSave} />
          </Section>

          <Section title="Service & Disposition">
            <FieldRow label="Disposition" value={c.disposition_type} field="disposition_type" type="select" options={DISPOSITION_OPTIONS} onSave={handleSave} />
            <FieldRow label="Service Type" value={c.service_type} field="service_type" type="select" options={SERVICE_TYPE_OPTIONS} onSave={handleSave} />
            <FieldRow label="Service Date" value={c.service_date} field="service_date" type="date" onSave={handleSave} />
            <FieldRow label="Service Location" value={c.service_location} field="service_location" onSave={handleSave} />
            <FieldRow label="Visitation Date" value={c.visitation_date} field="visitation_date" type="date" onSave={handleSave} />
            <FieldRow label="Cemetery" value={c.cemetery_name} field="cemetery_name" onSave={handleSave} />
            <FieldRow label="Officiant" value={c.officiant_name} field="officiant_name" onSave={handleSave} />
          </Section>

          <Section title="Financial">
            <FieldRow label="Total Charges" value={c.total_charges} field="total_charges" type="number" onSave={handleSave} />
            <FieldRow label="Amount Paid" value={c.amount_paid} field="amount_paid" type="number" onSave={handleSave} />
            <FieldRow label="Payment Status" value={c.payment_status} field="payment_status" type="select" options={[
              { value: 'PENDING', label: 'Pending' }, { value: 'PARTIAL', label: 'Partial' },
              { value: 'PAID', label: 'Paid' }, { value: 'INSURANCE_PENDING', label: 'Insurance Pending' },
              { value: 'PAYMENT_PLAN', label: 'Payment Plan' }, { value: 'OVERDUE', label: 'Overdue' },
            ]} onSave={handleSave} />
            <FieldRow label="Insurance Carrier" value={c.insurance_carrier} field="insurance_carrier" onSave={handleSave} />
            <FieldRow label="Policy Number" value={c.insurance_policy_number} field="insurance_policy_number" onSave={handleSave} />
          </Section>

          <Section title="Contacts">
            {c.contacts?.length === 0 && <p className="text-xs text-gray-400 py-2">No contacts added</p>}
            {c.contacts?.map((ct) => (
              <div key={ct.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium">{ct.first_name} {ct.last_name}</p>
                  <p className="text-xs text-gray-400">{ct.relationship}{ct.is_nok ? ' (NOK)' : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  {ct.phone && (
                    <button
                      onClick={() => setTextDialog({ phone: ct.phone!, name: `${ct.first_name} ${ct.last_name || ''}` })}
                      className="text-xs text-gold hover:text-gold-dark"
                    >
                      Text
                    </button>
                  )}
                  <span className="text-xs text-gray-400">{ct.phone}</span>
                </div>
              </div>
            ))}
          </Section>

          <Section title="Notes">
            <InlineEdit value={c.notes} field="notes" type="textarea" onSave={handleSave} label="Case Notes" />
          </Section>
        </div>

        {/* Right: Tasks + Timeline */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <h3 className="text-sm font-semibold text-brand-dark mb-3">Tasks</h3>
            <div className="space-y-1 max-h-[500px] overflow-y-auto">
              {c.tasks?.length === 0 && <p className="text-xs text-gray-400">No tasks</p>}
              {c.tasks?.map((task) => (
                <TaskItem key={task.id} task={task} onComplete={handleCompleteTask} onSkip={handleSkipTask} />
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-4">
            <h3 className="text-sm font-semibold text-brand-dark mb-3">Timeline</h3>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {c.timeline?.length === 0 && <p className="text-xs text-gray-400">No events</p>}
              {c.timeline?.map((event) => (
                <div key={event.id} className="border-l-2 border-gray-200 pl-3 py-1">
                  <p className="text-xs text-gray-700">{event.description}</p>
                  <p className="text-[10px] text-gray-400">
                    {event.actor} &middot; {new Date(event.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Text dialog */}
      {textDialog && (
        <SendTextDialog
          phone={textDialog.phone}
          contactName={textDialog.name}
          onSend={handleSendText}
          onClose={() => setTextDialog(null)}
        />
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white rounded-xl shadow-sm border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex justify-between items-center text-left"
      >
        <h3 className="text-sm font-semibold text-brand-dark">{title}</h3>
        <span className="text-gray-400 text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="px-4 pb-4 grid grid-cols-2 gap-x-6 gap-y-2">{children}</div>}
    </div>
  );
}

function FieldRow({
  label, value, field, type, options, onSave,
}: {
  label: string; value: any; field: string;
  type?: 'text' | 'date' | 'select' | 'boolean' | 'number' | 'textarea';
  options?: { value: string; label: string }[];
  onSave: (field: string, value: any) => Promise<void>;
}) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-gray-50">
      <span className="text-xs text-gray-500">{label}</span>
      <InlineEdit value={value} field={field} type={type} options={options} onSave={onSave} label={label} />
    </div>
  );
}

function ComplianceBadge({
  label, done, field, onSave,
}: {
  label: string; done: boolean; field: string;
  onSave: (field: string, value: any) => Promise<void>;
}) {
  return (
    <button
      onClick={() => onSave(field, !done)}
      className={`text-xs px-3 py-1 rounded-full border transition-colors ${
        done
          ? 'bg-green-50 border-green-300 text-green-700'
          : 'bg-gray-50 border-gray-300 text-gray-500 hover:border-gold hover:text-gold'
      }`}
    >
      {done ? '✓' : '○'} {label}
    </button>
  );
}

function TaskItem({
  task, onComplete, onSkip,
}: {
  task: CaseTask;
  onComplete: (id: string) => void;
  onSkip: (id: string) => void;
}) {
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'COMPLETED' && task.status !== 'SKIPPED';
  const isDone = task.status === 'COMPLETED' || task.status === 'SKIPPED';

  return (
    <div className={`flex items-start gap-2 py-1.5 px-2 rounded text-xs ${isOverdue ? 'bg-red-50' : isDone ? 'opacity-50' : ''}`}>
      {!isDone ? (
        <button onClick={() => onComplete(task.id)} className="mt-0.5 text-gray-300 hover:text-green-500" title="Complete">○</button>
      ) : (
        <span className="mt-0.5 text-green-500">✓</span>
      )}
      <div className="flex-1">
        <p className={`${isDone ? 'line-through text-gray-400' : 'text-gray-700'}`}>{task.task_name}</p>
        {task.deadline && !isDone && (
          <p className={`text-[10px] ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
            Due: {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
        )}
      </div>
      {!isDone && (
        <button onClick={() => onSkip(task.id)} className="text-gray-300 hover:text-gray-500 text-[10px]" title="Skip">skip</button>
      )}
    </div>
  );
}

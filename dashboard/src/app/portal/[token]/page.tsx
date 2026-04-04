'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface PortalSession {
  case_id: string;
  case_number: number;
  decedent_name: string;
  contact_name: string;
  fields_completed: Record<string, string>;
  scheduled_date: string | null;
}

interface FieldDef {
  id: string;
  label: string;
  type: string;
  placeholder?: string;
  options?: string[];
  inputMode?: string;
}

const FIELD_SECTIONS: { title: string; subtitle?: string; fields: FieldDef[] }[] = [
  {
    title: 'Personal Information',
    fields: [
      { id: 'decedent_first_name', label: 'Full Legal Name', type: 'text', placeholder: 'First Middle Last' },
      { id: 'date_of_birth', label: 'Date of Birth', type: 'date' },
      { id: 'marital_status', label: 'Marital Status', type: 'select', options: ['Married', 'Widowed', 'Divorced', 'Never Married'] },
      { id: 'surviving_spouse', label: 'Surviving Spouse (full name)', type: 'text' },
      { id: 'birthplace', label: 'Birthplace (city, state)', type: 'text' },
      { id: 'occupation', label: 'Occupation (most of working life)', type: 'text' },
      { id: 'education', label: 'Highest Education', type: 'select', options: ['8th grade or less', 'Some high school', 'High school graduate/GED', 'Some college', 'Associate degree', "Bachelor's degree", "Master's degree", 'Doctorate'] },
      { id: 'armed_forces', label: 'US Armed Forces Service?', type: 'select', options: ['Yes', 'No'] },
    ],
  },
  {
    title: 'Sensitive Information',
    subtitle: 'This information is encrypted and secure.',
    fields: [
      { id: 'ssn_encrypted', label: 'Social Security Number', type: 'text', placeholder: 'XXX-XX-XXXX', inputMode: 'numeric' as const },
      { id: 'father_name', label: "Father's Full Name", type: 'text' },
      { id: 'mother_maiden_name', label: "Mother's Full Name (maiden)", type: 'text' },
      { id: 'residence_street', label: 'Home Address', type: 'text', placeholder: 'Street, City, State, Zip' },
      { id: 'insurance_carrier', label: 'Life Insurance Company', type: 'text', placeholder: 'If applicable' },
      { id: 'insurance_policy_number', label: 'Policy Number', type: 'text', placeholder: 'If known' },
    ],
  },
  {
    title: 'For the Obituary',
    subtitle: 'Share whatever you feel comfortable with. We can discuss more when we meet.',
    fields: [
      { id: '_church', label: 'Church or Religious Organization', type: 'text' },
      { id: '_organizations', label: 'Clubs, Lodges, Organizations', type: 'text' },
      { id: '_hobbies', label: 'Hobbies, Interests, Passions', type: 'textarea', placeholder: 'What did they enjoy? What were they known for?' },
      { id: '_survivors_text', label: 'Surviving Family Members', type: 'textarea', placeholder: 'Spouse, children, grandchildren, parents, siblings — include cities if known' },
      { id: '_preceded_by_text', label: 'Preceded in Death By', type: 'textarea', placeholder: 'Parents, siblings, children, spouse who passed before' },
    ],
  },
];

export default function PortalPage() {
  const { token } = useParams<{ token: string }>();
  const [session, setSession] = useState<PortalSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [values, setValues] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState(0);

  useEffect(() => {
    fetch(`/api/portal/${token}`)
      .then(r => r.ok ? r.json() : Promise.reject('Invalid or expired link'))
      .then(data => {
        setSession(data);
        const completed = new Set(Object.keys(data.fields_completed || {}));
        setSaved(completed);
      })
      .catch(err => setError(typeof err === 'string' ? err : 'Unable to load'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSave = async (fieldId: string, value: string) => {
    if (!value.trim()) return;
    setSaving(fieldId);
    try {
      const res = await fetch(`/api/portal/${token}/field`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_id: fieldId, value }),
      });
      if (res.ok) {
        setSaved(prev => new Set([...prev, fieldId]));
      }
    } catch {} finally {
      setSaving(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        await fetch(`/api/portal/${token}/upload`, { method: 'POST', body: formData });
        setSaved(prev => new Set([...prev, `file_${file.name}`]));
      } catch {}
    }
  };

  if (loading) return <div className="text-center py-20 text-gray-400">Loading...</div>;
  if (error) return (
    <div className="text-center py-20">
      <p className="text-red-500 font-medium mb-2">Unable to access portal</p>
      <p className="text-sm text-gray-500">{error}</p>
      <p className="text-xs text-gray-400 mt-4">If you need help, please call us directly.</p>
    </div>
  );
  if (!session) return null;

  const section = FIELD_SECTIONS[activeSection];
  const totalFields = FIELD_SECTIONS.reduce((s, sec) => s + sec.fields.length, 0);
  const completedFields = saved.size;
  const progressPct = Math.round((completedFields / totalFields) * 100);

  return (
    <div>
      {/* Welcome */}
      <div className="text-center mb-6">
        <p className="text-sm text-gray-600">Hello {session.contact_name},</p>
        <p className="text-xs text-gray-400 mt-1">
          We&apos;re gathering information for {session.decedent_name}&apos;s service.
          Take your time — there&apos;s no rush.
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-[10px] text-gray-400 mb-1">
          <span>{completedFields} of {totalFields} fields</span>
          <span>{progressPct}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="bg-[#c9a96e] h-2 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto">
        {FIELD_SECTIONS.map((sec, i) => (
          <button
            key={i}
            onClick={() => setActiveSection(i)}
            className={`text-xs px-3 py-2 rounded-lg whitespace-nowrap transition-colors ${
              i === activeSection ? 'bg-[#1a1a2e] text-white' : 'bg-white text-gray-500 border'
            }`}
          >
            {sec.title}
          </button>
        ))}
      </div>

      {/* Fields */}
      <div className="bg-white rounded-xl shadow-sm border p-5 space-y-5">
        <h3 className="font-semibold text-[#1a1a2e]">{section.title}</h3>
        {section.subtitle && <p className="text-xs text-gray-400 -mt-3">{section.subtitle}</p>}

        {section.fields.map((field) => {
          const isSaved = saved.has(field.id);
          const isSaving = saving === field.id;
          const val = values[field.id] || '';

          return (
            <div key={field.id}>
              <label className="block text-xs text-gray-500 mb-1">
                {field.label}
                {isSaved && <span className="text-green-500 ml-2">Saved</span>}
              </label>

              {field.type === 'select' ? (
                <select
                  value={val}
                  onChange={(e) => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                  onBlur={() => val && handleSave(field.id, val)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-[#c9a96e] min-h-[48px]"
                >
                  <option value="">Select...</option>
                  {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  value={val}
                  onChange={(e) => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                  onBlur={() => val && handleSave(field.id, val)}
                  placeholder={field.placeholder}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-[#c9a96e] resize-none"
                />
              ) : (
                <input
                  type={field.type}
                  value={val}
                  onChange={(e) => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                  onBlur={() => val && handleSave(field.id, val)}
                  placeholder={field.placeholder}
                  className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:outline-none focus:border-[#c9a96e] min-h-[48px]"
                />
              )}
              {isSaving && <p className="text-[10px] text-[#c9a96e] mt-1">Saving...</p>}
            </div>
          );
        })}
      </div>

      {/* File uploads section (always visible) */}
      <div className="bg-white rounded-xl shadow-sm border p-5 mt-4">
        <h3 className="font-semibold text-[#1a1a2e] mb-2">Photos & Documents</h3>
        <p className="text-xs text-gray-400 mb-4">Upload photos for the program, DD-214, insurance documents, or any other files.</p>
        <label className="block w-full border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-[#c9a96e] transition-colors">
          <input type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx" onChange={handleFileUpload} className="hidden" />
          <p className="text-sm text-gray-500">Tap to upload files</p>
          <p className="text-[10px] text-gray-400 mt-1">Photos, videos, voice notes, PDFs</p>
        </label>
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button
          onClick={() => setActiveSection(Math.max(0, activeSection - 1))}
          disabled={activeSection === 0}
          className="text-sm text-gray-500 disabled:opacity-30"
        >
          Back
        </button>
        {activeSection < FIELD_SECTIONS.length - 1 ? (
          <button
            onClick={() => setActiveSection(activeSection + 1)}
            className="text-sm bg-[#1a1a2e] text-white px-4 py-2 rounded-lg"
          >
            Next Section
          </button>
        ) : (
          <button
            onClick={() => fetch(`/api/portal/${token}/complete`, { method: 'POST' }).then(() => setError('Thank you! We have received your information.'))}
            className="text-sm bg-[#c9a96e] text-white px-4 py-2 rounded-lg"
          >
            Submit
          </button>
        )}
      </div>
    </div>
  );
}

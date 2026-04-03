'use client';

import { useState, useRef, useEffect } from 'react';

interface InlineEditProps {
  value: string | number | boolean | null;
  field: string;
  type?: 'text' | 'date' | 'select' | 'boolean' | 'number' | 'textarea';
  options?: { value: string; label: string }[];
  onSave: (field: string, value: any) => Promise<void>;
  label?: string;
}

/**
 * InlineEdit — double-click any value to edit it.
 * Shows a dialog with the field, a save button, and a cancel button.
 * Save pushes to the API immediately.
 */
export function InlineEdit({ value, field, type = 'text', options, onSave, label }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState<any>(value ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const displayValue = value === null || value === undefined || value === ''
    ? '—'
    : type === 'boolean'
    ? (value ? 'Yes' : 'No')
    : type === 'date' && typeof value === 'string'
    ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : String(value);

  const handleSave = async () => {
    setSaving(true);
    try {
      let saveValue = editValue;
      if (type === 'boolean') saveValue = editValue === 'true' || editValue === true;
      if (type === 'number') saveValue = Number(editValue);
      await onSave(field, saveValue);
      setEditing(false);
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditValue(value ?? '');
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && type !== 'textarea') handleSave();
    if (e.key === 'Escape') handleCancel();
  };

  if (editing) {
    return (
      <div className="bg-white border border-gold rounded-lg shadow-lg p-3 min-w-[200px]">
        {label && <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-1">{label}</label>}

        {type === 'select' && options ? (
          <select
            ref={inputRef as any}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gold"
          >
            <option value="">—</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : type === 'boolean' ? (
          <select
            ref={inputRef as any}
            value={String(editValue)}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gold"
          >
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        ) : type === 'textarea' ? (
          <textarea
            ref={inputRef as any}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gold resize-none"
          />
        ) : (
          <input
            ref={inputRef as any}
            type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-gold"
          />
        )}

        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={handleCancel}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs bg-gold text-white px-3 py-1 rounded hover:bg-gold-dark disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <span
      onDoubleClick={() => {
        setEditValue(value ?? '');
        setEditing(true);
      }}
      className="cursor-pointer hover:bg-gold/10 px-1 py-0.5 rounded transition-colors"
      title="Double-click to edit"
    >
      {displayValue}
    </span>
  );
}

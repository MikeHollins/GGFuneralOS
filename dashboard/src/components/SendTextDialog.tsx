'use client';

import { useState } from 'react';

interface SendTextDialogProps {
  phone: string;
  contactName: string;
  onSend: (to: string, body: string) => Promise<void>;
  onClose: () => void;
}

const QUICK_MESSAGES = [
  'Just wanted to check in and see how your family is doing. We\'re here if you need anything.',
  'This is a friendly reminder about our upcoming arrangement conference. Please let us know if the time still works for you.',
  'The obituary draft is ready for your review. Please take a look and let us know if you\'d like any changes.',
  'We wanted to let you know that the certified death certificates are ready for pickup.',
];

export function SendTextDialog({ phone, contactName, onSend, onClose }: SendTextDialogProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      await onSend(phone, message);
      setSent(true);
      setTimeout(() => { setSent(false); setMessage(''); }, 2000);
    } catch (err) {
      console.error('Failed to send:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="font-semibold text-brand-dark">Send Text</h3>
            <p className="text-xs text-gray-400">To: {contactName} ({phone})</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {/* Quick message templates */}
        <div className="mb-3">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Quick Messages</p>
          <div className="flex flex-col gap-1">
            {QUICK_MESSAGES.map((msg, i) => (
              <button
                key={i}
                onClick={() => setMessage(msg)}
                className="text-left text-xs text-gray-600 hover:bg-gray-50 p-2 rounded border border-transparent hover:border-gray-200 transition-colors"
              >
                {msg.slice(0, 80)}...
              </button>
            ))}
          </div>
        </div>

        {/* Compose */}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message..."
          rows={4}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold resize-none mb-3"
        />

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className={`text-sm px-4 py-2 rounded-lg font-medium transition-colors ${
              sent
                ? 'bg-green-500 text-white'
                : 'bg-gold text-white hover:bg-gold-dark disabled:opacity-50'
            }`}
          >
            {sent ? 'Sent!' : sending ? 'Sending...' : 'Send Text'}
          </button>
        </div>
      </div>
    </div>
  );
}

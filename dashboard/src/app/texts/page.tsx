'use client';

import { useState } from 'react';
import { sendText } from '@/lib/api';

export default function TextsPage() {
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!to || !body) return;
    setSending(true);
    try {
      await sendText(to, body);
      setSent(true);
      setBody('');
      setTimeout(() => setSent(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 max-w-[600px] mx-auto">
      <h2 className="text-xl font-bold text-brand-dark mb-6">Send Text</h2>
      <p className="text-sm text-gray-500 mb-6">
        Send an SMS directly from the dashboard. Messages are sent from the funeral home&apos;s Twilio number.
      </p>

      <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">To (phone number)</label>
          <input
            type="tel"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="+1 (816) 555-1234"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type your message..."
            rows={5}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold resize-none"
          />
        </div>

        <button
          onClick={handleSend}
          disabled={sending || !to || !body}
          className={`w-full py-2.5 rounded-lg font-medium text-sm transition-colors ${
            sent
              ? 'bg-green-500 text-white'
              : 'bg-gold text-white hover:bg-gold-dark disabled:opacity-50'
          }`}
        >
          {sent ? 'Sent!' : sending ? 'Sending...' : 'Send Text'}
        </button>
      </div>
    </div>
  );
}

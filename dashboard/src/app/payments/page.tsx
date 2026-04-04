'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function PaymentsPage() {
  const [outstanding, setOutstanding] = useState<any[]>([]);
  const [insurance, setInsurance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/payments/outstanding').then(r => r.json()),
      fetch('/api/payments/insurance').then(r => r.json()),
    ]).then(([outData, insData]) => {
      setOutstanding(outData.data || []);
      setInsurance(insData.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-gray-400">Loading payments...</div>;

  const totalOutstanding = outstanding.reduce((s, r) => s + Number(r.balance_due || 0), 0);
  const totalInsurance = insurance.reduce((s, r) => s + Number(r.assigned_amount || 0), 0);

  return (
    <div className="p-6 max-w-[1000px] mx-auto">
      <h2 className="text-xl font-bold text-brand-dark mb-6">Payments & Insurance</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-2xl font-bold text-brand-dark">${totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">Outstanding Balances</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-2xl font-bold text-orange-500">{outstanding.length}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">Unpaid Cases</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <p className="text-2xl font-bold text-blue-600">${totalInsurance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">Pending Insurance</p>
        </div>
      </div>

      {/* Outstanding balances */}
      <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
        <h3 className="text-sm font-semibold text-brand-dark mb-4">Outstanding Balances</h3>
        {outstanding.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">All accounts current</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-gray-400 uppercase tracking-wide border-b">
                <th className="text-left py-2">Case</th>
                <th className="text-right py-2">Charged</th>
                <th className="text-right py-2">Paid</th>
                <th className="text-right py-2">Balance</th>
                <th className="text-left py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {outstanding.map((r: any) => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2">
                    <Link href={`/case/${r.id}`} className="text-brand-dark hover:text-gold font-medium">
                      GG-{r.case_number} — {r.decedent_first_name} {r.decedent_last_name}
                    </Link>
                  </td>
                  <td className="text-right">${Number(r.total_charges).toFixed(2)}</td>
                  <td className="text-right text-green-600">${Number(r.amount_paid).toFixed(2)}</td>
                  <td className="text-right font-bold text-red-600">${Number(r.balance_due).toFixed(2)}</td>
                  <td>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                      {(r.payment_status || '').replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Insurance claims */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h3 className="text-sm font-semibold text-brand-dark mb-4">Pending Insurance Claims</h3>
        {insurance.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">No pending claims</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-gray-400 uppercase tracking-wide border-b">
                <th className="text-left py-2">Case</th>
                <th className="text-left py-2">Insurer</th>
                <th className="text-left py-2">Policy #</th>
                <th className="text-right py-2">Amount</th>
                <th className="text-left py-2">Filed</th>
                <th className="text-left py-2">Days</th>
                <th className="text-left py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {insurance.map((r: any) => {
                const days = r.date_filed ? Math.floor((Date.now() - new Date(r.date_filed).getTime()) / 86400000) : 0;
                return (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2">
                      <Link href={`/case/${r.case_id}`} className="text-brand-dark hover:text-gold">
                        GG-{r.case_number} — {r.decedent_last_name}
                      </Link>
                    </td>
                    <td>{r.insurer_name}</td>
                    <td className="text-gray-500">{r.policy_number || '—'}</td>
                    <td className="text-right font-medium">${Number(r.assigned_amount || 0).toFixed(2)}</td>
                    <td className="text-gray-500">{r.date_filed ? new Date(r.date_filed).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                    <td className={days > 45 ? 'text-red-600 font-bold' : days > 30 ? 'text-orange-500' : 'text-gray-500'}>{days}d</td>
                    <td>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{r.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

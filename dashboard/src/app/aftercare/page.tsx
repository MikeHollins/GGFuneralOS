'use client';

import { useEffect, useState } from 'react';
import { getCases, Case } from '@/lib/api';
import Link from 'next/link';

export default function AftercarePage() {
  const [cases, setCases] = useState<Case[]>([]);

  useEffect(() => {
    getCases('AFTERCARE').then((d) => setCases(d.data)).catch(() => {});
  }, []);

  return (
    <div className="p-6 max-w-[900px] mx-auto">
      <h2 className="text-xl font-bold text-brand-dark mb-6">Aftercare</h2>
      <p className="text-sm text-gray-500 mb-6">
        Families in the aftercare phase. Follow-up touches drive referrals, reviews, and pre-need leads.
      </p>

      {cases.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center text-gray-400">
          No cases in aftercare phase
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map((c) => {
            const daysSinceService = c.service_date
              ? Math.floor((Date.now() - new Date(c.service_date).getTime()) / 86400000)
              : null;

            return (
              <Link key={c.id} href={`/case/${c.id}`}>
                <div className="bg-white rounded-xl shadow-sm border p-4 hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-sm text-brand-dark">
                        {c.decedent_first_name} {c.decedent_last_name}
                      </p>
                      <p className="text-xs text-gray-400">GG-{c.case_number}</p>
                    </div>
                    <div className="text-right">
                      {daysSinceService !== null && (
                        <p className="text-xs text-gray-500">{daysSinceService} days since service</p>
                      )}
                      <p className="text-[10px] text-gray-400">
                        {c.tasks_completed ?? 0}/{c.tasks_total ?? 0} aftercare tasks done
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

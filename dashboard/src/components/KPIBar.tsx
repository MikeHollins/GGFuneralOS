'use client';

import { useEffect, useState } from 'react';
import { getMetrics, DashboardMetrics } from '@/lib/api';

export function KPIBar() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  useEffect(() => {
    const load = () => getMetrics().then(setMetrics).catch(() => {});
    load();
    const interval = setInterval(load, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  if (!metrics) return <div className="h-16 bg-white border-b animate-pulse" />;

  const items = [
    { label: 'Active Cases', value: metrics.active_cases, color: 'text-brand-dark' },
    { label: 'This Month', value: metrics.cases_this_month, color: 'text-brand-dark' },
    { label: 'Overdue Tasks', value: metrics.overdue_tasks, color: metrics.overdue_tasks > 0 ? 'text-red-600' : 'text-green-600' },
    { label: 'Pending DC', value: metrics.pending_death_certs, color: metrics.pending_death_certs > 0 ? 'text-orange-500' : 'text-green-600' },
    { label: 'Pending Pay', value: metrics.pending_payments, color: metrics.pending_payments > 0 ? 'text-orange-500' : 'text-green-600' },
    { label: 'Avg Revenue', value: `$${metrics.avg_revenue_per_case.toLocaleString()}`, color: 'text-brand-dark' },
    { label: 'Cremation %', value: `${metrics.cremation_rate_pct}%`, color: 'text-brand-dark' },
  ];

  return (
    <div className="bg-white border-b px-6 py-3 flex items-center gap-8 overflow-x-auto">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col items-center min-w-[80px]">
          <span className={`text-xl font-bold ${item.color}`}>{item.value}</span>
          <span className="text-[10px] text-gray-400 uppercase tracking-wide">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

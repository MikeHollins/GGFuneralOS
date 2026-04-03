'use client';

import { useEffect, useState } from 'react';
import { getMetrics, getOverdueTasks, DashboardMetrics, CaseTask } from '@/lib/api';

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [overdue, setOverdue] = useState<CaseTask[]>([]);

  useEffect(() => {
    getMetrics().then(setMetrics).catch(() => {});
    getOverdueTasks().then((d) => setOverdue(d.data)).catch(() => {});
  }, []);

  if (!metrics) return <div className="p-8 text-gray-400">Loading metrics...</div>;

  return (
    <div className="p-6 max-w-[1000px] mx-auto">
      <h2 className="text-xl font-bold text-brand-dark mb-6">Metrics & KPIs</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard label="Active Cases" value={metrics.active_cases} />
        <MetricCard label="Cases This Month" value={metrics.cases_this_month} />
        <MetricCard label="Cases This Year" value={metrics.cases_this_year} />
        <MetricCard label="Avg Revenue/Case" value={`$${metrics.avg_revenue_per_case.toLocaleString()}`} />
        <MetricCard label="Cremation Rate" value={`${metrics.cremation_rate_pct}%`} />
        <MetricCard label="Overdue Tasks" value={metrics.overdue_tasks} alert={metrics.overdue_tasks > 0} />
        <MetricCard label="Pending Payments" value={metrics.pending_payments} alert={metrics.pending_payments > 0} />
        <MetricCard label="Pending Death Certs" value={metrics.pending_death_certs} alert={metrics.pending_death_certs > 0} />
      </div>

      {/* Overdue Tasks */}
      {overdue.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h3 className="text-sm font-semibold text-red-600 mb-3">Overdue Tasks ({overdue.length})</h3>
          <div className="space-y-2">
            {overdue.map((task) => (
              <div key={task.id} className="flex justify-between items-center py-2 px-3 bg-red-50 rounded-lg">
                <div>
                  <p className="text-sm text-gray-800">{task.task_name}</p>
                  <p className="text-[10px] text-gray-500">{(task as any).decedent_last_name} (GG-{(task as any).case_number})</p>
                </div>
                <span className="text-xs text-red-600 font-medium">
                  Due: {task.deadline ? new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border p-4 ${alert ? 'border-red-200' : ''}`}>
      <p className={`text-2xl font-bold ${alert ? 'text-red-600' : 'text-brand-dark'}`}>{value}</p>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">{label}</p>
    </div>
  );
}

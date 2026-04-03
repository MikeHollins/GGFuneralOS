'use client';

import { useEffect, useState } from 'react';
import { getBoard, Case } from '@/lib/api';
import { KPIBar } from '@/components/KPIBar';
import { CaseCard } from '@/components/CaseCard';

const PHASE_LABELS: Record<string, string> = {
  FIRST_CALL: 'First Call',
  PENDING_ARRANGEMENTS: 'Pending',
  ACTIVE: 'Active',
  PREPARATION: 'Prep',
  SERVICE: 'Service',
  POST_SERVICE: 'Post-Service',
  AFTERCARE: 'Aftercare',
};

const PHASE_COLORS: Record<string, string> = {
  FIRST_CALL: 'border-red-400',
  PENDING_ARRANGEMENTS: 'border-orange-400',
  ACTIVE: 'border-blue-400',
  PREPARATION: 'border-purple-400',
  SERVICE: 'border-green-400',
  POST_SERVICE: 'border-teal-400',
  AFTERCARE: 'border-yellow-400',
};

export default function BoardPage() {
  const [board, setBoard] = useState<Record<string, Case[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      getBoard()
        .then((data) => setBoard(data.board))
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    load();
    const interval = setInterval(load, 5000); // poll every 5s for real-time feel
    return () => clearInterval(interval);
  }, []);

  const phases = Object.keys(PHASE_LABELS);

  return (
    <div className="flex flex-col h-full">
      <KPIBar />

      <div className="flex-1 overflow-x-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">Loading cases...</div>
        ) : (
          <div className="flex gap-3 min-w-max h-full">
            {phases.map((phase) => {
              const cases = board[phase] || [];
              return (
                <div
                  key={phase}
                  className={`w-[220px] bg-gray-50 rounded-lg border-t-4 ${PHASE_COLORS[phase] || 'border-gray-300'} flex flex-col`}
                >
                  {/* Column header */}
                  <div className="px-3 py-2 flex justify-between items-center">
                    <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      {PHASE_LABELS[phase]}
                    </h3>
                    <span className="text-[10px] bg-white text-gray-500 px-1.5 py-0.5 rounded-full border">
                      {cases.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto px-2 pb-2">
                    {cases.length === 0 ? (
                      <p className="text-[10px] text-gray-300 text-center py-8">No cases</p>
                    ) : (
                      cases.map((c) => <CaseCard key={c.id} c={c} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

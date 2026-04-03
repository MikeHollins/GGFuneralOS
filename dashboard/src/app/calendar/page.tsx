'use client';

import { useEffect, useState } from 'react';
import { getCalendar, Case } from '@/lib/api';
import Link from 'next/link';

const EVENT_COLORS: Record<string, string> = {
  service: 'bg-blue-100 border-blue-400 text-blue-800',
  visitation: 'bg-purple-100 border-purple-400 text-purple-800',
  committal: 'bg-green-100 border-green-400 text-green-800',
};

export default function CalendarPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const end = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    getCalendar(start.toISOString(), end.toISOString())
      .then((data) => {
        const allEvents: any[] = [];
        for (const c of data.data) {
          if (c.service_date) allEvents.push({ ...c, event_type: 'service', event_date: c.service_date });
          if (c.visitation_date) allEvents.push({ ...c, event_type: 'visitation', event_date: c.visitation_date });
          if (c.committal_date) allEvents.push({ ...c, event_type: 'committal', event_date: (c as any).committal_date });
        }
        setEvents(allEvents);
      })
      .catch(() => {});
  }, [currentMonth]);

  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfWeek }, (_, i) => i);

  const getEventsForDay = (day: number) => {
    return events.filter((e) => {
      const d = new Date(e.event_date);
      return d.getDate() === day && d.getMonth() === currentMonth.getMonth();
    });
  };

  return (
    <div className="p-6">
      {/* Month navigation */}
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
          className="text-sm text-gray-500 hover:text-brand-dark px-3 py-1 rounded border"
        >
          &larr; Prev
        </button>
        <h2 className="text-xl font-bold text-brand-dark">{monthName}</h2>
        <button
          onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
          className="text-sm text-gray-500 hover:text-brand-dark px-3 py-1 rounded border"
        >
          Next &rarr;
        </button>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-center text-xs font-semibold text-gray-500 py-2">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {blanks.map((i) => (
            <div key={`blank-${i}`} className="h-28 border-b border-r bg-gray-50" />
          ))}
          {days.map((day) => {
            const dayEvents = getEventsForDay(day);
            const isToday = new Date().getDate() === day &&
              new Date().getMonth() === currentMonth.getMonth() &&
              new Date().getFullYear() === currentMonth.getFullYear();

            return (
              <div key={day} className={`h-28 border-b border-r p-1.5 ${isToday ? 'bg-gold/5' : ''}`}>
                <span className={`text-xs font-medium ${isToday ? 'bg-gold text-white px-1.5 py-0.5 rounded-full' : 'text-gray-600'}`}>
                  {day}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayEvents.slice(0, 3).map((e, i) => (
                    <Link key={i} href={`/case/${e.id}`}>
                      <div className={`text-[9px] px-1 py-0.5 rounded border-l-2 truncate cursor-pointer hover:opacity-80 ${EVENT_COLORS[e.event_type] || ''}`}>
                        {e.event_type}: {e.decedent_last_name}
                      </div>
                    </Link>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[9px] text-gray-400">+{dayEvents.length - 3} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-4 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-200 border border-blue-400" /> Service</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-200 border border-purple-400" /> Visitation</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200 border border-green-400" /> Committal</span>
      </div>
    </div>
  );
}

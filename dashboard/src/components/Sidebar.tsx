'use client';

import { useEffect, useState } from 'react';

const COLLAPSE_KEY = 'ggfo-sidebar-collapsed';

function ScheduleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      {collapsed ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
    </svg>
  );
}

type SidebarItemProps = { label: string; icon: React.ReactNode; collapsed: boolean; onClick?: () => void };

// One menu row. Icon is always shown; the label is hidden on mobile and on desktop-collapsed, so the
// bar reads as a slim icon rail on phones / when collapsed, and a full menu when expanded on desktop.
function SidebarItem({ label, icon, collapsed, onClick }: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex w-full items-center gap-2.5 rounded-md py-2 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-950 ${
        collapsed ? 'justify-center px-0' : 'justify-center px-0 md:justify-start md:px-2.5'
      }`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-500">{icon}</span>
      <span className={collapsed ? 'hidden' : 'hidden md:inline truncate'}>{label}</span>
    </button>
  );
}

// Collapsible left menu rail. Responsive by design:
//  - phones (< md): a slim icon-only rail (w-12), no collapse control (already minimal);
//  - desktop (md+): collapsible between a full menu (w-56) and an icon rail (w-14), state persisted.
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSE_KEY) === 'true') setCollapsed(true);
    } catch {
      /* ignore storage access errors */
    }
  }, []);

  // The Schedule overlay lives in the dashboard page (a sibling tree). On the dashboard, open it via
  // a window event; from any other route, navigate to the dashboard with ?panel=schedule so it opens.
  function openSchedule() {
    if (typeof window === 'undefined') return;
    if (window.location.pathname !== '/') {
      window.location.href = '/?panel=schedule';
      return;
    }
    window.dispatchEvent(new CustomEvent('ggfo:open-schedule'));
  }

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, String(next));
      } catch {
        /* ignore storage access errors */
      }
      return next;
    });
  }

  return (
    <aside
      className={`flex h-screen shrink-0 flex-col border-r border-neutral-200 bg-white transition-[width] duration-200 ${
        collapsed ? 'w-12 md:w-14' : 'w-12 md:w-56'
      }`}
    >
      <div className="flex h-12 items-center justify-between border-b border-neutral-200 px-2">
        <span className={`truncate px-1 text-[11px] font-bold uppercase tracking-wide text-neutral-400 ${collapsed ? 'hidden' : 'hidden md:block'}`}>
          Menu
        </span>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          aria-expanded={!collapsed}
          className="ml-auto hidden h-8 w-8 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-950 md:flex"
        >
          <ChevronIcon collapsed={collapsed} />
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        <SidebarItem label="Schedule" icon={<ScheduleIcon />} collapsed={collapsed} onClick={openSchedule} />
      </nav>
    </aside>
  );
}

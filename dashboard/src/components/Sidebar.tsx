'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const dashboardViews = [
  { id: 'today', label: 'Today', mark: 'T' },
  { id: 'cases', label: 'Cases', mark: 'C' },
  { id: 'arrangements', label: 'Arrangements', mark: 'A' },
  { id: 'death-certs', label: 'Death Certs', mark: 'D' },
  { id: 'cremains', label: 'Cremains', mark: 'Cr' },
  { id: 'belongings', label: 'Belongings', mark: 'B' },
  { id: 'files', label: 'Files', mark: 'F' },
];

const appLinks = [
  { href: '/texts', label: 'Texts', mark: 'Tx' },
  { href: '/payments', label: 'Payments', mark: '$' },
  { href: '/staff', label: 'Staff/Admin', mark: 'Ad' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [activeView, setActiveView] = useState('today');

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('ggfo-sidebar-collapsed') === 'true');
    const syncView = () => setActiveView(new URLSearchParams(window.location.search).get('view') || 'today');
    syncView();
    window.addEventListener('popstate', syncView);
    window.addEventListener('ggfo-view-change', syncView);
    return () => {
      window.removeEventListener('popstate', syncView);
      window.removeEventListener('ggfo-view-change', syncView);
    };
  }, []);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem('ggfo-sidebar-collapsed', String(next));
      return next;
    });
  }

  function chooseDashboardView(view: string) {
    const url = new URL(window.location.href);
    if (view === 'today') url.searchParams.delete('view');
    else url.searchParams.set('view', view);
    window.history.replaceState({}, '', url);
    setActiveView(view);
    window.dispatchEvent(new CustomEvent('ggfo-view-change'));
  }

  return (
    <aside className={`hidden h-screen shrink-0 flex-col bg-black text-white transition-all md:flex ${collapsed ? 'w-[68px]' : 'w-56'}`}>
      <div className={`border-b border-white/10 py-3 ${collapsed ? 'px-2' : 'px-4'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white p-1">
            <img src="/brand/gg-logo.png" alt="Golden Gate Funeral & Cremation Services" className="max-h-full max-w-full object-contain" />
          </div>
          <div className={collapsed ? 'hidden' : ''}>
            <div className="text-sm font-bold leading-tight text-[#efb70c]">Golden Gate</div>
            <div className="mt-0.5 text-xs leading-tight text-white/60">Funeral OS</div>
          </div>
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="mt-3 flex h-8 w-full items-center justify-center rounded-md border border-white/10 text-xs font-bold text-white/60 hover:bg-white/10 hover:text-white"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '>' : '< Collapse'}
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {dashboardViews.map((item) => {
          const active = pathname === '/' && activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => chooseDashboardView(item.id)}
              className={`group relative flex h-9 w-full items-center rounded-md px-2 text-sm font-semibold transition ${collapsed ? 'justify-center' : 'gap-2'} ${
                active ? 'bg-[#efb70c] text-black' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              title={collapsed ? item.label : undefined}
              aria-label={item.label}
            >
              <span className="flex h-6 min-w-6 items-center justify-center rounded text-[11px] font-black">{item.mark}</span>
              <span className={collapsed ? 'hidden' : ''}>{item.label}</span>
              {collapsed ? (
                <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold text-white shadow-lg group-hover:block">
                  {item.label}
                </span>
              ) : null}
            </button>
          );
        })}

        <div className="my-2 border-t border-white/10" />

        {appLinks.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex h-9 items-center rounded-md px-2 text-sm font-semibold transition ${collapsed ? 'justify-center' : 'gap-2'} ${
                active ? 'bg-[#efb70c] text-black' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              title={collapsed ? item.label : undefined}
              aria-label={item.label}
            >
              <span className="flex h-6 min-w-6 items-center justify-center rounded text-[11px] font-black">{item.mark}</span>
              <span className={collapsed ? 'hidden' : ''}>{item.label}</span>
              {collapsed ? (
                <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold text-white shadow-lg group-hover:block">
                  {item.label}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

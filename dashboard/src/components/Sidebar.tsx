'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const navItems = [
  { href: '/', label: 'Master Sheet' },
  { href: '/calendar', label: 'Schedule' },
  { href: '/texts', label: 'Texts' },
  { href: '/payments', label: 'Payments' },
  { href: '/staff', label: 'Staff' },
  { href: '/aftercare', label: 'Aftercare' },
  { href: '/metrics', label: 'Metrics' },
  { href: '/chat', label: 'Live Chat' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem('ggfo-sidebar-collapsed') === 'true');
  }, []);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      window.localStorage.setItem('ggfo-sidebar-collapsed', String(next));
      return next;
    });
  }

  return (
    <aside className={`hidden h-screen shrink-0 flex-col bg-black text-white transition-all md:flex ${collapsed ? 'w-[72px]' : 'w-64'}`}>
      <div className={`border-b border-white/10 py-5 ${collapsed ? 'px-3' : 'px-5'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="flex h-14 w-14 items-center justify-center rounded-md bg-white p-1.5">
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
          className="mt-4 flex h-8 w-full items-center justify-center rounded-md border border-white/10 text-xs font-bold text-white/60 hover:bg-white/10 hover:text-white"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? 'Open' : 'Collapse'}
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex h-10 items-center rounded-md px-3 text-sm font-semibold transition ${collapsed ? 'justify-center' : ''} ${
                active ? 'bg-[#efb70c] text-black' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              title={collapsed ? item.label : undefined}
              aria-label={item.label}
            >
              <span className={collapsed ? 'hidden' : ''}>{item.label}</span>
              {collapsed ? (
                <>
                  <span className={`h-6 w-1 rounded-full ${active ? 'bg-[#efb70c]' : 'bg-white/35 group-hover:bg-white/80'}`} aria-hidden="true" />
                  <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs font-semibold text-white shadow-lg group-hover:block">
                    {item.label}
                  </span>
                </>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className={`border-t border-white/10 py-4 ${collapsed ? 'px-3 text-center' : 'px-5'}`}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#efb70c]">Read-only Sources</div>
        <div className={`mt-2 text-xs leading-5 text-white/50 ${collapsed ? 'hidden' : ''}`}>Human approval stays required for family-facing publishing.</div>
      </div>
    </aside>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Cases', icon: '📋' },
  { href: '/calendar', label: 'Calendar', icon: '📅' },
  { href: '/metrics', label: 'Metrics', icon: '📊' },
  { href: '/aftercare', label: 'Aftercare', icon: '💛' },
  { href: '/texts', label: 'Texts', icon: '💬' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-brand-dark text-white flex flex-col h-screen shrink-0">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-white/10">
        <h1 className="text-lg font-bold text-gold">GGFuneralOS</h1>
        <p className="text-xs text-white/50 mt-1">KC Golden Gate</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-5 py-3 text-sm transition-colors ${
                active
                  ? 'bg-white/10 text-gold border-r-2 border-gold'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-white/10 text-xs text-white/30">
        GGFuneralOS v0.1
      </div>
    </aside>
  );
}

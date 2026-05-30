'use client';

import { usePathname } from 'next/navigation';

function publicPath(pathname: string) {
  return pathname === '/login' || pathname.startsWith('/claim/') || pathname.startsWith('/portal/');
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (publicPath(pathname)) {
    return <main className="min-h-screen flex-1 overflow-auto">{children}</main>;
  }

  return (
    <main data-dashboard-scroll-root className="min-w-0 flex-1 overflow-auto">{children}</main>
  );
}

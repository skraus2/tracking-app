'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { LayoutDashboard, Store, Users, Settings, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRole } from '@/lib/role-context';

const adminNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/trackings', label: 'Trackings', icon: Package },
  { href: '/dashboard/stores', label: 'Stores', icon: Store },
  { href: '/dashboard/users', label: 'Users', icon: Users },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

const customerNavItems: typeof adminNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/trackings', label: 'Trackings', icon: Package },
];

interface DashboardSidebarProps {
  isCollapsed?: boolean;
}

export function DashboardSidebar({
  isCollapsed = false,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { role } = useRole();

  // Show customer nav items by default while loading or if role is null
  const navItems = role === 'admin' ? adminNavItems : customerNavItems;

  // Preserve stores query parameter when navigating between dashboard pages
  const getHrefWithParams = (href: string) => {
    const storesParam = searchParams.get('stores');
    if (storesParam && (href === '/dashboard' || href === '/dashboard/trackings')) {
      const params = new URLSearchParams();
      params.set('stores', storesParam);
      return `${href}?${params.toString()}`;
    }
    return href;
  };

  return (
    <aside
      className={cn(
        'h-full border-r border-border bg-card transition-all duration-300',
        isCollapsed ? 'w-0 overflow-hidden border-r-0' : 'w-64 flex flex-col'
      )}
    >
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={getHrefWithParams(item.href)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

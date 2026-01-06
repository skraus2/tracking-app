'use client';

import { LogOut, User, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRole } from '@/lib/role-context';
import { ThemeToggle } from '@/components/theme-toggle';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

interface DashboardHeaderProps {
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function DashboardHeader({ onToggleSidebar }: DashboardHeaderProps) {
  const { role, setRole } = useRole();
  const router = useRouter();
  const [userName, setUserName] = useState<string>('Loading...');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch current user session
    authClient.getSession().then((session) => {
      if (session?.data?.user) {
        const user = session.data.user as {
          id: string;
          name: string;
          email: string;
          role?: string;
        };
        setUserName(user.name || user.email || 'User');

        // Update role context based on actual user role
        if (user.role) {
          const userRole =
            user.role.toLowerCase() === 'admin' ? 'admin' : 'customer';
          setRole(userRole);
        } else {
          setRole('customer'); // Default to customer if no role
        }
      } else {
        setUserName('User');
        setRole('customer');
      }
      setLoading(false);
    });
  }, [setRole]);

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push('/sign-in');
        },
      },
    });
  };

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-2">
        {onToggleSidebar && (
          <Button variant="ghost" size="icon" onClick={onToggleSidebar}>
            <PanelLeft className="h-5 w-5" />
          </Button>
        )}
        <ThemeToggle />
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          title="Logout"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2 px-3 py-2">
          <User className="h-4 w-4" />
          <span className="text-sm font-medium">
            {loading ? 'Loading...' : userName}
          </span>
          {role === 'admin' && (
            <Badge variant="secondary" className="ml-1 capitalize">
              Admin
            </Badge>
          )}
        </div>
      </div>
    </header>
  );
}

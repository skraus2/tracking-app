'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { DashboardHeader } from '@/components/dashboard-header';
import { DashboardSidebar } from '@/components/dashboard-sidebar';
import { RoleProvider, useRole } from '@/lib/role-context';
import { authClient } from '@/lib/auth-client';

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { role } = useRole();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check authentication and access status
    const checkAccess = async () => {
      const session = await authClient.getSession();
      
      if (!session?.data?.user) {
        router.push('/sign-in');
        return;
      }

      // Check current access status from API (validates against database)
      try {
        const response = await fetch('/api/auth/check-access');
        const data = await response.json();

        if (!data.isAuthenticated) {
          router.push('/sign-in');
          return;
        }

        if (!data.hasAccess) {
          // User doesn't have access, redirect to sign-in with message
          router.push('/sign-in?error=access_denied');
          return;
        }

        setIsAuthLoading(false);
      } catch (error) {
        console.error('Error checking access:', error);
        // Fallback to session check
        const user = session.data.user as { access?: boolean };
        if (user.access === false) {
          router.push('/sign-in?error=access_denied');
        } else {
          setIsAuthLoading(false);
        }
      }
    };

    checkAccess();

    // Set up interval to check access status periodically (every 30 seconds)
    const interval = setInterval(() => {
      checkAccess();
    }, 30000);

    return () => clearInterval(interval);
  }, [router]);

  if (isAuthLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <DashboardHeader
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      <div className="flex flex-1 overflow-hidden">
        <DashboardSidebar isCollapsed={isSidebarCollapsed} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </RoleProvider>
  );
}

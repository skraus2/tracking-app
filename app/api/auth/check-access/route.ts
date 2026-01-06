import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { UserAccess } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ hasAccess: false, isAuthenticated: false }, { status: 200 });
    }

    // Check current access status from database (not just from session cache)
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { access: true },
    });

    if (!dbUser) {
      return NextResponse.json({ hasAccess: false, isAuthenticated: true }, { status: 200 });
    }

    const hasAccess = dbUser.access === UserAccess.Enabled;

    // If access is disabled, invalidate session
    if (!hasAccess) {
      try {
        await auth.api.signOut({
          headers: await headers(),
        });
      } catch (error) {
        // Ignore sign out errors
      }
    }

    return NextResponse.json({ 
      hasAccess, 
      isAuthenticated: true 
    }, { status: 200 });
  } catch (error) {
    console.error('Error checking access:', error);
    return NextResponse.json({ hasAccess: false, isAuthenticated: false }, { status: 200 });
  }
}


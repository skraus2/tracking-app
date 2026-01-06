import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { UserAccess } from '@prisma/client';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Customer';
  access: boolean;
}

export async function getSession() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    return session;
  } catch (error) {
    return null;
  }
}

export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession();
  
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  const sessionUser = session.user as SessionUser;
  
  // Check current access status from database (not just from session cache)
  // This ensures we catch access changes that happened after login
  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { access: true },
  });

  if (!dbUser) {
    throw new Error('User not found');
  }

  // If access is disabled in database, invalidate session and deny access
  if (dbUser.access !== UserAccess.Enabled) {
    // Invalidate session by signing out
    try {
      await auth.api.signOut({
        headers: await headers(),
      });
    } catch (error) {
      // Ignore sign out errors, we'll still deny access
    }
    throw new Error('Access denied');
  }

  // Return session user (access is already validated from DB)
  return sessionUser;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireAuth();
  
  if (user.role !== 'Admin') {
    throw new Error('Admin access required');
  }

  return user;
}

export function createErrorResponse(
  message: string,
  status: number = 400
): NextResponse {
  return NextResponse.json(
    { error: message },
    { status }
  );
}

export function createUnauthorizedResponse(): NextResponse {
  return createErrorResponse('Unauthorized', 401);
}

export function createForbiddenResponse(): NextResponse {
  return createErrorResponse('Forbidden', 403);
}

export function createNotFoundResponse(): NextResponse {
  return createErrorResponse('Not found', 404);
}

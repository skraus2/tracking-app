import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  requireAdmin,
  getSession,
  createErrorResponse,
  createUnauthorizedResponse,
  createNotFoundResponse,
} from '@/lib/auth-helpers';
import { transformUser } from '@/lib/api-helpers';
import { UserRole, UserAccess } from '@prisma/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        stores: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!user) {
      return createNotFoundResponse();
    }

    return NextResponse.json(transformUser(user));
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message === 'Access denied') {
      return createUnauthorizedResponse();
    }
    console.error('Error fetching user:', error);
    return createErrorResponse(error.message || 'Failed to fetch user', 500);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();

    const { id } = await params;
    const body = await request.json();
    const { name, email, role, access } = body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      return createNotFoundResponse();
    }

    // Get current session to prevent self-modification of access and role
    const session = await getSession();
    const currentUserId = session?.user?.id;

    // Prevent updating own access
    if (id === currentUserId && access !== undefined) {
      return createErrorResponse('Cannot modify your own access', 400);
    }

    // Prevent updating own role
    if (id === currentUserId && role !== undefined) {
      return createErrorResponse('Cannot modify your own role', 400);
    }

    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return createErrorResponse('Invalid email format');
      }
    }

    // Check if email is being changed and if it conflicts
    if (email && email !== existingUser.email) {
      const emailConflict = await prisma.user.findUnique({
        where: { email },
      });

      if (emailConflict) {
        return createErrorResponse('User with this email already exists', 409);
      }
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) {
      updateData.role = role === 'Admin' ? UserRole.Admin : UserRole.Customer;
    }
    if (access !== undefined) {
      updateData.access = access === true ? UserAccess.Enabled : UserAccess.Disabled;
    }

    // Update user
    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        stores: {
          select: {
            id: true,
          },
        },
      },
    });

    return NextResponse.json(transformUser(user));
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message === 'Access denied') {
      return createUnauthorizedResponse();
    }
    if (error.message === 'Admin access required') {
      return createErrorResponse('Admin access required', 403);
    }
    console.error('Error updating user:', error);
    
    // Handle Prisma unique constraint errors
    if (error.code === 'P2002') {
      return createErrorResponse('User with this email already exists', 409);
    }

    return createErrorResponse(error.message || 'Failed to update user', 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();

    const { id } = await params;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return createNotFoundResponse();
    }

    // Get current session to prevent self-deletion
    const session = await getSession();
    const currentUserId = session?.user?.id;

    // Prevent deleting own account
    if (id === currentUserId) {
      return createErrorResponse('Cannot delete your own account', 400);
    }

    // Delete user (cascade will handle stores)
    await prisma.user.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message === 'Access denied') {
      return createUnauthorizedResponse();
    }
    if (error.message === 'Admin access required') {
      return createErrorResponse('Admin access required', 403);
    }
    console.error('Error deleting user:', error);
    return createErrorResponse(error.message || 'Failed to delete user', 500);
  }
}

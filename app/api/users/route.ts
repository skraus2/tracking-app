import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  requireAdmin,
  createErrorResponse,
  createUnauthorizedResponse,
} from '@/lib/auth-helpers';
import {
  transformUser,
  parsePaginationParams,
  parseSortParams,
  createPaginatedResponse,
  FrontendUser,
} from '@/lib/api-helpers';
import { UserRole, UserAccess } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePaginationParams(searchParams);
    const { sortBy, sortOrder } = parseSortParams(searchParams);
    const search = searchParams.get('search') || '';
    const roleFilter = searchParams.get('role') || 'all';
    const accessFilter = searchParams.get('access') || 'all';

    // Build where clause
    const where: any = {};

    if (roleFilter !== 'all') {
      where.role = roleFilter === 'Admin' ? UserRole.Admin : UserRole.Customer;
    }

    if (accessFilter !== 'all') {
      where.access = accessFilter === 'enabled' ? UserAccess.Enabled : UserAccess.Disabled;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Build orderBy clause
    let orderBy: any = { createdAt: 'desc' };
    if (sortBy) {
      if (sortBy === 'name') {
        orderBy = { name: sortOrder };
      } else if (sortBy === 'email') {
        orderBy = { email: sortOrder };
      } else if (sortBy === 'role') {
        orderBy = { role: sortOrder };
      }
    }

    // Get total count
    const total = await prisma.user.count({ where });

    // Get users with stores
    const users = await prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        stores: {
          select: {
            id: true,
          },
        },
      },
    });

    const transformedUsers: FrontendUser[] = users.map(transformUser);

    return NextResponse.json(createPaginatedResponse(transformedUsers, total, page, limit));
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message === 'Access denied') {
      return createUnauthorizedResponse();
    }
    console.error('Error fetching users:', error);
    return createErrorResponse(error.message || 'Failed to fetch users', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json();
    const { name, email, role, access } = body;

    // Validate required fields
    if (!name || !email) {
      return createErrorResponse('Missing required fields: name, email');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return createErrorResponse('Invalid email format');
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return createErrorResponse('User with this email already exists', 409);
    }

    // Create user
    // Note: Better Auth handles password/auth separately
    // We're just creating the user record here
    const user = await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        name,
        email,
        emailVerified: false,
        role: role === 'Admin' ? UserRole.Admin : UserRole.Customer,
        access: access === true ? UserAccess.Enabled : UserAccess.Disabled,
      },
      include: {
        stores: {
          select: {
            id: true,
          },
        },
      },
    });

    return NextResponse.json(transformUser(user), { status: 201 });
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message === 'Access denied') {
      return createUnauthorizedResponse();
    }
    if (error.message === 'Admin access required') {
      return createErrorResponse('Admin access required', 403);
    }
    console.error('Error creating user:', error);
    
    // Handle Prisma unique constraint errors
    if (error.code === 'P2002') {
      return createErrorResponse('User with this email already exists', 409);
    }

    return createErrorResponse(error.message || 'Failed to create user', 500);
  }
}

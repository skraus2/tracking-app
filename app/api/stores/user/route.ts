import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  createErrorResponse,
  createUnauthorizedResponse,
} from '@/lib/auth-helpers';
import { transformStore, FrontendStore } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    // If user is admin, return all stores
    // Otherwise, return only stores owned by the user
    const stores = await prisma.store.findMany({
      where:
        user.role === 'Admin'
          ? {} // Admin sees all stores
          : {
              ownerId: user.id,
            },
      include: {
        owner: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    // Get tracking counts for each store
    // Count unique Tracking records that have at least one fulfillment from each store
    const storeIds = stores.map((s) => s.id);
    const trackingCountMap = new Map<string, number>();
    
    // Count Tracking records for all stores in parallel
    const countPromises = storeIds.map(async (storeId) => {
      const count = await prisma.tracking.count({
        where: {
          fulfillments: {
            some: {
              shopId: storeId,
            },
          },
        },
      });
      return { storeId, count };
    });
    
    const counts = await Promise.all(countPromises);
    counts.forEach(({ storeId, count }) => {
      trackingCountMap.set(storeId, count);
    });

    const transformedStores: FrontendStore[] = stores.map((store) =>
      transformStore(store, trackingCountMap.get(store.id) || 0)
    );

    return NextResponse.json({ data: transformedStores });
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message === 'Access denied') {
      return createUnauthorizedResponse();
    }
    console.error('Error fetching user stores:', error);
    return createErrorResponse(
      error.message || 'Failed to fetch stores',
      500
    );
  }
}


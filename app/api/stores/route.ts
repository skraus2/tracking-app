import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  requireAdmin,
  createErrorResponse,
  createUnauthorizedResponse,
} from '@/lib/auth-helpers';
import {
  transformStore,
  parsePaginationParams,
  parseSortParams,
  createPaginatedResponse,
  FrontendStore,
} from '@/lib/api-helpers';
import { StoreStatus } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePaginationParams(searchParams);
    const { sortBy, sortOrder } = parseSortParams(searchParams);
    const search = searchParams.get('search') || '';
    const statusFilter = searchParams.get('status') || 'all';

    // Build where clause
    const where: any = {};

    if (statusFilter !== 'all') {
      where.status = statusFilter === 'active' ? StoreStatus.Active : StoreStatus.Inactive;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { shopDomain: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Build orderBy clause
    let orderBy: any = { createdAt: 'desc' };
    if (sortBy) {
      if (sortBy === 'name') {
        orderBy = { name: sortOrder };
      } else if (sortBy === 'trackings') {
        // Placeholder - would need to join with tracking data
        orderBy = { createdAt: sortOrder };
      }
    }

    // Get total count
    const total = await prisma.store.count({ where });

    // Get stores with owner
    const stores = await prisma.store.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        owner: {
          select: {
            name: true,
          },
        },
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

    // Transform stores with tracking counts
    const transformedStores: FrontendStore[] = stores.map((store) =>
      transformStore(store, trackingCountMap.get(store.id) || 0)
    );

    // If sorting by trackings, sort the transformed stores
    if (sortBy === 'trackings') {
      transformedStores.sort((a, b) => {
        const diff = a.remainingTrackings - b.remainingTrackings;
        return sortOrder === 'asc' ? diff : -diff;
      });
    }

    return NextResponse.json(createPaginatedResponse(transformedStores, total, page, limit));
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message === 'Access denied') {
      return createUnauthorizedResponse();
    }
    console.error('Error fetching stores:', error);
    return createErrorResponse(error.message || 'Failed to fetch stores', 500);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const logContext = { shopDomain: '', storeId: '' };

  try {
    await requireAdmin();

    const body = await request.json();
    const { name, shopDomain, clientId, secret, ownerId, status } = body;
    logContext.shopDomain = shopDomain;

    console.log('📦 Starting store creation process', {
      shopDomain,
      name,
      ownerId,
      status,
      hasSecret: !!secret,
    });

    // Validate required fields
    if (!name || !shopDomain || !clientId || !ownerId) {
      console.warn('❌ Store creation failed: Missing required fields', {
        shopDomain,
        missing: {
          name: !name,
          shopDomain: !shopDomain,
          clientId: !clientId,
          ownerId: !ownerId,
        },
      });
      return createErrorResponse('Missing required fields: name, shopDomain, clientId, ownerId');
    }

    // Validate owner exists
    console.log('🔍 Validating owner', { shopDomain, ownerId });
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
    });

    if (!owner) {
      console.warn('❌ Store creation failed: Owner not found', { shopDomain, ownerId });
      return createErrorResponse('Owner not found');
    }
    console.log('✅ Owner validated', { shopDomain, ownerName: owner.name });

    // Check if shopDomain already exists
    console.log('🔍 Checking if store domain already exists', { shopDomain });
    const existingStore = await prisma.store.findUnique({
      where: { shopDomain },
    });

    if (existingStore) {
      console.warn('❌ Store creation failed: Domain already exists', { shopDomain, existingStoreId: existingStore.id });
      return createErrorResponse('Store with this domain already exists', 409);
    }
    console.log('✅ Domain is available', { shopDomain });

    // Create store
    console.log('💾 Creating store in database', { shopDomain, name, status });
    const store = await prisma.store.create({
      data: {
        name,
        shopDomain,
        clientId,
        secret: secret || '',
        status: status === 'inactive' ? StoreStatus.Inactive : StoreStatus.Active,
        ownerId,
      },
      include: {
        owner: {
          select: {
            name: true,
          },
        },
      },
    });
    logContext.storeId = store.id;

    console.log('✅ Store created successfully', {
      shopDomain,
      storeId: store.id,
      name: store.name,
      status: store.status,
      ownerName: store.owner.name,
    });

    // Try to fetch access token (non-blocking)
    // If this fails, the store will still be created and token will be fetched on first API call
    let tokenFetched = false;
    if (secret && secret.trim() !== '') {
      console.log('🔑 Attempting to fetch access token', { shopDomain });
      try {
        const { shopifyService } = await import('@/lib/services/shopify');
        await shopifyService.getAccessToken(shopDomain);
        console.log('✅ Access token obtained successfully', {
          shopDomain,
          storeId: store.id,
        });
        tokenFetched = true;
      } catch (error: any) {
        console.warn('⚠️ Could not fetch access token (non-blocking)', {
          shopDomain,
          storeId: store.id,
          error: error.message || error,
        });
        // Store is created without token, will be fetched on first API call
      }
    } else {
      console.log('ℹ️ No secret provided, skipping access token fetch', {
        shopDomain,
        storeId: store.id,
      });
    }

    // Setup webhooks if store is active and token was fetched successfully
    let webhooksSetup = false;
    let webhookResults: Array<any> = [];
    if (store.status === StoreStatus.Active && tokenFetched) {
      console.log('🔗 Starting webhook setup', {
        shopDomain,
        storeId: store.id,
        status: store.status,
        hasToken: tokenFetched,
      });
      try {
        const { shopifyService } = await import('@/lib/services/shopify');
        webhookResults = await shopifyService.ensureWebhooksForStore(shopDomain);
        const successCount = webhookResults.filter((r) => r !== null).length;
        webhooksSetup = successCount > 0;
        
        // Update webhooksRegistered status based on setup result
        await prisma.store.update({
          where: { id: store.id },
          data: { webhooksRegistered: webhooksSetup },
        });
        
        console.log('✅ Webhook setup completed', {
          shopDomain,
          storeId: store.id,
          successCount,
          totalWebhooks: webhookResults.length,
          webhooksRegistered: webhooksSetup,
          webhooks: webhookResults.map((r, idx) => ({
            topic: r?.topic || 'unknown',
            id: r?.id || null,
            uri: r?.uri || null,
            status: r ? 'success' : 'failed',
          })),
        });
      } catch (error: any) {
        console.warn('⚠️ Webhook setup failed (non-blocking)', {
          shopDomain,
          storeId: store.id,
          error: error.message || error,
        });
        // Update webhooksRegistered to false on failure
        await prisma.store.update({
          where: { id: store.id },
          data: { webhooksRegistered: false },
        }).catch(() => {
          // Ignore update errors
        });
        // Webhook setup failure is non-blocking
      }
    } else {
      const reason = !tokenFetched
        ? 'access token not available'
        : store.status !== StoreStatus.Active
        ? 'store is not active'
        : 'unknown';
      console.log('ℹ️ Skipping webhook setup', {
        shopDomain,
        storeId: store.id,
        reason,
        status: store.status,
        tokenFetched,
      });
      // Update webhooksRegistered to false if webhooks weren't set up
      await prisma.store.update({
        where: { id: store.id },
        data: { webhooksRegistered: false },
      }).catch(() => {
        // Ignore update errors
      });
    }

    // Fetch store again to get updated token if it was fetched
    const updatedStore = await prisma.store.findUnique({
      where: { id: store.id },
      include: {
        owner: {
          select: {
            name: true,
          },
        },
      },
    });

    // Get tracking count for the new store (will be 0 for a new store)
    // Count unique Tracking records that have at least one fulfillment from this store
    const trackingCount = await prisma.tracking.count({
      where: {
        fulfillments: {
          some: {
            shopId: store.id,
          },
        },
      },
    });

    const duration = Date.now() - startTime;
    console.log('🎉 Store creation process completed successfully', {
      shopDomain,
      storeId: store.id,
      duration: `${duration}ms`,
      summary: {
        storeCreated: true,
        accessTokenFetched: tokenFetched,
        webhooksSetup: webhooksSetup,
        webhookCount: webhookResults.length,
        trackingCount,
      },
    });

    return NextResponse.json(transformStore(updatedStore || store, trackingCount), { status: 201 });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    if (error.message === 'Unauthorized' || error.message === 'Access denied') {
      console.warn('❌ Store creation failed: Unauthorized', {
        shopDomain: logContext.shopDomain,
        duration: `${duration}ms`,
      });
      return createUnauthorizedResponse();
    }
    if (error.message === 'Admin access required') {
      console.warn('❌ Store creation failed: Admin access required', {
        shopDomain: logContext.shopDomain,
        duration: `${duration}ms`,
      });
      return createErrorResponse('Admin access required', 403);
    }
    
    // Handle Prisma unique constraint errors
    if (error.code === 'P2002') {
      console.warn('❌ Store creation failed: Duplicate domain', {
        shopDomain: logContext.shopDomain,
        error: error.message,
        duration: `${duration}ms`,
      });
      return createErrorResponse('Store with this domain already exists', 409);
    }

    console.error('❌ Store creation failed with error', {
      shopDomain: logContext.shopDomain,
      storeId: logContext.storeId || 'not created',
      error: error.message || error,
      stack: error.stack,
      duration: `${duration}ms`,
    });

    return createErrorResponse(error.message || 'Failed to create store', 500);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  requireAdmin,
  createErrorResponse,
  createUnauthorizedResponse,
  createNotFoundResponse,
} from '@/lib/auth-helpers';
import { transformStore } from '@/lib/api-helpers';
import { StoreStatus } from '@prisma/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();

    const { id } = await params;

    const store = await prisma.store.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!store) {
      return createNotFoundResponse();
    }

    // Get tracking count for the store
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

    return NextResponse.json(transformStore(store, trackingCount));
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message === 'Access denied') {
      return createUnauthorizedResponse();
    }
    console.error('Error fetching store:', error);
    return createErrorResponse(error.message || 'Failed to fetch store', 500);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const logContext = { storeId: '', shopDomain: '' };

  try {
    await requireAdmin();

    const { id } = await params;
    logContext.storeId = id;
    const body = await request.json();
    const { name, shopDomain, clientId, secret, ownerId, status } = body;

    console.log('📝 Starting store update process', {
      storeId: id,
      updates: {
        name: name !== undefined,
        shopDomain: shopDomain !== undefined,
        clientId: clientId !== undefined,
        secret: secret !== undefined,
        ownerId: ownerId !== undefined,
        status: status !== undefined,
      },
    });

    // Check if store exists
    const existingStore = await prisma.store.findUnique({
      where: { id },
    });

    if (!existingStore) {
      console.warn('❌ Store update failed: Store not found', { storeId: id });
      return createNotFoundResponse();
    }
    logContext.shopDomain = existingStore.shopDomain;

    console.log('✅ Store found', {
      storeId: id,
      shopDomain: existingStore.shopDomain,
      currentName: existingStore.name,
      currentStatus: existingStore.status,
    });

    // Validate owner if provided
    if (ownerId) {
      console.log('🔍 Validating owner', { storeId: id, ownerId });
      const owner = await prisma.user.findUnique({
        where: { id: ownerId },
      });

      if (!owner) {
        console.warn('❌ Store update failed: Owner not found', { storeId: id, ownerId });
        return createErrorResponse('Owner not found');
      }
      console.log('✅ Owner validated', { storeId: id, ownerName: owner.name });
    }

    // Check if shopDomain is being changed and if it conflicts
    if (shopDomain && shopDomain !== existingStore.shopDomain) {
      console.log('🔍 Checking domain availability', {
        storeId: id,
        oldDomain: existingStore.shopDomain,
        newDomain: shopDomain,
      });
      const domainConflict = await prisma.store.findUnique({
        where: { shopDomain },
      });

      if (domainConflict) {
        console.warn('❌ Store update failed: Domain already exists', {
          storeId: id,
          newDomain: shopDomain,
          conflictingStoreId: domainConflict.id,
        });
        return createErrorResponse('Store with this domain already exists', 409);
      }
      console.log('✅ Domain is available', { storeId: id, newDomain: shopDomain });
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (shopDomain !== undefined) updateData.shopDomain = shopDomain;
    if (clientId !== undefined) updateData.clientId = clientId;
    if (secret !== undefined && secret !== '') updateData.secret = secret;
    if (ownerId !== undefined) updateData.ownerId = ownerId;
    if (status !== undefined) {
      updateData.status = status === 'active' ? StoreStatus.Active : StoreStatus.Inactive;
    }

    // Update store
    console.log('💾 Updating store in database', {
      storeId: id,
      updates: Object.keys(updateData),
    });
    const store = await prisma.store.update({
      where: { id },
      data: updateData,
      include: {
        owner: {
          select: {
            name: true,
          },
        },
      },
    });
    logContext.shopDomain = store.shopDomain;

    console.log('✅ Store updated successfully', {
      storeId: id,
      shopDomain: store.shopDomain,
      name: store.name,
      status: store.status,
      ownerName: store.owner.name,
    });

    // Track if credentials or shopDomain changed
    const credentialsChanged = (secret !== undefined && secret !== '') || clientId !== undefined;
    const shopDomainChanged = shopDomain !== undefined && shopDomain !== existingStore.shopDomain;

    console.log('🔍 Checking for credential/domain changes', {
      storeId: id,
      shopDomain: store.shopDomain,
      credentialsChanged,
      shopDomainChanged,
    });

    // If secret, clientId, or shopDomain changed, invalidate old token and webhooks
    if (credentialsChanged || shopDomainChanged) {
      console.log('🔄 Invalidating old access token and webhooks', {
        storeId: id,
        shopDomain: store.shopDomain,
        reason: credentialsChanged ? 'credentials changed' : 'domain changed',
      });

      // Invalidate old token
      await prisma.store.update({
        where: { id },
        data: {
          accessToken: null,
          accessTokenExpiresAt: null,
        },
      });
      console.log('✅ Access token invalidated', { storeId: id });

      // Remove old webhooks (they might be for wrong domain or invalid credentials)
      try {
        const { shopifyService } = await import('@/lib/services/shopify');
        const removedCount = await shopifyService.removeWebhooksForStore(existingStore.shopDomain);
        console.log('✅ Old webhooks removed', {
          storeId: id,
          oldDomain: existingStore.shopDomain,
          removedCount,
        });
        // Update webhooksRegistered to false after removal
        await prisma.store.update({
          where: { id },
          data: { webhooksRegistered: false },
        });
      } catch (error: any) {
        console.warn('⚠️ Could not remove old webhooks (non-blocking)', {
          storeId: id,
          oldDomain: existingStore.shopDomain,
          error: error.message || error,
        });
        // Update webhooksRegistered to false on error
        await prisma.store.update({
          where: { id },
          data: { webhooksRegistered: false },
        }).catch(() => {
          // Ignore update errors
        });
      }
    }

    // Try to fetch new access token if credentials changed
    let tokenFetched = false;
    if (credentialsChanged && store.secret && store.secret.trim() !== '') {
      console.log('🔑 Attempting to fetch new access token', {
        storeId: id,
        shopDomain: store.shopDomain,
      });
      try {
        const { shopifyService } = await import('@/lib/services/shopify');
        await shopifyService.getAccessToken(store.shopDomain);
        console.log('✅ Access token obtained successfully', {
          storeId: id,
          shopDomain: store.shopDomain,
        });
        tokenFetched = true;
      } catch (error: any) {
        console.warn('⚠️ Could not fetch access token (non-blocking)', {
          storeId: id,
          shopDomain: store.shopDomain,
          error: error.message || error,
        });
      }
    }

    // Setup webhooks only if credentials or domain changed (not for status changes)
    // Webhooks remain active regardless of store status
    let webhooksSetup = false;
    let webhookResults: Array<any> = [];
    if ((credentialsChanged || shopDomainChanged) && store.status === StoreStatus.Active) {
      console.log('🔗 Starting webhook setup', {
        storeId: id,
        shopDomain: store.shopDomain,
        status: store.status,
        hasToken: tokenFetched || !!store.accessToken,
      });
      try {
        const { shopifyService } = await import('@/lib/services/shopify');
        if (tokenFetched || store.accessToken) {
          webhookResults = await shopifyService.ensureWebhooksForStore(store.shopDomain);
          const successCount = webhookResults.filter((r) => r !== null).length;
          webhooksSetup = successCount > 0;
          
          // Update webhooksRegistered status based on setup result
          await prisma.store.update({
            where: { id },
            data: { webhooksRegistered: webhooksSetup },
          });
          
          console.log('✅ Webhook setup completed', {
            storeId: id,
            shopDomain: store.shopDomain,
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
        } else {
          console.log('ℹ️ Skipping webhook setup: No access token available', {
            storeId: id,
            shopDomain: store.shopDomain,
          });
          // Update webhooksRegistered to false if no token available
          await prisma.store.update({
            where: { id },
            data: { webhooksRegistered: false },
          });
        }
      } catch (error: any) {
        console.warn('⚠️ Webhook setup failed (non-blocking)', {
          storeId: id,
          shopDomain: store.shopDomain,
          error: error.message || error,
        });
        // Update webhooksRegistered to false on failure
        await prisma.store.update({
          where: { id },
          data: { webhooksRegistered: false },
        }).catch(() => {
          // Ignore update errors
        });
        // Webhook setup failure is non-blocking
      }
    } else {
      const reason = !(credentialsChanged || shopDomainChanged)
        ? 'no credential/domain changes'
        : store.status !== StoreStatus.Active
        ? 'store is not active'
        : 'unknown';
      console.log('ℹ️ Skipping webhook setup', {
        storeId: id,
        shopDomain: store.shopDomain,
        reason,
        credentialsChanged,
        shopDomainChanged,
        status: store.status,
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

    // Get tracking count for the store
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
    console.log('🎉 Store update process completed successfully', {
      storeId: id,
      shopDomain: store.shopDomain,
      duration: `${duration}ms`,
      summary: {
        storeUpdated: true,
        accessTokenFetched: tokenFetched,
        webhooksSetup: webhooksSetup,
        webhookCount: webhookResults.length,
        trackingCount,
      },
    });

    return NextResponse.json(transformStore(updatedStore || store, trackingCount));
  } catch (error: any) {
    const duration = Date.now() - startTime;

    if (error.message === 'Unauthorized' || error.message === 'Access denied') {
      console.warn('❌ Store update failed: Unauthorized', {
        storeId: logContext.storeId,
        shopDomain: logContext.shopDomain,
        duration: `${duration}ms`,
      });
      return createUnauthorizedResponse();
    }
    if (error.message === 'Admin access required') {
      console.warn('❌ Store update failed: Admin access required', {
        storeId: logContext.storeId,
        shopDomain: logContext.shopDomain,
        duration: `${duration}ms`,
      });
      return createErrorResponse('Admin access required', 403);
    }
    
    // Handle Prisma unique constraint errors
    if (error.code === 'P2002') {
      console.warn('❌ Store update failed: Duplicate domain', {
        storeId: logContext.storeId,
        shopDomain: logContext.shopDomain,
        error: error.message,
        duration: `${duration}ms`,
      });
      return createErrorResponse('Store with this domain already exists', 409);
    }

    console.error('❌ Store update failed with error', {
      storeId: logContext.storeId,
      shopDomain: logContext.shopDomain,
      error: error.message || error,
      stack: error.stack,
      duration: `${duration}ms`,
    });

    return createErrorResponse(error.message || 'Failed to update store', 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();

    const { id } = await params;

    // Check if store exists
    const store = await prisma.store.findUnique({
      where: { id },
    });

    if (!store) {
      return createNotFoundResponse();
    }

    // Remove webhooks before deleting store (non-blocking)
    try {
      const { shopifyService } = await import('@/lib/services/shopify');
      await shopifyService.removeWebhooksForStore(store.shopDomain);
      // Update webhooksRegistered to false after removal
      await prisma.store.update({
        where: { id },
        data: { webhooksRegistered: false },
      }).catch(() => {
        // Ignore update errors (store might already be deleted)
      });
    } catch (error: any) {
      console.warn(`⚠️ Could not remove webhooks before deleting store ${store.shopDomain}:`, error.message || error);
      // Continue with deletion even if webhook removal fails
    }

    // Delete store (cascade will handle orders and fulfillments)
    await prisma.store.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Store deleted successfully' });
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message === 'Access denied') {
      return createUnauthorizedResponse();
    }
    if (error.message === 'Admin access required') {
      return createErrorResponse('Admin access required', 403);
    }
    console.error('Error deleting store:', error);
    return createErrorResponse(error.message || 'Failed to delete store', 500);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAdmin,
  createErrorResponse,
  createUnauthorizedResponse,
  createNotFoundResponse,
} from '@/lib/auth-helpers';
import { transformStore } from '@/lib/api-helpers';
import { StoreStatus } from '@prisma/client';

/**
 * Manually register webhooks for a store
 * POST /api/stores/[id]/webhooks/register
 * 
 * This endpoint manually triggers webhook registration for a store.
 * Only works for active stores with valid credentials.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const logContext = { storeId: '', shopDomain: '' };

  try {
    await requireAdmin();

    const { id } = await params;
    logContext.storeId = id;

    // Find store
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
      console.warn('❌ Webhook registration failed: Store not found', { storeId: id });
      return createNotFoundResponse();
    }
    logContext.shopDomain = store.shopDomain;

    console.log('🔗 Starting manual webhook registration', {
      storeId: id,
      shopDomain: store.shopDomain,
      status: store.status,
    });

    // Check if store is active
    if (store.status !== StoreStatus.Active) {
      console.warn('❌ Webhook registration failed: Store is not active', {
        storeId: id,
        shopDomain: store.shopDomain,
        status: store.status,
      });
      return createErrorResponse('Store must be active to register webhooks', 400);
    }

    // Check if store has credentials
    if (!store.secret || store.secret.trim() === '') {
      console.warn('❌ Webhook registration failed: Store has no secret', {
        storeId: id,
        shopDomain: store.shopDomain,
      });
      return createErrorResponse('Store credentials are required to register webhooks', 400);
    }

    // Ensure access token is available
    let tokenAvailable = false;
    try {
      const { shopifyService } = await import('@/lib/services/shopify');
      await shopifyService.getAccessToken(store.shopDomain);
      tokenAvailable = true;
      console.log('✅ Access token obtained', {
        storeId: id,
        shopDomain: store.shopDomain,
      });
    } catch (error: any) {
      console.warn('⚠️ Could not get access token', {
        storeId: id,
        shopDomain: store.shopDomain,
        error: error.message || error,
      });
      // Update webhooksRegistered to false
      await prisma.store.update({
        where: { id },
        data: { webhooksRegistered: false },
      });
      return createErrorResponse(
        `Failed to get access token: ${error.message || 'Unknown error'}`,
        400
      );
    }

    // Register webhooks
    let webhooksSetup = false;
    let webhookResults: Array<any> = [];
    try {
      const { shopifyService } = await import('@/lib/services/shopify');
      webhookResults = await shopifyService.ensureWebhooksForStore(store.shopDomain);
      const successCount = webhookResults.filter((r) => r !== null).length;
      webhooksSetup = successCount > 0;

      // Update webhooksRegistered status based on setup result
      await prisma.store.update({
        where: { id },
        data: { webhooksRegistered: webhooksSetup },
      });

      console.log('✅ Webhook registration completed', {
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
    } catch (error: any) {
      console.error('❌ Webhook registration failed', {
        storeId: id,
        shopDomain: store.shopDomain,
        error: error.message || error,
      });
      // Update webhooksRegistered to false on failure
      await prisma.store.update({
        where: { id },
        data: { webhooksRegistered: false },
      });
      return createErrorResponse(
        `Failed to register webhooks: ${error.message || 'Unknown error'}`,
        500
      );
    }

    // Fetch updated store
    const updatedStore = await prisma.store.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            name: true,
          },
        },
      },
    });

    // Get tracking count for the store
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
    console.log('🎉 Webhook registration process completed', {
      storeId: id,
      shopDomain: store.shopDomain,
      duration: `${duration}ms`,
      webhooksRegistered: webhooksSetup,
      successCount: webhookResults.filter((r) => r !== null).length,
    });

    return NextResponse.json({
      success: true,
      webhooksRegistered: webhooksSetup,
      webhookCount: webhookResults.filter((r) => r !== null).length,
      store: transformStore(updatedStore || store, trackingCount),
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;

    if (error.message === 'Unauthorized' || error.message === 'Access denied') {
      console.warn('❌ Webhook registration failed: Unauthorized', {
        storeId: logContext.storeId,
        shopDomain: logContext.shopDomain,
        duration: `${duration}ms`,
      });
      return createUnauthorizedResponse();
    }
    if (error.message === 'Admin access required') {
      console.warn('❌ Webhook registration failed: Admin access required', {
        storeId: logContext.storeId,
        shopDomain: logContext.shopDomain,
        duration: `${duration}ms`,
      });
      return createErrorResponse('Admin access required', 403);
    }

    console.error('❌ Webhook registration failed with error', {
      storeId: logContext.storeId,
      shopDomain: logContext.shopDomain,
      error: error.message || error,
      stack: error.stack,
      duration: `${duration}ms`,
    });

    return createErrorResponse(error.message || 'Failed to register webhooks', 500);
  }
}


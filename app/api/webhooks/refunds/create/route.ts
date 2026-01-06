import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createErrorResponse } from '@/lib/auth-helpers';
import { shopifyService } from '@/lib/services/shopify';
import { track17Service } from '@/lib/services/track17';
import { StoreStatus, TrackingProcessStatus } from '@prisma/client';

/**
 * Webhook endpoint for refund creation events
 * POST /api/webhooks/refunds/create
 * 
 * This endpoint receives webhook notifications when a new refund is created.
 * Validates webhook signature before processing.
 * 
 * When a refund is created, this handler stops all related trackings for the order.
 * 
 * Requirements:
 * - Must respond with 200 OK within 5 seconds
 * - Validates HMAC SHA256 signature from X-Shopify-Hmac-SHA256 header
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body for HMAC signature verification (must be unparsed)
    const rawBody = await request.text();
    
    // Extract HMAC signature from header
    const signature = request.headers.get('x-shopify-hmac-sha256');
    if (!signature) {
      console.warn('⚠️ Webhook missing signature header');
      return createErrorResponse('Missing signature header', 401);
    }

    // Parse body to extract shop domain
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return createErrorResponse('Invalid JSON payload', 400);
    }

    // Extract shop domain from payload or header
    // Shopify webhooks typically include 'shop' or 'shop_domain' in the payload
    // Also check X-Shopify-Shop-Domain header as fallback
    const shopDomain = 
      (typeof body === 'object' && body !== null && 'shop_domain' in body && typeof body.shop_domain === 'string' ? body.shop_domain : null) ||
      (typeof body === 'object' && body !== null && 'shop' in body && typeof body.shop === 'string' ? body.shop : null) ||
      request.headers.get('x-shopify-shop-domain') ||
      null;

    if (!shopDomain) {
      console.warn('⚠️ Webhook missing shop domain');
      return createErrorResponse('Missing shop domain', 400);
    }

    // Verify webhook signature
    const isValid = await shopifyService.verifyWebhookSignature(
      signature,
      rawBody,
      shopDomain
    );

    if (!isValid) {
      console.warn('⚠️ Invalid webhook signature', { shopDomain });
      return createErrorResponse('Invalid webhook signature', 401);
    }
    
    // Validate webhook payload structure
    if (
      typeof body !== 'object' ||
      body === null ||
      !('id' in body) ||
      !('order_id' in body)
    ) {
      return createErrorResponse('Invalid webhook payload: missing required fields (id, order_id)', 400);
    }

    // Extract refund data from webhook payload
    // Shopify refund ID is numeric: 890088186047892319
    // Shopify order ID is numeric: 820982911946154508
    const refundIdRaw = body.id;
    const orderIdRaw = body.order_id;

    if (refundIdRaw === null || refundIdRaw === undefined || orderIdRaw === null || orderIdRaw === undefined) {
      return createErrorResponse('Invalid webhook payload: refund id or order id is missing or invalid', 400);
    }

    // Convert numeric IDs to strings
    // Shopify webhooks send IDs as numbers
    let orderId: string;
    if (typeof orderIdRaw === 'number') {
      orderId = String(orderIdRaw);
    } else if (typeof orderIdRaw === 'string') {
      orderId = orderIdRaw;
    } else {
      return createErrorResponse('Invalid webhook payload: order id must be a number or string', 400);
    }

    // Find store based on shop domain
    const store = await prisma.store.findUnique({
      where: { shopDomain },
    });

    if (!store) {
      console.warn('⚠️ Store not found for shop domain', { shopDomain });
      return createErrorResponse('Store not found', 404);
    }

    // Find order
    const order = await prisma.order.findUnique({
      where: {
        shopId_orderId: {
          shopId: store.id,
          orderId: orderId,
        },
      },
      include: {
        fulfillments: {
          include: {
            tracking: true,
            shop: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      console.warn('⚠️ Order not found', { orderId, shopDomain });
      // Return 200 OK even if order not found (idempotent behavior)
      // The order might not exist in our database yet
      return NextResponse.json(
        { 
          success: true,
          message: 'Refund webhook processed (order not found in database)',
          refundId: String(refundIdRaw),
          orderId: orderId,
        },
        { status: 200 }
      );
    }

    console.log('💰 Processing refund webhook:', {
      refundId: String(refundIdRaw),
      orderId: orderId,
      orderName: order.name,
      shopDomain,
      fulfillmentCount: order.fulfillments.length,
    });

    // Find all fulfillments with running trackings for this order
    const fulfillmentsWithRunningTrackings = order.fulfillments.filter(
      (fulfillment) =>
        fulfillment.tracking &&
        fulfillment.tracking.processStatus === TrackingProcessStatus.Running
    );

    if (fulfillmentsWithRunningTrackings.length === 0) {
      console.log('ℹ️ No running trackings found for this order', {
        orderId: orderId,
        orderName: order.name,
      });
      return NextResponse.json(
        { 
          success: true,
          message: 'Refund webhook processed (no running trackings to stop)',
          refundId: String(refundIdRaw),
          orderId: orderId,
        },
        { status: 200 }
      );
    }

    // Stop all running trackings for this order
    const isStoreActive = store.status === StoreStatus.Active;
    const stopResults = await Promise.allSettled(
      fulfillmentsWithRunningTrackings.map(async (fulfillment) => {
        if (!fulfillment.tracking || !fulfillment.tracking.trackingNumber) {
          return { fulfillmentId: fulfillment.fulfillmentId, success: false, reason: 'No tracking number' };
        }

        const trackingNumber = fulfillment.tracking.trackingNumber;
        const trackingId = fulfillment.tracking.id;

        try {
          // Stop tracking at 17Track if store is active
          if (isStoreActive) {
            try {
              const stopResponse = await track17Service.stopTracking({
                number: trackingNumber,
                // carrier is optional - 17Track will process for all matching carriers if not provided
              });

              // Check if stop was successful
              const isStopped = stopResponse.data?.accepted?.some(
                (item) => item.number === trackingNumber
              ) ?? false;

              if (!isStopped) {
                const rejectedItem = stopResponse.data?.rejected?.find(
                  (item) => item.number === trackingNumber
                );
                const errorMessage = rejectedItem?.error?.message || 'Unknown error';
                console.warn(
                  `⚠️ 17Track failed to stop tracking ${trackingNumber}: ${errorMessage}`
                );
                // Continue anyway - we'll still update the database
              } else {
                console.log('✅ Tracking stopped at 17Track:', {
                  trackingNumber: trackingNumber,
                  fulfillmentId: fulfillment.fulfillmentId,
                });
              }
            } catch (error: unknown) {
              // Log error but continue - we'll still update the database
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              console.warn('⚠️ Error stopping tracking at 17Track:', {
                trackingNumber,
                error: errorMessage,
              });
            }
          }

          // Update tracking processStatus to Stopped in database
          await prisma.tracking.update({
            where: { id: trackingId },
            data: {
              processStatus: TrackingProcessStatus.Stopped,
              updatedAt: new Date(),
            },
          });

          console.log('✅ Tracking stopped in database:', {
            trackingNumber: trackingNumber,
            fulfillmentId: fulfillment.fulfillmentId,
          });

          return { fulfillmentId: fulfillment.fulfillmentId, success: true, trackingNumber };
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('❌ Error stopping tracking:', {
            trackingNumber,
            fulfillmentId: fulfillment.fulfillmentId,
            error: errorMessage,
          });
          return { fulfillmentId: fulfillment.fulfillmentId, success: false, reason: errorMessage };
        }
      })
    );

    const successful = stopResults.filter((r) => r.status === 'fulfilled' && r.value.success).length;
    const failed = stopResults.length - successful;

    console.log('💰 Refund webhook processed:', {
      refundId: String(refundIdRaw),
      orderId: orderId,
      orderName: order.name,
      totalTrackings: fulfillmentsWithRunningTrackings.length,
      successful,
      failed,
    });

    // Return success response (must be within 5 seconds)
    // Always return 200 OK for idempotency
    return NextResponse.json(
      { 
        success: true,
        message: 'Refund webhook processed successfully',
        refundId: String(refundIdRaw),
        orderId: orderId,
        trackingsStopped: successful,
        trackingsFailed: failed,
        totalTrackings: fulfillmentsWithRunningTrackings.length,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('❌ Error processing refund create webhook:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(
      `Failed to process refund create webhook: ${errorMessage}`,
      500
    );
  }
}


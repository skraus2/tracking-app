import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createErrorResponse } from '@/lib/auth-helpers';
import { track17Service } from '@/lib/services/track17';
import { shopifyService, FulfillmentEventStatus } from '@/lib/services/shopify';
import { Track17MainStatus, ShopifyStatus, TrackingProcessStatus } from '@prisma/client';

/**
 * Webhook endpoint for 17Track tracking events
 * POST /api/webhooks/trackings
 * 
 * This endpoint receives webhook notifications from 17Track for tracking events.
 * Events: TRACKING_UPDATED, TRACKING_STOPPED
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text();
    const body = JSON.parse(rawBody);

    // Verify webhook signature
    const signature = request.headers.get('sign');
    if (!signature) {
      console.warn('⚠️ Webhook missing signature header');
      return createErrorResponse('Missing signature header', 401);
    }

    const isValid = await track17Service.verifyWebhookSignature(signature, rawBody);
    if (!isValid) {
      console.warn('⚠️ Invalid webhook signature');
      return createErrorResponse('Invalid signature', 401);
    }

    // Validate webhook payload structure
    if (!body.event || !body.data) {
      return createErrorResponse('Invalid webhook payload: missing required fields', 400);
    }

    const { event, data } = body;

    // Handle different event types
    if (event === 'TRACKING_STOPPED') {
      return await handleTrackingStopped(data);
    } else if (event === 'TRACKING_UPDATED') {
      return await handleTrackingUpdated(data);
    } else {
      console.warn(`⚠️ Unknown webhook event type: ${event}`);
      return createErrorResponse(`Unknown event type: ${event}`, 400);
    }
  } catch (error: unknown) {
    console.error('❌ Error processing tracking update webhook:', error);
    
    // Handle specific error types
    if (error instanceof Error && error.message.includes('JSON')) {
      return createErrorResponse('Invalid JSON payload', 400);
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(
      `Failed to process tracking update webhook: ${errorMessage}`,
      500
    );
  }
}

/**
 * Convert ShopifyStatus to FulfillmentEventStatus
 * 
 * Since ShopifyStatus now matches FulfillmentEventStatus exactly,
 * this is a simple type cast.
 */
function mapShopifyStatusToFulfillmentEventStatus(
  shopifyStatus: ShopifyStatus
): FulfillmentEventStatus {
  return shopifyStatus as FulfillmentEventStatus;
}

/**
 * Convert fulfillment ID to Shopify GID format
 * 
 * @param fulfillmentId - Numeric fulfillment ID (e.g., "123456")
 * @returns Shopify GID (e.g., "gid://shopify/Fulfillment/123456")
 */
function toShopifyFulfillmentGid(fulfillmentId: string): string {
  return `gid://shopify/Fulfillment/${fulfillmentId}`;
}

/**
 * Handle TRACKING_STOPPED event
 */
async function handleTrackingStopped(data: {
  number: string;
  carrier: number;
  param?: string | null;
  tag?: string | null;
}) {
  const { number: trackingNumber } = data;

  // Find tracking entry
  const tracking = await prisma.tracking.findUnique({
    where: { trackingNumber },
    include: {
      fulfillments: true,
    },
  });

  if (!tracking) {
    console.warn(`⚠️ Tracking not found for stopped number: ${trackingNumber}`);
    // Return 200 to acknowledge receipt even if tracking not found
    return NextResponse.json({ success: true, message: 'Tracking stopped acknowledged' }, { status: 200 });
  }

  // Update tracking processStatus to indicate it's stopped
  await prisma.tracking.update({
    where: { id: tracking.id },
    data: {
      processStatus: TrackingProcessStatus.Stopped,
      updatedAt: new Date(),
    },
  });

  console.log(`📦 Tracking stopped: ${trackingNumber}`);

  return NextResponse.json(
    { 
      success: true,
      message: 'Tracking stopped processed successfully',
      trackingNumber,
    },
    { status: 200 }
  );
}

/**
 * Handle TRACKING_UPDATED event
 */
async function handleTrackingUpdated(data: {
  number: string;
  carrier: number;
  tag?: string | null;
  track_info?: {
    latest_status?: {
      status: string;
      sub_status: string;
      sub_status_descr?: string | null;
    };
    latest_event?: {
      time_iso?: string | null;
      time_utc?: string | null;
      description?: string;
      location?: string;
      stage?: string;
      sub_status?: string;
    };
    time_metrics?: {
      estimated_delivery_date?: {
        from?: string | null;
        to?: string | null;
      } | null;
    };
  };
}) {
  const { number: trackingNumber, track_info } = data;

  if (!track_info || !track_info.latest_status) {
    console.warn(`⚠️ Missing track_info for tracking: ${trackingNumber}`);
    return createErrorResponse('Missing track_info in webhook payload', 400);
  }

  const { latest_status, latest_event } = track_info;
  const status = latest_status.status;
  const subStatus = latest_status.sub_status;

  // Map 17Track status strings to enums
  let track17Status: Track17MainStatus;
  try {
    track17Status = track17Service.mapStatus(status);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Failed to map status for tracking ${trackingNumber}: ${errorMessage}`);
    return createErrorResponse(`Invalid status in webhook payload: ${errorMessage}`, 400);
  }

  // Map sub-status (mainStatus is now required)
  const track17SubStatus = track17Service.mapSubStatus(subStatus, track17Status);

  // Determine last event timestamp
  let lastEventAt: Date | null = null;
  if (latest_event?.time_utc) {
    lastEventAt = new Date(latest_event.time_utc);
  } else if (latest_event?.time_iso) {
    lastEventAt = new Date(latest_event.time_iso);
  } else {
    lastEventAt = new Date();
  }

  // Find tracking entry
  const tracking = await prisma.tracking.findUnique({
    where: { trackingNumber },
    include: {
      fulfillments: {
        include: {
          shop: true,
          order: true,
        },
      },
    },
  });

  if (!tracking) {
    console.warn(`⚠️ Tracking not found for update: ${trackingNumber}`);
    return createErrorResponse(`Tracking not found: ${trackingNumber}`, 404);
  }

  // Check if 17Track status actually changed
  const track17StatusChanged =
    tracking.lastStatus !== track17Status ||
    tracking.lastSubStatus !== track17SubStatus;

  // Update existing tracking
  await prisma.tracking.update({
    where: { id: tracking.id },
    data: {
      lastStatus: track17Status,
      lastSubStatus: track17SubStatus,
      lastEventAt,
    },
  });
  console.log(`📦 Updated tracking: ${trackingNumber} - ${status}`, {
    statusChanged: track17StatusChanged,
    oldStatus: tracking.lastStatus,
    oldSubStatus: tracking.lastSubStatus,
    newStatus: track17Status,
    newSubStatus: track17SubStatus,
  });

  // Update related fulfillments
  if (tracking.fulfillments.length > 0) {
    // Find status mapping - first try exact match (status + sub status)
    let statusMapping = await prisma.statusMapping.findFirst({
      where: {
        track17Status,
        track17SubStatus: track17SubStatus || null,
      },
    });

    // Fallback: try to find mapping with just main status (no sub status)
    if (!statusMapping) {
      statusMapping = await prisma.statusMapping.findFirst({
        where: {
          track17Status,
          track17SubStatus: null,
        },
      });
    }

    // If no mapping found, return error
    if (!statusMapping) {
      console.error(
        `❌ No status mapping found for tracking ${trackingNumber}: ${track17Status}${track17SubStatus ? ` / ${track17SubStatus}` : ''}`
      );
      return createErrorResponse(
        `No status mapping found for ${track17Status}${track17SubStatus ? ` / ${track17SubStatus}` : ''}`,
        500
      );
    }

    const shopifyStatus = statusMapping.shopifyStatus;

    // Update all related fulfillments
    const updatePromises = tracking.fulfillments.map(async (fulfillment) => {
      // Check if Shopify status has changed
      if (fulfillment.statusCurrent === shopifyStatus) {
        console.log(
          `ℹ️ Fulfillment ${fulfillment.fulfillmentId} Shopify status unchanged (${shopifyStatus}), skipping update`
        );
        return;
      }

      // Map ShopifyStatus to FulfillmentEventStatus for Shopify API
      const fulfillmentEventStatus = mapShopifyStatusToFulfillmentEventStatus(shopifyStatus);

      // Convert fulfillment ID to Shopify GID format
      const fulfillmentGid = toShopifyFulfillmentGid(fulfillment.fulfillmentId);

      // Create fulfillment event in Shopify
      try {
        await shopifyService.createFulfillmentEvent(
          fulfillment.shop.shopDomain,
          fulfillmentGid,
          fulfillmentEventStatus,
          (lastEventAt || new Date()).toISOString(),
          {
            // Optionally include location from latest_event if available
            ...(latest_event?.location && { message: latest_event.location }),
          }
        );

        console.log(
          `✅ Created fulfillment event in Shopify for fulfillment ${fulfillment.fulfillmentId}: ${fulfillmentEventStatus}`
        );

        // Only update database if Shopify API call was successful
        // Only update statusCurrentUpdatedAt if 17Track status actually changed
        const updateData: {
          statusCurrent: ShopifyStatus;
          statusCurrentUpdatedAt?: Date;
          deliveredAt?: Date;
        } = {
          statusCurrent: shopifyStatus,
        };

        // Only update statusCurrentUpdatedAt if the 17Track status changed
        if (track17StatusChanged) {
          updateData.statusCurrentUpdatedAt = lastEventAt || new Date();
          console.log(
            `📅 [STATUS CHANGE] 17Track status changed for fulfillment ${fulfillment.fulfillmentId}, updating statusCurrentUpdatedAt`
          );
        } else {
          console.log(
            `ℹ️ [STATUS UNCHANGED] 17Track status unchanged for fulfillment ${fulfillment.fulfillmentId}, keeping existing statusCurrentUpdatedAt`
          );
        }

        // Set deliveredAt if status is Delivered
        if (track17Status === Track17MainStatus.Delivered) {
          updateData.deliveredAt = lastEventAt || new Date();
        }

        await prisma.fulfillment.update({
          where: { id: fulfillment.id },
          data: updateData,
        });

        console.log(`📦 Updated fulfillment ${fulfillment.fulfillmentId} to ${shopifyStatus} (database + Shopify)`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(
          `❌ Failed to create fulfillment event in Shopify for fulfillment ${fulfillment.fulfillmentId}: ${errorMessage}`
        );
        // Don't update database if Shopify API call failed
        // This ensures we retry on next webhook
        throw error;
      }
    });

    await Promise.all(updatePromises);
  }

  return NextResponse.json(
    { 
      success: true,
      message: 'Tracking update processed successfully',
      trackingNumber,
      status,
      subStatus,
    },
    { status: 200 }
  );
}

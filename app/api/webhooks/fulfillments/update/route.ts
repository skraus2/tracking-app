import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createErrorResponse } from '@/lib/auth-helpers';
import { shopifyService, FulfillmentEventStatus } from '@/lib/services/shopify';
import { track17Service } from '@/lib/services/track17';
import { ShopifyStatus, StoreStatus, TrackingProcessStatus } from '@prisma/client';

/**
 * Helper function to sync tracking status from 17Track to Shopify
 * This is called asynchronously after tracking registration to not block webhook response
 */
async function syncTrackingStatusFrom17Track(
  fulfillmentDbId: string,
  fulfillmentId: string,
  trackingNumber: string,
  shopDomain: string,
  clientId: string,
  secret: string
): Promise<void> {
  try {
    console.log('🔄 [SYNC] Starting status sync from 17Track:', {
      fulfillmentId,
      trackingNumber,
    });

    // Get tracking info from 17Track
    const trackingInfo = await track17Service.getTrackingInfo({
      number: trackingNumber,
    });

    // Check if tracking was accepted
    if (!trackingInfo.data.accepted || trackingInfo.data.accepted.length === 0) {
      console.warn('⚠️ [SYNC] Tracking not found in 17Track, skipping sync');
      return;
    }

    const accepted = trackingInfo.data.accepted[0];
    const mappedInfo = track17Service.mapResponseToTracking(accepted);

    if (!mappedInfo) {
      console.warn('⚠️ [SYNC] Failed to map tracking information, skipping sync');
      return;
    }

    // Find status mapping
    let statusMapping = await prisma.statusMapping.findFirst({
      where: {
        track17Status: mappedInfo.status,
        track17SubStatus: mappedInfo.subStatus || null,
      },
    });

    // Fallback: try to find mapping with just main status (no sub status)
    if (!statusMapping) {
      statusMapping = await prisma.statusMapping.findFirst({
        where: {
          track17Status: mappedInfo.status,
          track17SubStatus: null,
        },
      });
    }

    if (!statusMapping) {
      console.warn('⚠️ [SYNC] No status mapping found, skipping sync:', {
        track17Status: mappedInfo.status,
        track17SubStatus: mappedInfo.subStatus,
      });
      return;
    }

    const shopifyStatus = statusMapping.shopifyStatus;

    // Get fulfillment to check current status and get trackingId
    const fulfillment = await prisma.fulfillment.findUnique({
      where: { id: fulfillmentDbId },
      include: {
        tracking: true,
      },
    });

    if (!fulfillment) {
      console.warn('⚠️ [SYNC] Fulfillment not found, skipping sync');
      return;
    }

    // Get last event timestamp
    const lastEventAt = mappedInfo.events?.[0]?.timestamp
      ? new Date(mappedInfo.events[0].timestamp)
      : new Date();

    // Update tracking record with 17Track data (lastEventAt, lastStatus, lastSubStatus)
    // This ensures the tracking object has the latest data from 17Track
    if (fulfillment.trackingId && fulfillment.tracking) {
      await prisma.tracking.update({
        where: { id: fulfillment.trackingId },
        data: {
          lastEventAt,
          lastStatus: mappedInfo.status,
          lastSubStatus: mappedInfo.subStatus || null,
        },
      });

      console.log('✅ [SYNC] Tracking record updated with 17Track data:', {
        trackingId: fulfillment.trackingId,
        trackingNumber,
        lastStatus: mappedInfo.status,
        lastSubStatus: mappedInfo.subStatus || null,
        lastEventAt: lastEventAt.toISOString(),
      });
    }

    // Only sync if status has changed
    if (fulfillment.statusCurrent === shopifyStatus) {
      console.log('ℹ️ [SYNC] Shopify status unchanged, skipping sync:', {
        status: shopifyStatus,
      });
      return;
    }

    // Map ShopifyStatus to FulfillmentEventStatus
    const fulfillmentEventStatus = shopifyStatus as FulfillmentEventStatus;
    const fulfillmentGid = `gid://shopify/Fulfillment/${fulfillmentId}`;

    // Create fulfillment event in Shopify
    await shopifyService.createFulfillmentEvent(
      shopDomain,
      fulfillmentGid,
      fulfillmentEventStatus,
      lastEventAt.toISOString(),
      {
        // Optionally include location from latest event if available
        ...(mappedInfo.events?.[0]?.location && { message: mappedInfo.events[0].location }),
      }
    );

    console.log('✅ [SYNC] Created fulfillment event in Shopify:', {
      fulfillmentId,
      status: fulfillmentEventStatus,
    });

    // Update database
    const updateData: {
      statusCurrent: ShopifyStatus;
      statusCurrentUpdatedAt: Date;
      deliveredAt?: Date | null;
    } = {
      statusCurrent: shopifyStatus,
      statusCurrentUpdatedAt: lastEventAt,
    };

    // Set deliveredAt if status is DELIVERED
    if (shopifyStatus === ShopifyStatus.DELIVERED) {
      updateData.deliveredAt = lastEventAt;
    }

    await prisma.fulfillment.update({
      where: { id: fulfillmentDbId },
      data: updateData,
    });

    console.log('✅ [SYNC] Status synced successfully:', {
      fulfillmentId,
      track17Status: mappedInfo.status,
      shopifyStatus,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [SYNC] Error syncing tracking status:', errorMessage);
    throw error; // Re-throw to be caught by caller
  }
}

/**
 * Webhook endpoint for fulfillment update events
 * POST /api/webhooks/fulfillments/update
 * 
 * This endpoint receives webhook notifications when a fulfillment status is updated.
 * Validates webhook signature before processing.
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
      !('id' in body)
    ) {
      return createErrorResponse('Invalid webhook payload: missing required fields (id)', 400);
    }

    // Extract fulfillment data from webhook payload
    // Sample payload shows: { "id": 123456, ... }
    // ID is a number, we convert it to string for database storage
    const fulfillmentIdRaw = body.id;
    
    // Use shipment_status (physical shipping status) - optional, can be null
    // shipment_status describes the actual shipping status: in_transit, delivered, etc.
    // If null, statusCurrent will remain empty/default
    const shipmentStatusString = 
      (typeof body === 'object' && body !== null && 'shipment_status' in body)
        ? (typeof body.shipment_status === 'string' ? body.shipment_status : (body.shipment_status ? String(body.shipment_status) : null))
        : null;
    
    const updatedAtString = 
      (typeof body === 'object' && body !== null && 'updated_at' in body && typeof body.updated_at === 'string')
        ? body.updated_at 
        : null;
    const trackingNumber = 
      (typeof body === 'object' && body !== null && 'tracking_number' in body)
        ? (typeof body.tracking_number === 'string' ? body.tracking_number : (body.tracking_number ? String(body.tracking_number) : null))
        : null;

    if (!fulfillmentIdRaw) {
      return createErrorResponse('Invalid webhook payload: fulfillment id is missing or invalid', 400);
    }

    // Convert ID from number to string (as shown in sample payload)
    const fulfillmentId = String(fulfillmentIdRaw);

    // Map Shopify shipment_status values to ShopifyStatus enum
    // shipment_status values: label_printed, label_purchased, attempted_delivery, ready_for_pickup, 
    //                         confirmed, in_transit, out_for_delivery, delivered, failure
    // If shipment_status is null, statusCurrent will be CONFIRMED (default)
    const statusMap: Record<string, string> = {
      // shipment_status values (physical shipping status)
      'label_printed': 'LABEL_PRINTED',
      'label_purchased': 'LABEL_PURCHASED',
      'attempted_delivery': 'ATTEMPTED_DELIVERY',
      'ready_for_pickup': 'READY_FOR_PICKUP',
      'confirmed': 'CONFIRMED',
      'in_transit': 'IN_TRANSIT',
      'out_for_delivery': 'OUT_FOR_DELIVERY',
      'delivered': 'DELIVERED',
      'failure': 'FAILURE',
      // Uppercase variants
      'LABEL_PRINTED': 'LABEL_PRINTED',
      'LABEL_PURCHASED': 'LABEL_PURCHASED',
      'ATTEMPTED_DELIVERY': 'ATTEMPTED_DELIVERY',
      'READY_FOR_PICKUP': 'READY_FOR_PICKUP',
      'CONFIRMED': 'CONFIRMED',
      'IN_TRANSIT': 'IN_TRANSIT',
      'OUT_FOR_DELIVERY': 'OUT_FOR_DELIVERY',
      'DELIVERED': 'DELIVERED',
      'FAILURE': 'FAILURE',
    };

    // Only set statusCurrent if shipment_status is provided (not null)
    // If shipment_status is null, statusCurrent will be null (no default)
    const statusCurrent = shipmentStatusString 
      ? (statusMap[shipmentStatusString.toLowerCase()] || statusMap[shipmentStatusString.toUpperCase()] || 'CONFIRMED') as ShopifyStatus
      : null;

    // Find store based on shop domain
    const store = await prisma.store.findUnique({
      where: { shopDomain },
    });

    if (!store) {
      console.warn('⚠️ Store not found for shop domain', { shopDomain });
      return createErrorResponse('Store not found', 404);
    }

    // Find existing fulfillment
    const fulfillment = await prisma.fulfillment.findUnique({
      where: {
        shopId_fulfillmentId: {
          shopId: store.id,
          fulfillmentId: fulfillmentId,
        },
      },
      include: {
        order: {
          select: {
            name: true,
            orderId: true,
          },
        },
      },
    });

    if (!fulfillment) {
      console.warn('⚠️ Fulfillment not found', { fulfillmentId, shopDomain });
      return createErrorResponse('Fulfillment not found', 404);
    }

    // Parse updated_at if provided, otherwise use current time
    const statusCurrentUpdatedAt = updatedAtString 
      ? new Date(updatedAtString) 
      : new Date();

    // Update fulfillment - only update statusCurrent if shipment_status is provided
    // If shipment_status is null, statusCurrent remains unchanged (empty/unchanged)
    const updateData: {
      statusCurrent?: ShopifyStatus;
      statusCurrentUpdatedAt?: Date;
      deliveredAt?: Date | null;
      trackingNumber?: string;
    } = {};

    // Only update status if shipment_status is provided (not null)
    if (shipmentStatusString) {
      updateData.statusCurrent = statusCurrent ?? undefined;
      updateData.statusCurrentUpdatedAt = statusCurrentUpdatedAt;

      // Set deliveredAt if status is DELIVERED
      if (statusCurrent === 'DELIVERED') {
        updateData.deliveredAt = statusCurrentUpdatedAt;
      } else if (fulfillment.deliveredAt) {
        // Keep existing deliveredAt if status is not DELIVERED
        updateData.deliveredAt = fulfillment.deliveredAt;
      }
    }

    // Track if tracking number is changing
    const isTrackingNumberChanging = 
      trackingNumber && 
      trackingNumber.trim() !== '' && 
      fulfillment.trackingNumber && 
      fulfillment.trackingNumber.trim() !== '' &&
      trackingNumber !== fulfillment.trackingNumber;

    // Store old tracking info for logging and cleanup
    const oldTrackingNumber = fulfillment.trackingNumber;
    const oldTrackingId = fulfillment.trackingId;

    // Update tracking number if provided and different
    if (trackingNumber && trackingNumber.trim() !== '' && trackingNumber !== fulfillment.trackingNumber) {
      updateData.trackingNumber = trackingNumber;
      
      // Log tracking number change
      if (isTrackingNumberChanging) {
        console.log('🔄 Tracking number is changing:', {
          fulfillmentId: fulfillmentId,
          oldTrackingNumber: oldTrackingNumber,
          newTrackingNumber: trackingNumber,
          oldTrackingId: oldTrackingId,
        });
      }
    }

    // Stop old tracking if tracking number is changing
    if (isTrackingNumberChanging && oldTrackingId) {
      try {
        const oldTracking = await prisma.tracking.findUnique({
          where: { id: oldTrackingId },
        });

        if (oldTracking && oldTracking.processStatus === 'Running') {
          // Stop the old tracking at 17Track first (if store is active)
          const isStoreActive = store.status === StoreStatus.Active;
          if (isStoreActive && oldTrackingNumber) {
            try {
              const stopResponse = await track17Service.stopTracking({
                number: oldTrackingNumber,
                // carrier is optional - 17Track will process for all matching carriers if not provided
              });

              // Check if stop was successful
              const isStopped = stopResponse.data?.accepted?.some(
                (item) => item.number === oldTrackingNumber
              );

              if (!isStopped) {
                const rejectedItem = stopResponse.data?.rejected?.find(
                  (item) => item.number === oldTrackingNumber
                );
                const errorMessage = rejectedItem?.error?.message || 'Unknown error';
                console.warn(
                  `⚠️ 17Track failed to stop tracking ${oldTrackingNumber}: ${errorMessage}`
                );
                // Continue anyway - we'll still update the database
              } else {
                console.log('✅ Old tracking stopped at 17Track:', {
                  trackingNumber: oldTrackingNumber,
                });
              }
            } catch (error: unknown) {
              // Log error but continue - we'll still update the database
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              console.warn('⚠️ Error stopping tracking at 17Track:', errorMessage);
            }
          }

          // Stop the old tracking in database
          await prisma.tracking.update({
            where: { id: oldTrackingId },
            data: {
              processStatus: TrackingProcessStatus.Stopped,
            },
          });

          console.log('🛑 Old tracking stopped in database:', {
            oldTrackingNumber: oldTrackingNumber,
            oldTrackingId: oldTrackingId,
            reason: 'Tracking number changed to new number',
            stoppedAt17Track: isStoreActive && oldTrackingNumber ? true : false,
          });
        }
      } catch (error: unknown) {
        // Log error but don't fail the webhook
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn('⚠️ Error stopping old tracking:', errorMessage);
      }
    }

    // Only update if there's something to update
    if (Object.keys(updateData).length > 0) {
      await prisma.fulfillment.update({
        where: { id: fulfillment.id },
        data: updateData,
      });
    }

    // Register tracking with 17Track and create database entry if successful
    const trackingNumberToUse = trackingNumber && trackingNumber.trim() !== '' 
      ? trackingNumber 
      : fulfillment.trackingNumber;

    if (trackingNumberToUse && trackingNumberToUse.trim() !== '') {
      try {
        // Check if tracking already exists in database
        const existingTracking = await prisma.tracking.findUnique({
          where: { trackingNumber: trackingNumberToUse },
        });

        // Determine processStatus based on store status
        // If store is inactive, create tracking with Stopped status (can be manually activated later)
        // If store is active, register with 17Track and create with Running status
        const isStoreActive = store.status === StoreStatus.Active;
        let shouldCreateTracking = true;
        let processStatus: TrackingProcessStatus = isStoreActive ? 'Running' : 'Stopped';
        let isAccepted = false; // Track if registration was successful

        if (!existingTracking) {
          if (isStoreActive) {
            // Store is active: Register with 17Track
            const registerResponse = await track17Service.registerTracking({
              number: trackingNumberToUse,
            });

            // Check if registration was successful
            isAccepted = registerResponse.data?.accepted?.some(
              (item) => item.number === trackingNumberToUse
            ) ?? false;

            if (!isAccepted) {
              const rejectedItem = registerResponse.data?.rejected?.find(
                (item) => item.number === trackingNumberToUse
              );
              const errorMessage = rejectedItem?.error?.message || 'Unknown error';
              console.warn(
                `⚠️ 17Track rejected tracking number ${trackingNumberToUse}: ${errorMessage}`
              );
              // Don't create database entry if 17Track rejected it
              // Continue with webhook processing but skip tracking creation
              shouldCreateTracking = false;
            } else {
              // Registration successful, continue to create database entry
              console.log('✅ Tracking registered with 17Track:', {
                trackingNumber: trackingNumberToUse,
              });
            }
          } else {
            // Store is inactive: Don't register with 17Track, but still create DB entry with Stopped status
            console.log('ℹ️ Store is inactive, skipping 17Track registration. Tracking will be created with Stopped status:', {
              trackingNumber: trackingNumberToUse,
            });
          }
        } else {
          // Tracking already exists in database, continue to link fulfillment
          console.log('ℹ️ Tracking already exists in database:', {
            trackingNumber: trackingNumberToUse,
          });
          // If tracking already exists, we assume it's already registered (or was registered before)
          isAccepted = true;
        }

        // Create database entry if 17Track registration was successful (or store is inactive, or tracking already exists)
        if (shouldCreateTracking) {
          // Create or find tracking entry in database
          const tracking = await prisma.tracking.upsert({
            where: { trackingNumber: trackingNumberToUse },
            update: {}, // Don't update if exists
            create: {
              trackingNumber: trackingNumberToUse,
              processStatus: processStatus,
            },
          });

          // Link fulfillment to tracking if not already linked
          if (!fulfillment.trackingId || fulfillment.trackingId !== tracking.id) {
            await prisma.fulfillment.update({
              where: { id: fulfillment.id },
              data: { trackingId: tracking.id },
            });

            console.log(`✅ Tracking created/updated and linked to fulfillment (${processStatus}):`, {
              trackingNumber: trackingNumberToUse,
              fulfillmentId: fulfillmentId,
              processStatus: processStatus,
            });

            // If tracking was just registered and store is active, try to sync status from 17Track
            // This is done asynchronously to not block the webhook response
            if (isStoreActive && !existingTracking && isAccepted) {
              // Run sync in background (don't await to keep webhook fast)
              syncTrackingStatusFrom17Track(
                fulfillment.id,
                fulfillment.fulfillmentId,
                trackingNumberToUse,
                store.shopDomain,
                store.clientId,
                store.secret
              ).catch((error) => {
                // Log error but don't fail webhook
                console.warn('⚠️ Background sync of tracking status failed:', error);
              });
            }

            // Log old tracking status if tracking number changed
            if (isTrackingNumberChanging && oldTrackingId) {
              try {
                // Check if old tracking still has other fulfillments
                const oldTracking = await prisma.tracking.findUnique({
                  where: { id: oldTrackingId },
                  include: {
                    fulfillments: {
                      select: { id: true },
                    },
                  },
                });

                if (oldTracking) {
                  const remainingFulfillments = oldTracking.fulfillments.filter(
                    (f) => f.id !== fulfillment.id
                  );

                  console.log('ℹ️ Old tracking status after change:', {
                    oldTrackingNumber: oldTrackingNumber,
                    oldTrackingId: oldTrackingId,
                    processStatus: oldTracking.processStatus,
                    remainingFulfillmentsCount: remainingFulfillments.length,
                    note: remainingFulfillments.length === 0 
                      ? 'Old tracking is now orphaned (no remaining fulfillments)'
                      : `Old tracking still linked to ${remainingFulfillments.length} other fulfillment(s)`,
                  });
                }
              } catch (error: unknown) {
                // Log error but don't fail the webhook
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                console.warn('⚠️ Error checking old tracking status:', errorMessage);
              }
            }
          }
        }
      } catch (error: unknown) {
        // Log error but don't fail the webhook
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('⚠️ Error registering tracking with 17Track or creating database entry:', errorMessage);
        // Continue with webhook processing even if tracking registration fails
      }
    }

    console.log('✅ Fulfillment update webhook processed:', {
      fulfillmentId: fulfillmentId,
      status: shipmentStatusString ? statusCurrent : 'unchanged (shipment_status was null)',
      shopDomain,
      timestamp: new Date().toISOString(),
    });

    // Return success response (must be within 5 seconds)
    return NextResponse.json(
      { 
        success: true,
        message: 'Fulfillment update webhook processed successfully',
        fulfillmentId: fulfillmentId,
        status: statusCurrent,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('❌ Error processing fulfillment update webhook:', error);
    
    // Handle specific error types
    if (error instanceof Error && 'code' in error && error.code === 'P2025') {
      return createErrorResponse('Fulfillment not found', 404);
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(
      `Failed to process fulfillment update webhook: ${errorMessage}`,
      500
    );
  }
}

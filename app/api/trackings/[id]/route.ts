import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  createErrorResponse,
  createUnauthorizedResponse,
  createNotFoundResponse,
} from '@/lib/auth-helpers';
import { track17Service } from '@/lib/services/track17';
import { shopifyService, FulfillmentEventStatus } from '@/lib/services/shopify';
import { ShopifyStatus, TrackingProcessStatus } from '@prisma/client';

/**
 * Helper function to sync tracking status from 17Track to Shopify
 * This is called after tracking registration/retrack to sync current status
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
 * Manually update tracking status for a specific fulfillment
 * POST /api/trackings/[id]
 * 
 * This endpoint fetches the latest tracking information from 17Track
 * and updates the fulfillment status in Shopify.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();

    const { id } = await params;

    // Find the fulfillment
    const fulfillment = await prisma.fulfillment.findUnique({
      where: { id },
      include: {
        shop: {
          select: {
            id: true,
            ownerId: true,
            shopDomain: true,
            clientId: true,
            secret: true,
          },
        },
        order: true,
        tracking: true,
      },
    });

    if (!fulfillment) {
      return createNotFoundResponse();
    }

    // Verify access: Admin can access all, Customer can only access their own stores
    if (user.role !== 'Admin' && fulfillment.shop.ownerId !== user.id) {
      return createUnauthorizedResponse();
    }

    if (!fulfillment.trackingNumber) {
      return createErrorResponse('Fulfillment has no tracking number', 400);
    }

    console.log('🔄 [MANUAL UPDATE] Starting manual tracking update:', {
      fulfillmentId: fulfillment.id,
      trackingNumber: fulfillment.trackingNumber,
      shopDomain: fulfillment.shop.shopDomain,
      currentStatus: fulfillment.statusCurrent,
    });

    // Get tracking info from 17Track
    console.log('📡 [17TRACK] Calling getTrackingInfo API...');
    const trackingInfo = await track17Service.getTrackingInfo({
      number: fulfillment.trackingNumber,
    });

    console.log('📥 [17TRACK] Raw response received:', {
      code: trackingInfo.code,
      acceptedCount: trackingInfo.data.accepted?.length || 0,
      rejectedCount: trackingInfo.data.rejected?.length || 0,
      accepted: trackingInfo.data.accepted?.map(item => ({
        number: item.number,
        carrier: item.carrier,
        track_info: item.track_info ? {
          latest_status: item.track_info.latest_status ? {
            status: item.track_info.latest_status.status,
            sub_status: item.track_info.latest_status.sub_status,
            sub_status_descr: item.track_info.latest_status.sub_status_descr,
          } : null,
          latest_event: item.track_info.latest_event ? {
            time_iso: item.track_info.latest_event.time_iso,
            description: item.track_info.latest_event.description,
            location: item.track_info.latest_event.location,
          } : null,
        } : null,
      })),
      rejected: trackingInfo.data.rejected?.map(item => ({
        number: item.number,
        error: item.error,
      })),
    });

    // Check if tracking was accepted
    if (!trackingInfo.data.accepted || trackingInfo.data.accepted.length === 0) {
      const rejected = trackingInfo.data.rejected?.[0];
      const errorMessage = rejected?.error?.message || 'Failed to get tracking info from 17Track';
      console.error('❌ [17TRACK] Tracking was rejected:', {
        trackingNumber: fulfillment.trackingNumber,
        error: rejected?.error,
      });
      return NextResponse.json({
        success: false,
        error: errorMessage,
        details: {
          track17: {
            success: false,
            error: errorMessage,
            rejected: rejected?.error,
          },
        },
      }, { status: 400 });
    }

    const accepted = trackingInfo.data.accepted[0];
    console.log('✅ [17TRACK] Tracking accepted, mapping response...');
    
    const mappedInfo = track17Service.mapResponseToTracking(accepted);

    if (!mappedInfo) {
      console.error('❌ [MAPPING] Failed to map tracking information');
      return NextResponse.json({
        success: false,
        error: 'Failed to map tracking information',
        details: {
          track17: {
            success: true,
          },
          statusMapping: {
            success: false,
            error: 'Failed to map 17Track response to internal format',
          },
        },
      }, { status: 500 });
    }

    console.log('🗺️ [MAPPING] Mapped tracking info:', {
      trackingNumber: mappedInfo.trackingNumber,
      carrier: mappedInfo.carrier,
      status: mappedInfo.status,
      subStatus: mappedInfo.subStatus || null,
      eventCount: mappedInfo.events?.length || 0,
      latestEvent: mappedInfo.events?.[0] ? {
        timestamp: mappedInfo.events[0].timestamp,
        description: mappedInfo.events[0].description,
        location: mappedInfo.events[0].location,
      } : null,
    });

    // Find status mapping
    console.log('🔍 [STATUS MAPPING] Looking for status mapping...', {
      track17Status: mappedInfo.status,
      track17SubStatus: mappedInfo.subStatus || null,
    });

    let statusMapping = await prisma.statusMapping.findFirst({
      where: {
        track17Status: mappedInfo.status,
        track17SubStatus: mappedInfo.subStatus || null,
      },
    });

    // Fallback: try to find mapping with just main status (no sub status)
    if (!statusMapping) {
      console.log('⚠️ [STATUS MAPPING] No exact match found, trying fallback (main status only)...');
      statusMapping = await prisma.statusMapping.findFirst({
        where: {
          track17Status: mappedInfo.status,
          track17SubStatus: null,
        },
      });
    }

    if (!statusMapping) {
      console.error('❌ [STATUS MAPPING] No status mapping found:', {
        track17Status: mappedInfo.status,
        track17SubStatus: mappedInfo.subStatus || null,
      });
      return NextResponse.json({
        success: false,
        error: `No status mapping found for ${mappedInfo.status}${mappedInfo.subStatus ? ` / ${mappedInfo.subStatus}` : ''}`,
        details: {
          track17: {
            success: true,
            status: mappedInfo.status,
            subStatus: mappedInfo.subStatus || null,
          },
          statusMapping: {
            success: false,
            error: `No mapping found for Track17 status: ${mappedInfo.status}${mappedInfo.subStatus ? ` / ${mappedInfo.subStatus}` : ''}`,
            track17Status: mappedInfo.status,
            track17SubStatus: mappedInfo.subStatus || null,
          },
        },
      }, { status: 500 });
    }

    console.log('✅ [STATUS MAPPING] Status mapping found:', {
      id: statusMapping.id,
      track17Status: statusMapping.track17Status,
      track17SubStatus: statusMapping.track17SubStatus,
      shopifyStatus: statusMapping.shopifyStatus,
    });

    const shopifyStatus = statusMapping.shopifyStatus;
    
    // Track update details for response
    const updateDetails = {
      track17: {
        success: true,
        status: mappedInfo.status,
        subStatus: mappedInfo.subStatus || null,
        eventCount: mappedInfo.events?.length || 0,
      },
      statusMapping: {
        success: true,
        usedFallback: false,
        track17Status: mappedInfo.status,
        track17SubStatus: mappedInfo.subStatus || null,
        shopifyStatus: shopifyStatus,
      },
      shopify: {
        success: false,
        error: null as string | null,
      },
      database: {
        success: false,
        statusChanged: false,
      },
    };

    // Check if fallback mapping was used
    if (statusMapping.track17SubStatus === null && mappedInfo.subStatus) {
      updateDetails.statusMapping.usedFallback = true;
    }

    // Update fulfillment status in Shopify first
    const shopifySyncStartTime = Date.now();
    console.log('🛒 [SHOPIFY] Starting fulfillment status update in Shopify...', {
      shopDomain: fulfillment.shop.shopDomain,
      fulfillmentId: fulfillment.fulfillmentId,
      shopifyStatus: shopifyStatus,
      fulfillmentEventStatus: shopifyStatus as FulfillmentEventStatus,
      oldStatus: fulfillment.statusCurrent,
      trackingNumber: fulfillment.trackingNumber,
      timestamp: new Date().toISOString(),
    });

    try {
      console.log('📤 [SHOPIFY] Calling updateFulfillmentStatus...', {
        shopDomain: fulfillment.shop.shopDomain,
        fulfillmentId: fulfillment.fulfillmentId,
        status: shopifyStatus,
        hasClientId: !!fulfillment.shop.clientId,
        hasSecret: !!fulfillment.shop.secret,
      });

      const shopifyResult = await shopifyService.updateFulfillmentStatus(
        fulfillment.shop.shopDomain,
        fulfillment.shop.clientId,
        fulfillment.shop.secret,
        fulfillment.fulfillmentId,
        shopifyStatus as FulfillmentEventStatus
      );

      const shopifySyncDuration = Date.now() - shopifySyncStartTime;
      updateDetails.shopify.success = true;
      
      console.log('✅ [SHOPIFY] Fulfillment status updated successfully:', {
        fulfillmentId: fulfillment.fulfillmentId,
        eventId: shopifyResult.id,
        status: shopifyResult.status,
        happenedAt: shopifyResult.happenedAt,
        createdAt: shopifyResult.createdAt,
        message: shopifyResult.message || null,
        address1: shopifyResult.address1 || null,
        city: shopifyResult.city || null,
        province: shopifyResult.province || null,
        country: shopifyResult.country || null,
        estimatedDeliveryAt: shopifyResult.estimatedDeliveryAt || null,
        duration: `${shopifySyncDuration}ms`,
        timestamp: new Date().toISOString(),
      });

      console.log('📊 [SHOPIFY] Sync completed successfully', {
        fulfillmentId: fulfillment.fulfillmentId,
        shopDomain: fulfillment.shop.shopDomain,
        oldStatus: fulfillment.statusCurrent,
        newStatus: shopifyStatus,
        duration: `${shopifySyncDuration}ms`,
        eventCreated: true,
      });
    } catch (shopifyError: unknown) {
      const shopifySyncDuration = Date.now() - shopifySyncStartTime;
      const errorMessage = shopifyError instanceof Error ? shopifyError.message : 'Unknown error';
      const errorStack = shopifyError instanceof Error ? shopifyError.stack : undefined;
      updateDetails.shopify.error = errorMessage;
      
      console.error('❌ [SHOPIFY] Error updating Shopify fulfillment status:', {
        fulfillmentId: fulfillment.fulfillmentId,
        shopDomain: fulfillment.shop.shopDomain,
        shopifyStatus: shopifyStatus,
        oldStatus: fulfillment.statusCurrent,
        trackingNumber: fulfillment.trackingNumber,
        error: errorMessage,
        errorType: shopifyError instanceof Error ? shopifyError.constructor.name : typeof shopifyError,
        stack: errorStack,
        duration: `${shopifySyncDuration}ms`,
        timestamp: new Date().toISOString(),
      });

      // Log additional error context if available
      if (shopifyError instanceof Error && 'response' in shopifyError) {
        const responseError = shopifyError as Error & { response?: { status?: number; statusText?: string } };
        console.error('❌ [SHOPIFY] Additional error context:', {
          fulfillmentId: fulfillment.fulfillmentId,
          httpStatus: responseError.response?.status,
          httpStatusText: responseError.response?.statusText,
        });
      }

      return NextResponse.json({
        success: false,
        error: 'Failed to update Shopify fulfillment status',
        details: updateDetails,
      }, { status: 500 });
    }

    // Only update database if Shopify sync was successful
    // Check if 17Track status actually changed
    const track17StatusChanged = fulfillment.tracking
      ? fulfillment.tracking.lastStatus !== mappedInfo.status ||
        fulfillment.tracking.lastSubStatus !== (mappedInfo.subStatus || null)
      : true; // If no tracking record, consider it changed

    updateDetails.database.statusChanged = track17StatusChanged;

    // Update tracking record if it exists
    if (fulfillment.tracking) {
      console.log('💾 [DATABASE] Updating tracking record...', {
        trackingId: fulfillment.tracking.id,
        lastStatus: mappedInfo.status,
        lastSubStatus: mappedInfo.subStatus || null,
        lastEventAt: mappedInfo.events[0]?.timestamp
          ? new Date(mappedInfo.events[0].timestamp).toISOString()
          : new Date().toISOString(),
        statusChanged: track17StatusChanged,
        oldStatus: fulfillment.tracking.lastStatus,
        oldSubStatus: fulfillment.tracking.lastSubStatus,
      });

      await prisma.tracking.update({
        where: { id: fulfillment.tracking.id },
        data: {
          lastStatus: mappedInfo.status,
          lastSubStatus: mappedInfo.subStatus || null,
          lastEventAt: mappedInfo.events[0]?.timestamp
            ? new Date(mappedInfo.events[0].timestamp)
            : new Date(),
        },
      });

      console.log('✅ [DATABASE] Tracking record updated');
    } else {
      console.log('ℹ️ [DATABASE] No tracking record found, skipping tracking update');
    }

    // Update fulfillment in database
    // Only update statusCurrentUpdatedAt if 17Track status actually changed
    const updateData: {
      statusCurrent: ShopifyStatus;
      statusCurrentUpdatedAt?: Date;
      deliveredAt?: Date | null;
    } = {
      statusCurrent: shopifyStatus,
    };

    // Only update statusCurrentUpdatedAt if the 17Track status changed
    if (track17StatusChanged) {
      updateData.statusCurrentUpdatedAt = new Date();
      console.log('📅 [STATUS CHANGE] 17Track status changed, updating statusCurrentUpdatedAt');
    } else {
      console.log('ℹ️ [STATUS UNCHANGED] 17Track status unchanged, keeping existing statusCurrentUpdatedAt');
    }

    // Update deliveredAt if status is Delivered
    if (shopifyStatus === ShopifyStatus.DELIVERED) {
      updateData.deliveredAt = new Date();
    } else {
      updateData.deliveredAt = fulfillment.deliveredAt;
    }

    console.log('💾 [DATABASE] Updating fulfillment record...', {
      fulfillmentId: fulfillment.id,
      oldStatus: fulfillment.statusCurrent,
      newStatus: updateData.statusCurrent,
      deliveredAt: updateData.deliveredAt?.toISOString() || null,
    });

    const updatedFulfillment = await prisma.fulfillment.update({
      where: { id },
      data: updateData,
    });

    updateDetails.database.success = true;

    console.log('✅ [DATABASE] Fulfillment record updated');
    console.log('✅ [MANUAL UPDATE] Manual update completed successfully:', {
      fulfillmentId: updatedFulfillment.id,
      trackingNumber: fulfillment.trackingNumber,
      status: shopifyStatus,
      lastUpdated: updatedFulfillment.statusCurrentUpdatedAt?.toISOString() || new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updatedFulfillment.id,
        status: shopifyStatus,
        oldStatus: fulfillment.statusCurrent,
        lastUpdated: updatedFulfillment.statusCurrentUpdatedAt,
        trackingNumber: fulfillment.trackingNumber,
      },
      details: updateDetails,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to manually update tracking';
    if (errorMessage === 'Unauthorized' || errorMessage === 'Access denied') {
      return createUnauthorizedResponse();
    }
    console.error('❌ [MANUAL UPDATE] Error manually updating tracking:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return createErrorResponse(errorMessage, 500);
  }
}

/**
 * Manually register tracking with 17Track and activate it
 * PUT /api/trackings/[id]
 * 
 * This endpoint registers a tracking number with 17Track (for stopped trackings)
 * and sets the processStatus to Running.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();

    const { id } = await params;

    // Find the fulfillment
    const fulfillment = await prisma.fulfillment.findUnique({
      where: { id },
      include: {
        shop: {
          select: {
            id: true,
            ownerId: true,
            shopDomain: true,
            clientId: true,
            secret: true,
          },
        },
        order: true,
        tracking: true,
      },
    });

    if (!fulfillment) {
      return createNotFoundResponse();
    }

    // Verify access: Admin can access all, Customer can only access their own stores
    if (user.role !== 'Admin' && fulfillment.shop.ownerId !== user.id) {
      return createUnauthorizedResponse();
    }

    if (!fulfillment.trackingNumber) {
      return createErrorResponse('Fulfillment has no tracking number', 400);
    }

    // Check if tracking exists
    if (!fulfillment.tracking) {
      return createErrorResponse('Tracking not found in database', 400);
    }

    // Use retrack if tracking was previously stopped, otherwise register
    const isStopped = fulfillment.tracking.processStatus === TrackingProcessStatus.Stopped;
    
    let response;
    if (isStopped) {
      // Tracking was stopped - use retrack to restart it
      try {
        response = await track17Service.retrack({
          number: fulfillment.trackingNumber,
          // carrier is optional - 17Track will process for all matching carriers if not provided
        });

        // Check if retrack was successful
        const isAccepted = response.data?.accepted?.some(
          (item) => item.number === fulfillment.trackingNumber
        );

        if (!isAccepted) {
          const rejectedItem = response.data?.rejected?.find(
            (item) => item.number === fulfillment.trackingNumber
          );
          const errorMessage = rejectedItem?.error?.message || 'Unknown error';
          
          // If retrack fails with "Retrack is not allowed" or "not register" error, try register instead
          if (errorMessage.includes('Retrack is not allowed') || errorMessage.includes('not register')) {
            console.log('ℹ️ Retrack not allowed, trying register instead...');
            response = await track17Service.registerTracking({
              number: fulfillment.trackingNumber,
            });

            const isRegistered = response.data?.accepted?.some(
              (item) => item.number === fulfillment.trackingNumber
            );

            if (!isRegistered) {
              const registerRejectedItem = response.data?.rejected?.find(
                (item) => item.number === fulfillment.trackingNumber
              );
              const registerErrorMessage = registerRejectedItem?.error?.message || 'Unknown error';
              return createErrorResponse(
                `17Track failed to register tracking: ${registerErrorMessage}`,
                400
              );
            }

            console.log('✅ Tracking registered with 17Track (fallback) and activated:', {
              trackingNumber: fulfillment.trackingNumber,
              fulfillmentId: fulfillment.fulfillmentId,
            });
          } else {
            return createErrorResponse(
              `17Track failed to retrack: ${errorMessage}`,
              400
            );
          }
        } else {
          console.log('✅ Tracking retracked with 17Track and activated:', {
            trackingNumber: fulfillment.trackingNumber,
            fulfillmentId: fulfillment.fulfillmentId,
          });
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return createErrorResponse(
          `Failed to retrack/register tracking: ${errorMessage}`,
          500
        );
      }
    } else {
      // Tracking was never registered or is in unknown state - use register
      response = await track17Service.registerTracking({
        number: fulfillment.trackingNumber,
      });

      // Check if registration was successful
      const isAccepted = response.data?.accepted?.some(
        (item) => item.number === fulfillment.trackingNumber
      );

      if (!isAccepted) {
        const rejectedItem = response.data?.rejected?.find(
          (item) => item.number === fulfillment.trackingNumber
        );
        const errorMessage = rejectedItem?.error?.message || 'Unknown error';
        return createErrorResponse(
          `17Track rejected tracking number: ${errorMessage}`,
          400
        );
      }

      console.log('✅ Tracking registered with 17Track and activated:', {
        trackingNumber: fulfillment.trackingNumber,
        fulfillmentId: fulfillment.fulfillmentId,
      });
    }

    // Update tracking processStatus to Running
    await prisma.tracking.update({
      where: { id: fulfillment.tracking.id },
      data: {
        processStatus: TrackingProcessStatus.Running,
      },
    });

    // Sync status from 17Track after successful registration/retrack
    // This is done asynchronously to not block the response
    let syncError: string | null = null;
    try {
      await syncTrackingStatusFrom17Track(
        fulfillment.id,
        fulfillment.fulfillmentId,
        fulfillment.trackingNumber,
        fulfillment.shop.shopDomain,
        fulfillment.shop.clientId,
        fulfillment.shop.secret
      );
    } catch (error: unknown) {
      // Log error but don't fail the request
      syncError = error instanceof Error ? error.message : 'Unknown error';
      console.warn('⚠️ [PUT] Status sync failed, but registration was successful:', syncError);
    }

    return NextResponse.json({
      success: true,
      data: {
        id: fulfillment.id,
        trackingNumber: fulfillment.trackingNumber,
        processStatus: 'Running',
        ...(syncError && { syncError: `Status sync failed: ${syncError}` }),
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to register tracking with 17Track';
    if (errorMessage === 'Unauthorized' || errorMessage === 'Access denied') {
      return createUnauthorizedResponse();
    }
    console.error('❌ [PUT] Error registering tracking with 17Track:', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return createErrorResponse(errorMessage, 500);
  }
}


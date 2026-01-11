import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  createErrorResponse,
  createUnauthorizedResponse,
} from '@/lib/auth-helpers';
import { ShopifyStatus, TrackingProcessStatus } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    const searchParams = request.nextUrl.searchParams;
    const daysThreshold = parseInt(searchParams.get('daysThreshold') || '7', 10);
    const storeFilterParam = searchParams.get('stores');
    const storeIds = storeFilterParam ? storeFilterParam.split(',').filter(Boolean) : [];

    // Build store filter based on user role and selected stores
    let storeFilter: { shopId?: { in: string[] } } = {};
    
    if (user.role === 'Admin') {
      // Admin can see all stores, but if stores are filtered, use those
      if (storeIds.length > 0) {
        storeFilter = { shopId: { in: storeIds } };
      }
    } else {
      // Customer can only see their own stores
      const userStores = await prisma.store.findMany({
        where: { ownerId: user.id },
        select: { id: true },
      });
      const userStoreIds = userStores.map((s) => s.id);

      if (storeIds.length > 0) {
        // Filter to intersection of selected stores and user's stores
        const validStoreIds = storeIds.filter((id) => userStoreIds.includes(id));
        if (validStoreIds.length > 0) {
          storeFilter = { shopId: { in: validStoreIds } };
        } else {
          // No valid stores selected, return empty results
          storeFilter = { shopId: { in: [] } };
        }
      } else {
        // No filter selected, use all user's stores
        if (userStoreIds.length > 0) {
          storeFilter = { shopId: { in: userStoreIds } };
        } else {
          // User has no stores, return empty results
          storeFilter = { shopId: { in: [] } };
        }
      }
    }

    // Get total counts with store filter
    const hasEmptyStoreFilter = storeFilter.shopId?.in.length === 0;
    const [numberOfOrders, numberOfFulfillments, numberOfTrackings] = await Promise.all([
      hasEmptyStoreFilter
        ? Promise.resolve(0)
        : prisma.order.count({
            where: Object.keys(storeFilter).length > 0 ? storeFilter : undefined,
          }),
      hasEmptyStoreFilter
        ? Promise.resolve(0)
        : prisma.fulfillment.count({
            where: Object.keys(storeFilter).length > 0 ? storeFilter : undefined,
          }),
      // Trackings are not directly linked to stores, so we count via fulfillments
      // Only count trackings with processStatus: 'Running'
      hasEmptyStoreFilter
        ? Promise.resolve(0)
        : prisma.tracking.count({
            where: Object.keys(storeFilter).length > 0
              ? {
                  fulfillments: {
                    some: storeFilter,
                  },
                  processStatus: TrackingProcessStatus.Running,
                }
              : {
                  processStatus: TrackingProcessStatus.Running,
                },
          }),
    ]);

    // Calculate no status update since threshold
    // Use tracking.lastEventAt instead of statusCurrentUpdatedAt (matches trackings table logic)
    // Exclude delivered fulfillments as they are already completed
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

    const noStatusUpdateSince = await prisma.fulfillment.count({
      where: {
        ...(Object.keys(storeFilter).length > 0 ? storeFilter : {}),
        trackingId: { not: null }, // Only count fulfillments with tracking
        statusCurrent: { not: ShopifyStatus.DELIVERED }, // Exclude delivered status
        tracking: {
          processStatus: TrackingProcessStatus.Running,
          lastEventAt: {
            lte: thresholdDate,
          },
        },
      },
    });

    // Calculate orders created 20 days ago (excl. Delivered)
    const orderCreated20DaysThreshold = new Date();
    orderCreated20DaysThreshold.setDate(orderCreated20DaysThreshold.getDate() - 20);

    const orderCreated20Days = await prisma.fulfillment.count({
      where: {
        ...(Object.keys(storeFilter).length > 0 ? storeFilter : {}),
        trackingId: { not: null }, // Only count fulfillments with tracking
        statusCurrent: { not: ShopifyStatus.DELIVERED }, // Exclude delivered status
        tracking: {
          processStatus: TrackingProcessStatus.Running,
        },
        order: {
          createdAt: {
            lte: orderCreated20DaysThreshold,
          },
        },
      },
    });

    // Get status breakdown with store filter
    // Only include fulfillments with running trackings
    const statusBreakdownWhere: {
      shopId?: { in: string[] };
      trackingId: { not: null };
      tracking: { processStatus: TrackingProcessStatus };
    } = hasEmptyStoreFilter
      ? {
          shopId: { in: [] },
          trackingId: { not: null },
          tracking: { processStatus: TrackingProcessStatus.Running },
        }
      : Object.keys(storeFilter).length > 0
        ? {
            ...storeFilter,
            trackingId: { not: null },
            tracking: { processStatus: TrackingProcessStatus.Running },
          }
        : {
            trackingId: { not: null },
            tracking: { processStatus: TrackingProcessStatus.Running },
          };


    const statusBreakdownRaw = await prisma.fulfillment.groupBy({
      by: ['statusCurrent'],
      where: statusBreakdownWhere,
      _count: {
        id: true,
      },
    });

    // Transform status breakdown to match frontend format
    // Ordered by shipping lifecycle: Initial → Active → Delivery → Success → Problems
    const statusBreakdown: Record<string, number> = {
      labelPurchased: 0,
      confirmed: 0,
      pickedUpByCarrier: 0,
      inTransit: 0,
      outForDelivery: 0,
      attemptedDelivery: 0,
      delivered: 0,
      readyForPickup: 0,
      delayed: 0,
      failure: 0,
    };

    statusBreakdownRaw.forEach((item) => {
      const status = item.statusCurrent;
      const count = item._count.id;

      // Skip if statusCurrent is null (no status set yet)
      if (status === null) {
        return;
      }

      // Map ShopifyStatus enum to frontend keys (only show selected statuses)
      // Ordered by shipping lifecycle flow
      switch (status) {
        case ShopifyStatus.LABEL_PURCHASED:
          statusBreakdown.labelPurchased += count;
          break;
        case ShopifyStatus.CONFIRMED:
          statusBreakdown.confirmed += count;
          break;
        case ShopifyStatus.CARRIER_PICKED_UP:
          statusBreakdown.pickedUpByCarrier += count;
          break;
        case ShopifyStatus.IN_TRANSIT:
          statusBreakdown.inTransit += count;
          break;
        case ShopifyStatus.OUT_FOR_DELIVERY:
          statusBreakdown.outForDelivery += count;
          break;
        case ShopifyStatus.ATTEMPTED_DELIVERY:
          statusBreakdown.attemptedDelivery += count;
          break;
        case ShopifyStatus.DELIVERED:
          statusBreakdown.delivered += count;
          break;
        case ShopifyStatus.READY_FOR_PICKUP:
          statusBreakdown.readyForPickup += count;
          break;
        case ShopifyStatus.DELAYED:
          statusBreakdown.delayed += count;
          break;
        case ShopifyStatus.FAILURE:
          statusBreakdown.failure += count;
          break;
        // LABEL_PRINTED is not shown in breakdown
      }
    });

    // Calculate average times
    // Average order created → delivered
    // Only include fulfillments with running trackings
    const deliveredFulfillments = await prisma.fulfillment.findMany({
      where: {
        ...(Object.keys(storeFilter).length > 0 ? storeFilter : {}),
        statusCurrent: ShopifyStatus.DELIVERED,
        deliveredAt: {
          not: null,
        },
        trackingId: { not: null },
        tracking: {
          processStatus: TrackingProcessStatus.Running,
        },
      },
      include: {
        order: {
          select: {
            createdAt: true,
          },
        },
      },
    });

    let orderToDeliveredSum = 0;
    let orderToDeliveredCount = 0;
    let fulfillmentToDeliveredSum = 0;
    let fulfillmentToDeliveredCount = 0;

    deliveredFulfillments.forEach((fulfillment) => {
      if (fulfillment.deliveredAt) {
        // Order to delivered
        const orderCreated = fulfillment.order.createdAt;
        const delivered = fulfillment.deliveredAt;
        const daysDiff = (delivered.getTime() - orderCreated.getTime()) / (1000 * 60 * 60 * 24);
        orderToDeliveredSum += daysDiff;
        orderToDeliveredCount++;

        // Fulfillment to delivered
        const fulfillmentCreated = fulfillment.createdAt;
        const fulfillmentDaysDiff = (delivered.getTime() - fulfillmentCreated.getTime()) / (1000 * 60 * 60 * 24);
        fulfillmentToDeliveredSum += fulfillmentDaysDiff;
        fulfillmentToDeliveredCount++;
      }
    });

    const averageTimes = {
      orderToDelivered: orderToDeliveredCount > 0
        ? orderToDeliveredSum / orderToDeliveredCount
        : null,
      fulfillmentToDelivered: fulfillmentToDeliveredCount > 0
        ? fulfillmentToDeliveredSum / fulfillmentToDeliveredCount
        : null,
    };

    return NextResponse.json({
      numberOfOrders,
      numberOfFulfillments,
      numberOfTrackings,
      noStatusUpdateSince,
      orderCreated20Days,
      daysThreshold,
      statusBreakdown,
      averageTimes,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch dashboard data';
    if (errorMessage === 'Unauthorized' || errorMessage === 'Access denied') {
      return createUnauthorizedResponse();
    }
    console.error('Error fetching dashboard data:', error);
    return createErrorResponse(errorMessage, 500);
  }
}

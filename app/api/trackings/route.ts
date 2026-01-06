import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  createErrorResponse,
  createUnauthorizedResponse,
  createNotFoundResponse,
} from '@/lib/auth-helpers';
import {
  transformTracking,
  parsePaginationParams,
  parseSortParams,
  createPaginatedResponse,
  FrontendTrackingOrder,
} from '@/lib/api-helpers';
import { ShopifyStatus, TrackingProcessStatus, StoreStatus } from '@prisma/client';
import { track17Service } from '@/lib/services/track17';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

    const searchParams = request.nextUrl.searchParams;
    const { page, limit, skip } = parsePaginationParams(searchParams);
    const { sortBy, sortOrder } = parseSortParams(searchParams);
    const search = searchParams.get('search') || '';
    const statusFilterParam = searchParams.get('status');
    const statusFilter = statusFilterParam ? statusFilterParam.split(',') : [];
    const statusNullParam = searchParams.get('statusNull');
    const includeNullStatus = statusNullParam === 'true';
    const noUpdateDaysParam = searchParams.get('noUpdateDays');
    const noUpdateDays = noUpdateDaysParam ? parseInt(noUpdateDaysParam, 10) : null;
    const processStatusFilterParam = searchParams.get('processStatus');
    const processStatusFilter = processStatusFilterParam as TrackingProcessStatus | null;
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

    // Build where clause
    // Only show fulfillments that have an associated tracking
    const where: any = {
      ...storeFilter,
      trackingId: { not: null },
    };

    // Status filter - handle both enum values and null status
    if (statusFilter.length > 0 || includeNullStatus) {
      if (includeNullStatus && statusFilter.length > 0) {
        // Filter includes both null and specific statuses - use OR at where level
        // Need to combine with existing where conditions using AND
        const statusConditions: any[] = [
          { statusCurrent: { in: statusFilter as ShopifyStatus[] } },
          { statusCurrent: null },
        ];
        
        // If there's already an OR condition (from search), we need to combine properly
        if (where.OR) {
          // Combine search OR with status OR using AND
          where.AND = [
            { OR: where.OR },
            { OR: statusConditions },
          ];
          delete where.OR;
        } else {
          where.OR = statusConditions;
        }
      } else if (includeNullStatus) {
        // Only filter for null status
        where.statusCurrent = null;
      } else {
        // Only filter for specific statuses
        where.statusCurrent = {
          in: statusFilter as ShopifyStatus[],
        };
      }
    }

    // Build tracking filter (combines processStatus and lastEventAt filters)
    const trackingFilter: any = {};
    
    // Process status filter
    if (processStatusFilter) {
      trackingFilter.processStatus = processStatusFilter;
    }
    
    // No update filter - use tracking.lastEventAt instead of statusCurrentUpdatedAt
    if (noUpdateDays !== null && !isNaN(noUpdateDays)) {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - noUpdateDays);
      trackingFilter.lastEventAt = {
        lte: thresholdDate,
      };
    }
    
    // Apply tracking filter if it has any conditions
    if (Object.keys(trackingFilter).length > 0) {
      where.tracking = trackingFilter;
    }

    // Search filter (order name or tracking number)
    // If status filter already set where.OR, combine using AND
    if (search) {
      const searchConditions = [
        { trackingNumber: { contains: search, mode: 'insensitive' } },
        {
          order: {
            name: { contains: search, mode: 'insensitive' },
          },
        },
      ];
      
      if (where.OR) {
        // Status filter already set OR, combine with search using AND
        where.AND = [
          { OR: where.OR },
          { OR: searchConditions },
        ];
        delete where.OR;
      } else {
        where.OR = searchConditions;
      }
    }

    // Build orderBy clause
    let orderBy: any = { createdAt: 'desc' };
    if (sortBy) {
      if (sortBy === 'order') {
        orderBy = { order: { name: sortOrder } };
      } else if (sortBy === 'lastStatusUpdate') {
        // Sort by tracking.lastEventAt instead of statusCurrentUpdatedAt
        orderBy = { tracking: { lastEventAt: sortOrder } };
      } else if (sortBy === 'daysSinceUpdate') {
        // Sort by tracking.lastEventAt (ascending = newer first, descending = older first)
        orderBy = { tracking: { lastEventAt: sortOrder === 'asc' ? 'desc' : 'asc' } };
      } else if (sortBy === 'trackingNumber') {
        orderBy = { trackingNumber: sortOrder };
      }
    }

    // Get total count
    const total = await prisma.fulfillment.count({ where });

    // Get fulfillments with related data
    const fulfillments = await prisma.fulfillment.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        order: {
          select: {
            name: true,
          },
        },
        shop: {
          select: {
            id: true,
            status: true,
          },
        },
        tracking: {
          select: {
            id: true,
            processStatus: true,
            lastEventAt: true,
          },
        },
      },
    });

    const transformedTrackings: FrontendTrackingOrder[] = fulfillments.map(transformTracking);

    return NextResponse.json(createPaginatedResponse(transformedTrackings, total, page, limit));
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message === 'Access denied') {
      return createUnauthorizedResponse();
    }
    console.error('Error fetching trackings:', error);
    return createErrorResponse(error.message || 'Failed to fetch trackings', 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth();

    const body = await request.json();
    const { trackingId, processStatus } = body;

    if (!trackingId || !processStatus) {
      return createErrorResponse('trackingId and processStatus are required', 400);
    }

    if (!['Running', 'Stopped'].includes(processStatus)) {
      return createErrorResponse('processStatus must be either "Running" or "Stopped"', 400);
    }

    // Check if user has access to this tracking
    // Find a fulfillment that uses this tracking
    const fulfillment = await prisma.fulfillment.findFirst({
      where: { trackingId },
      include: {
        shop: {
          select: {
            id: true,
            ownerId: true,
            status: true,
          },
        },
        tracking: true,
      },
    });

    if (!fulfillment || !fulfillment.tracking) {
      return createNotFoundResponse();
    }

    // Verify access: Admin can access all, Customer can only access their own stores
    if (user.role !== 'Admin' && fulfillment.shop.ownerId !== user.id) {
      return createUnauthorizedResponse();
    }

    const currentProcessStatus = fulfillment.tracking.processStatus;
    const newProcessStatus = processStatus as TrackingProcessStatus;
    const isStoreActive = fulfillment.shop.status === StoreStatus.Active;

    // If stopping: call 17Track stopTracking API
    if (newProcessStatus === TrackingProcessStatus.Stopped && currentProcessStatus === TrackingProcessStatus.Running) {
      if (isStoreActive && fulfillment.tracking?.trackingNumber) {
        const trackingNumber = fulfillment.tracking.trackingNumber;
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
            });
          }
        } catch (error: unknown) {
          // Log error but continue - we'll still update the database
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.warn('⚠️ Error stopping tracking at 17Track:', errorMessage);
        }
      }
    }

    // If starting: call 17Track retrack or registerTracking API
    if (newProcessStatus === TrackingProcessStatus.Running && currentProcessStatus === TrackingProcessStatus.Stopped) {
      if (isStoreActive && fulfillment.tracking?.trackingNumber) {
        const trackingNumber = fulfillment.tracking.trackingNumber;
        try {
          // Use retrack since tracking was previously stopped
          const retrackResponse = await track17Service.retrack({
            number: trackingNumber,
            // carrier is optional - 17Track will process for all matching carriers if not provided
          });

          // Check if retrack was successful
          const isRetracked = retrackResponse.data?.accepted?.some(
            (item) => item.number === trackingNumber
          ) ?? false;

          if (!isRetracked) {
            const rejectedItem = retrackResponse.data?.rejected?.find(
              (item) => item.number === trackingNumber
            );
            const errorMessage = rejectedItem?.error?.message || 'Unknown error';
            
            // If retrack fails with "Retrack is not allowed" error, try register instead
            if (errorMessage.includes('Retrack is not allowed') || errorMessage.includes('not register')) {
              console.log('ℹ️ Retrack not allowed, trying register instead...');
              const registerResponse = await track17Service.registerTracking({
                number: trackingNumber,
              });

              const isRegistered = registerResponse.data?.accepted?.some(
                (item) => item.number === trackingNumber
              ) ?? false;

              if (!isRegistered) {
                const registerRejectedItem = registerResponse.data?.rejected?.find(
                  (item) => item.number === trackingNumber
                );
                const registerErrorMessage = registerRejectedItem?.error?.message || 'Unknown error';
                console.warn(
                  `⚠️ 17Track failed to register tracking ${trackingNumber}: ${registerErrorMessage}`
                );
                // Continue anyway - we'll still update the database
              } else {
                console.log('✅ Tracking registered with 17Track:', {
                  trackingNumber: trackingNumber,
                });
              }
            } else {
              console.warn(
                `⚠️ 17Track failed to retrack ${trackingNumber}: ${errorMessage}`
              );
              // Continue anyway - we'll still update the database
            }
          } else {
            console.log('✅ Tracking retracked with 17Track:', {
              trackingNumber: trackingNumber,
            });
          }
        } catch (error: unknown) {
          // Log error but continue - we'll still update the database
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.warn('⚠️ Error retracking/registering at 17Track:', errorMessage);
        }
      }
    }

    // Update tracking processStatus in database
    const updatedTracking = await prisma.tracking.update({
      where: { id: trackingId },
      data: {
        processStatus: newProcessStatus,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updatedTracking.id,
        processStatus: updatedTracking.processStatus,
      },
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message === 'Access denied') {
      return createUnauthorizedResponse();
    }
    console.error('Error updating tracking process status:', error);
    return createErrorResponse(error.message || 'Failed to update tracking process status', 500);
  }
}

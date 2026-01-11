'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MultiSelect } from '@/components/ui/multi-select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState, useEffect, useRef } from 'react';
import { useRole } from '@/lib/role-context';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, ArrowUpDown, X, RefreshCw, Play, Square, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { MultiSelectOption } from '@/components/ui/multi-select';
import { cn } from '@/lib/utils';
import { TrackingThresholdsSettings } from '@/components/tracking-thresholds-settings';
import { useThresholds } from '@/hooks/use-thresholds';
import type { TrackingThresholds } from '@/lib/threshold-utils';

type TrackingOrder = {
  id: string;
  shopId: string;
  shopStatus: 'active' | 'inactive';
  order: string;
  trackingNumber: string;
  currentStatus: string;
  lastStatusUpdate: string;
  daysSinceUpdate: number;
  processStatus: 'Running' | 'Stopped' | null;
  trackingId: string | null;
};

// Map ShopifyStatus enum to display format
function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    ATTEMPTED_DELIVERY: 'Attempted Delivery',
    CARRIER_PICKED_UP: 'Carrier Picked Up',
    CONFIRMED: 'Confirmed',
    DELAYED: 'Delayed',
    DELIVERED: 'Delivered',
    FAILURE: 'Failure',
    IN_TRANSIT: 'In Transit',
    LABEL_PRINTED: 'Label Printed',
    LABEL_PURCHASED: 'Label Purchased',
    OUT_FOR_DELIVERY: 'Out for Delivery',
    READY_FOR_PICKUP: 'Ready for Pickup',
    UNKNOWN: 'Unknown',
  };
  return statusMap[status] || (status === '' ? 'Unknown' : status);
}

// Reverse map for filtering
// Returns null for "Unknown" to filter by null statusCurrent in database
function unformatStatus(status: string): string | null {
  const reverseMap: Record<string, string | null> = {
    'Attempted Delivery': 'ATTEMPTED_DELIVERY',
    'Carrier Picked Up': 'CARRIER_PICKED_UP',
    Confirmed: 'CONFIRMED',
    Delayed: 'DELAYED',
    Delivered: 'DELIVERED',
    Failure: 'FAILURE',
    'In Transit': 'IN_TRANSIT',
    'Label Printed': 'LABEL_PRINTED',
    'Label Purchased': 'LABEL_PURCHASED',
    'Out for Delivery': 'OUT_FOR_DELIVERY',
    'Ready for Pickup': 'READY_FOR_PICKUP',
    Unknown: null, // null means filter by statusCurrent IS NULL
  };
  return reverseMap[status] !== undefined ? reverseMap[status] : status;
}

// Status options for filtering
const STATUS_OPTIONS = [
  { value: 'Label Purchased', label: 'Label Purchased' },
  { value: 'Confirmed', label: 'Confirmed' },
  { value: 'Carrier Picked Up', label: 'Carrier Picked Up' },
  { value: 'In Transit', label: 'In Transit' },
  { value: 'Out for Delivery', label: 'Out for Delivery' },
  { value: 'Attempted Delivery', label: 'Attempted Delivery' },
  { value: 'Delivered', label: 'Delivered' },
  { value: 'Ready for Pickup', label: 'Ready for Pickup' },
  { value: 'Delayed', label: 'Delayed' },
  { value: 'Failure', label: 'Failure' },
];

export default function TrackingsPage() {
  const { role } = useRole();
  const router = useRouter();
  const searchParams = useSearchParams();
  const thresholds = useThresholds();
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [quickFilterStatusFilter, setQuickFilterStatusFilter] = useState<string[]>([]);
  const [noUpdateFilter, setNoUpdateFilter] = useState(false);
  const [orderCreatedDaysFilter, setOrderCreatedDaysFilter] = useState<number | null>(null);
  const [processStatusFilter, setProcessStatusFilter] = useState<
    'Running' | 'Stopped' | null
  >('Running');
  const [storeFilter, setStoreFilter] = useState<string[]>([]);
  const [storeOptions, setStoreOptions] = useState<MultiSelectOption[]>([]);
  const [showStoreFilter, setShowStoreFilter] = useState(false);
  const [filterInitialized, setFilterInitialized] = useState(false);
  const isUpdatingUrl = useRef(false);
  const isSettingFilterFromUrl = useRef(false);
  const lastUrlStoresParam = useRef<string | null>(null);
  const [activeQuickFilter, setActiveQuickFilter] = useState<string | null>(
    null
  );
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [trackings, setTrackings] = useState<TrackingOrder[]>([]);
  const [stores, setStores] = useState<Record<string, string>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [updatingFulfillmentId, setUpdatingFulfillmentId] = useState<
    string | null
  >(null);
  const [copiedCellId, setCopiedCellId] = useState<string | null>(null);

  // Fetch stores for shop name lookup and filter
  useEffect(() => {
    const loadStores = async () => {
      try {
        // Use user stores endpoint for filter options
        const userStoresResponse = await fetch('/api/stores/user');
        if (userStoresResponse.ok) {
          const userStoresData = await userStoresResponse.json();
          const options: MultiSelectOption[] = userStoresData.data.map(
            (store: { id: string; name: string }) => ({
              value: store.id,
              label: store.name,
            })
          );
          setStoreOptions(options);

          // Show filter if user has more than 1 store or is admin
          setShowStoreFilter(role === 'admin' || options.length > 1);
        }

        // Also fetch all stores for name lookup (admin endpoint or user endpoint)
        const allStoresResponse = await fetch('/api/stores/user');
        if (allStoresResponse.ok) {
          const allStoresData = await allStoresResponse.json();
          const storeMap: Record<string, string> = {};
          allStoresData.data.forEach((store: { id: string; name: string }) => {
            storeMap[store.id] = store.name;
          });
          setStores(storeMap);
        }
      } catch (error) {
        console.error('Failed to load stores:', error);
      }
    };

    loadStores();
  }, [role]); // Only re-fetch when role changes

  // Sync filter from URL - always read from URL when it changes (e.g., on mount or page navigation)
  useEffect(() => {
    if (storeOptions.length === 0) return; // Wait for stores to load
    if (isUpdatingUrl.current) return; // Don't read if we're updating URL

    const storesParam = searchParams.get('stores');
    
    // Only sync if URL param actually changed (prevents unnecessary updates)
    if (lastUrlStoresParam.current === storesParam) {
      // URL hasn't changed, but mark as initialized if not already
      if (!filterInitialized) {
        setFilterInitialized(true);
      }
      return;
    }
    
    // URL param changed, update filter
    lastUrlStoresParam.current = storesParam;
    isSettingFilterFromUrl.current = true;
    
    if (storesParam) {
      const storeIds = storesParam.split(',').filter(Boolean);
      // Validate that all store IDs exist
      const validStoreIds = storeIds.filter((id) =>
        storeOptions.some((s) => s.value === id)
      );
      setStoreFilter(validStoreIds.length > 0 ? validStoreIds : []);
    } else {
      setStoreFilter([]);
    }
    
    // Mark as initialized and reset flag
    setFilterInitialized(true);
    Promise.resolve().then(() => {
      isSettingFilterFromUrl.current = false;
    });
  }, [storeOptions, searchParams, filterInitialized]);

  // Update URL when filters change (but not when setting from URL)
  useEffect(() => {
    if (storeOptions.length === 0) return; // Wait for stores to load
    if (!filterInitialized) return; // Don't update URL until filter is initialized
    if (isSettingFilterFromUrl.current) return; // Don't update URL if we're setting filter from URL

    const params = new URLSearchParams(searchParams.toString());
    const currentStoresParam = params.get('stores') || '';
    const newStoresParam = storeFilter.length > 0 ? storeFilter.join(',') : '';

    // Only update if actually changed (normalize null to empty string for comparison)
    if (currentStoresParam === newStoresParam) {
      return;
    }

    // Mark that we're updating URL to prevent reading back from URL
    isUpdatingUrl.current = true;

    const newStoresParamForUrl = storeFilter.length > 0 ? storeFilter.join(',') : null;

    // Update stores param
    if (storeFilter.length > 0) {
      params.set('stores', storeFilter.join(','));
    } else {
      params.delete('stores');
    }

    // Update page to 1 when filters change (except page itself)
    if (params.get('page') !== '1') {
      params.set('page', '1');
    }

    // Update ref to prevent re-reading from URL
    lastUrlStoresParam.current = newStoresParamForUrl;

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    router.replace(newUrl, { scroll: false });

    // Reset flag after a short delay to allow URL to update
    setTimeout(() => {
      isUpdatingUrl.current = false;
    }, 100);
  }, [storeFilter, storeOptions.length, router, searchParams, filterInitialized]);

  // Fetch trackings
  const fetchTrackings = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setInitialLoading(true);
      }
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: itemsPerPage.toString(),
      });

      if (orderSearchQuery) {
        params.append('search', orderSearchQuery);
      }
      // Combine manual status filter and quick filter status filter
      const combinedStatusFilter = [...statusFilter, ...quickFilterStatusFilter];
      if (combinedStatusFilter.length > 0) {
        // Convert display status to enum format
        // Filter out null values (Unknown) and handle them separately
        const enumStatuses = combinedStatusFilter
          .map(unformatStatus)
          .filter((s): s is string => s !== null);
        const hasUnknown = combinedStatusFilter.some((s) => unformatStatus(s) === null);

        if (enumStatuses.length > 0) {
          params.append('status', enumStatuses.join(','));
        }
        if (hasUnknown) {
          params.append('statusNull', 'true');
        }
      }
      if (noUpdateFilter) {
        params.append('noUpdateDays', thresholds.daysWithoutUpdate.toString());
      }
      if (orderCreatedDaysFilter !== null) {
        params.append('orderCreatedDays', orderCreatedDaysFilter.toString());
      }
      if (processStatusFilter) {
        params.append('processStatus', processStatusFilter);
      }
      if (storeFilter.length > 0) {
        params.append('stores', storeFilter.join(','));
      }
      if (sortColumn) {
        params.append('sortBy', sortColumn);
        params.append('sortOrder', sortDirection);
      }

      const response = await fetch(`/api/trackings?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch trackings');
      }

      const data = await response.json();
      // Format statuses for display
      const formattedTrackings = data.data.map((tracking: TrackingOrder) => ({
        ...tracking,
        currentStatus: formatStatus(tracking.currentStatus),
      }));
      setTrackings(formattedTrackings);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
      setHasLoadedOnce(true);
    } catch (error: any) {
      toast.error('Error', {
        description: error.message || 'Failed to fetch trackings',
      });
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setInitialLoading(false);
      }
    }
  };

  // Sync orderCreatedDaysFilter when thresholds change and "order-created-20d" filter is active
  // This ensures the filter value is updated, which will then trigger the main fetch effect
  useEffect(() => {
    if (activeQuickFilter === 'order-created-20d') {
      setOrderCreatedDaysFilter(thresholds.daysUndelivered);
    }
  }, [thresholds.daysUndelivered, activeQuickFilter]);

  // Trigger refetch when daysWithoutUpdate threshold changes and noUpdateFilter is active
  // This is needed because thresholds.daysWithoutUpdate is used directly in fetchTrackings
  // Note: This effect only runs when thresholds.daysWithoutUpdate changes, not when noUpdateFilter changes
  useEffect(() => {
    if (storeOptions.length === 0 || !filterInitialized || !hasLoadedOnce) {
      return;
    }
    if (noUpdateFilter) {
      fetchTrackings(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thresholds.daysWithoutUpdate]);

  useEffect(() => {
    // Wait for stores to load AND filter to be initialized before fetching data
    if (storeOptions.length === 0 || !filterInitialized) {
      return; // Wait for both stores and filter initialization
    }
    // Only use initialLoading if we haven't loaded data yet, otherwise use refreshing
    fetchTrackings(hasLoadedOnce);
  }, [
    currentPage,
    itemsPerPage,
    orderSearchQuery,
    statusFilter,
    noUpdateFilter,
    orderCreatedDaysFilter,
    processStatusFilter,
    storeFilter,
    quickFilterStatusFilter,
    sortColumn,
    sortDirection,
    storeOptions.length,
    filterInitialized,
  ]);

  const hasActiveFilters =
    orderSearchQuery !== '' ||
    statusFilter.length > 0 ||
    quickFilterStatusFilter.length > 0 ||
    noUpdateFilter ||
    orderCreatedDaysFilter !== null ||
    processStatusFilter === 'Stopped' ||
    activeQuickFilter !== null;

  const getShopName = (shopId: string) => {
    return stores[shopId] || 'Unknown';
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const getStatusColor = (status: string) => {
    const statusMap: Record<
      string,
      'default' | 'secondary' | 'destructive' | 'outline'
    > = {
      'Attempted Delivery': 'destructive',
      'Carrier Picked Up': 'default',
      Confirmed: 'secondary',
      Delayed: 'destructive',
      Delivered: 'outline',
      Failure: 'destructive',
      'In Transit': 'default',
      'Label Printed': 'secondary',
      'Label Purchased': 'secondary',
      'Out for Delivery': 'default',
      'Ready for Pickup': 'default',
      Unknown: 'secondary',
    };
    return statusMap[status] || 'secondary';
  };

  const clearQuickFilter = () => {
    setActiveQuickFilter(null);
    setQuickFilterStatusFilter([]);
    setNoUpdateFilter(false);
    setOrderCreatedDaysFilter(null);
  };

  const handleQuickFilter = (filterId: string) => {
    if (activeQuickFilter === filterId) {
      clearQuickFilter();
      setProcessStatusFilter('Running');
    } else {
      setActiveQuickFilter(filterId);
      if (filterId === 'excluding-delivered') {
        setQuickFilterStatusFilter([
          'Confirmed',
          'In Transit',
          'Out for Delivery',
          'Delayed',
          'Attempted Delivery',
          'Failure',
        ]);
        setNoUpdateFilter(true);
        setOrderCreatedDaysFilter(null);
        setProcessStatusFilter('Running');
      } else if (filterId === 'confirmed-only') {
        setQuickFilterStatusFilter(['Label Purchased', 'Confirmed']);
        setNoUpdateFilter(true);
        setOrderCreatedDaysFilter(null);
        setProcessStatusFilter('Running');
      } else if (filterId === 'order-created-20d') {
        // Exclude delivered status
        setQuickFilterStatusFilter([
          'Label Purchased',
          'Confirmed',
          'Carrier Picked Up',
          'In Transit',
          'Out for Delivery',
          'Attempted Delivery',
          'Ready for Pickup',
          'Delayed',
          'Failure',
        ]);
        setNoUpdateFilter(false);
        setOrderCreatedDaysFilter(thresholds.daysUndelivered);
        setProcessStatusFilter('Running');
      }
    }
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setOrderSearchQuery('');
    setStatusFilter([]);
    // Store filter is not cleared - it's a separate selection, not a filter
    setProcessStatusFilter('Running');
    clearQuickFilter();
    setCurrentPage(1);
  };

  const handleStatusChange = (value: string[]) => {
    setStatusFilter(value);
    clearQuickFilter();
  };

  const handleNoUpdateChange = (checked: boolean) => {
    setNoUpdateFilter(checked);
    clearQuickFilter();
  };

  const handleManualUpdate = async (fulfillmentId: string) => {
    setUpdatingFulfillmentId(fulfillmentId);

    // Show loading toast
    const loadingToastId = toast.loading('Updating tracking...', {
      description: 'Fetching latest status from 17Track',
    });

    try {
      const response = await fetch(`/api/trackings/${fulfillmentId}`, {
        method: 'POST',
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        // Dismiss loading toast
        toast.dismiss(loadingToastId);

        // Build detailed error message
        const errorDetails = result.details || {};
        let errorDescription = result.error || 'Failed to update tracking';

        // Add step-by-step error details
        const errorSteps: string[] = [];
        if (errorDetails.track17 && !errorDetails.track17.success) {
          errorSteps.push(
            `17Track: ${errorDetails.track17.error || 'Failed to fetch tracking info'}`
          );
        }
        if (errorDetails.statusMapping && !errorDetails.statusMapping.success) {
          errorSteps.push(
            `Status Mapping: ${errorDetails.statusMapping.error || 'Failed to map status'}`
          );
        }
        if (errorDetails.shopify && !errorDetails.shopify.success) {
          errorSteps.push(
            `Shopify Sync: ${errorDetails.shopify.error || 'Failed to update Shopify'}`
          );
        }

        if (errorSteps.length > 0) {
          errorDescription = errorSteps.join('\n');
        }

        toast.error('Update Failed', {
          description: (
            <div className="whitespace-pre-line text-sm">
              {errorDescription}
            </div>
          ),
          duration: 6000,
        });

        setUpdatingFulfillmentId(null);
        return;
      }

      // Dismiss loading toast
      toast.dismiss(loadingToastId);

      // Build detailed success message
      const details = result.details || {};
      const data = result.data || {};

      const successSteps: string[] = [];

      // Add step-by-step success details
      if (details.track17?.success) {
        const subStatusText = details.track17.subStatus
          ? ` / ${details.track17.subStatus}`
          : '';
        successSteps.push(
          `✓ 17Track: Status ${details.track17.status}${subStatusText}`
        );
      }

      if (details.statusMapping?.success) {
        const mappingNote = details.statusMapping.usedFallback
          ? ' (used fallback mapping)'
          : '';
        successSteps.push(
          `✓ Status Mapping: ${details.statusMapping.shopifyStatus}${mappingNote}`
        );
      }

      if (details.shopify?.success) {
        successSteps.push(`✓ Shopify: Status synced successfully`);
      }

      if (details.database?.success) {
        if (details.database.statusChanged) {
          successSteps.push(
            `✓ Database: Status changed from ${data.oldStatus || 'N/A'} to ${data.status || 'N/A'}`
          );
        } else {
          successSteps.push(
            `✓ Database: Status unchanged (${data.status || 'N/A'})`
          );
        }
      }

      // Format description with each step on its own line
      const successDescription =
        successSteps.length > 0
          ? successSteps.join('\n')
          : 'Tracking updated successfully';

      // Show warning if fallback mapping was used
      if (details.statusMapping?.usedFallback) {
        toast.warning('Update Completed with Warning', {
          description: (
            <div className="whitespace-pre-line text-sm">
              {successDescription}
            </div>
          ),
          duration: 6000,
        });
      } else {
        toast.success('Update Completed', {
          description: (
            <div className="whitespace-pre-line text-sm">
              {successDescription}
            </div>
          ),
          duration: 5000,
        });
      }

      // Refresh the trackings list
      fetchTrackings(true);
    } catch (error: unknown) {
      // Dismiss loading toast
      toast.dismiss(loadingToastId);

      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update tracking';
      toast.error('Update Failed', {
        description: errorMessage,
        duration: 6000,
      });
    } finally {
      setUpdatingFulfillmentId(null);
    }
  };

  const handleRegisterTracking = async (fulfillmentId: string) => {
    try {
      const response = await fetch(`/api/trackings/${fulfillmentId}`, {
        method: 'PUT',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to register tracking');
      }

      const result = await response.json();
      const data = result.data || {};

      // Show success message with tracking info status
      if (data.trackingInfoFetched) {
        toast.success('Tracking Registered & Updated', {
          description:
            'Tracking registered with 17Track, activated, and current status fetched',
          duration: 5000,
        });
      } else if (data.trackingInfoError) {
        toast.success('Tracking Registered', {
          description: `Tracking registered and activated. ${data.trackingInfoError}`,
          duration: 6000,
        });
      } else {
        toast.success('Success', {
          description: 'Tracking registered with 17Track and activated',
        });
      }

      // Refresh the trackings list
      fetchTrackings(true);
    } catch (error: any) {
      toast.error('Error', {
        description: error.message || 'Failed to register tracking',
      });
    }
  };

  const handleStopTracking = async (trackingId: string) => {
    try {
      const response = await fetch('/api/trackings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trackingId,
          processStatus: 'Stopped',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to stop tracking');
      }

      toast.success('Tracking Stopped', {
        description: 'Tracking has been stopped successfully',
        duration: 5000,
      });

      // Refresh the trackings list
      fetchTrackings(true);
    } catch (error: any) {
      toast.error('Error', {
        description: error.message || 'Failed to stop tracking',
      });
    }
  };

  const handleCopyToClipboard = async (
    value: string,
    cellId: string,
    label: string
  ) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCellId(cellId);
      toast.success('Copied', {
        description: `${label} copied to clipboard`,
        duration: 2000,
      });
      // Reset the copied state after animation
      setTimeout(() => {
        setCopiedCellId(null);
      }, 2000);
    } catch (error) {
      toast.error('Failed to copy', {
        description: 'Could not copy to clipboard',
        duration: 2000,
      });
    }
  };

  const handleCopyOrderAndTracking = async (
    order: string,
    trackingNumber: string
  ) => {
    try {
      const textToCopy = `${order}, ${trackingNumber}`;
      await navigator.clipboard.writeText(textToCopy);
      toast.success('Copied', {
        description: 'Order and tracking number copied to clipboard',
        duration: 2000,
      });
    } catch (error) {
      toast.error('Failed to copy', {
        description: 'Could not copy to clipboard',
        duration: 2000,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Trackings</h1>
          <p className="text-muted-foreground mt-1">
            View and manage all tracking orders
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showStoreFilter && (
            <>
              <span className="text-sm font-medium text-muted-foreground">
                Stores:
              </span>
              <MultiSelect
                options={storeOptions}
                value={storeFilter}
                onChange={(value) => {
                  setStoreFilter(value);
                  clearQuickFilter();
                  setCurrentPage(1);
                }}
                placeholder="All Stores"
                emptyMessage="No stores found."
                className="w-[200px]"
              />
            </>
          )}
          <TrackingThresholdsSettings />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Quick Filters:
          </span>
          <Button
            variant={
              activeQuickFilter === 'confirmed-only' ? 'default' : 'outline'
            }
            size="sm"
            onClick={() => handleQuickFilter('confirmed-only')}
            className="h-8"
          >
            {thresholds.daysWithoutUpdate}d No Update · Pre-Transit
          </Button>
          <Button
            variant={
              activeQuickFilter === 'excluding-delivered'
                ? 'default'
                : 'outline'
            }
            size="sm"
            onClick={() => handleQuickFilter('excluding-delivered')}
            className="h-8"
          >
            {thresholds.daysWithoutUpdate}d No Update · Undelivered
          </Button>
          <Button
            variant={
              activeQuickFilter === 'order-created-20d' ? 'default' : 'outline'
            }
            size="sm"
            onClick={() => handleQuickFilter('order-created-20d')}
            className="h-8"
          >
            {thresholds.daysUndelivered}d+ Undelivered
          </Button>
        </div>
        {hasActiveFilters && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="h-8"
            >
              <X className="mr-2 h-4 w-4" />
              Clear filters
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by order or tracking number"
            value={orderSearchQuery}
            onChange={(e) => {
              setOrderSearchQuery(e.target.value);
              clearQuickFilter();
              setCurrentPage(1);
            }}
            className="pl-9"
          />
        </div>

        <MultiSelect
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={handleStatusChange}
          placeholder="All Statuses"
          emptyMessage="No status found."
          className="w-[180px]"
        />

        <div className="flex items-center gap-2 border rounded-lg px-4 py-2">
          <Switch
            id="process-status-filter"
            checked={processStatusFilter === 'Stopped'}
            onCheckedChange={(checked) => {
              setProcessStatusFilter(checked ? 'Stopped' : 'Running');
              clearQuickFilter();
              setCurrentPage(1);
            }}
          />
          <Label htmlFor="process-status-filter" className="cursor-pointer text-sm">
            Stopped only
          </Label>
        </div>
      </div>

      {initialLoading && !hasLoadedOnce ? (
        <div className="space-y-6">
          <div>
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-5 w-64 mt-1" />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-10 flex-1 min-w-[200px]" />
            <Skeleton className="h-10 w-[280px]" />
            <Skeleton className="h-10 w-[200px]" />
          </div>

          <div className="border rounded-lg">
            <div className="p-8 space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8"
                    onClick={() => handleSort('order')}
                  >
                    Order
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>Tracking Number</TableHead>
                <TableHead>Current Status</TableHead>
                <TableHead>Process Status</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8"
                    onClick={() => handleSort('lastStatusUpdate')}
                  >
                    Last Status Update (UTC)
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8"
                    onClick={() => handleSort('daysSinceUpdate')}
                  >
                    Days Since Update
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trackings.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No tracking orders found
                  </TableCell>
                </TableRow>
              ) : (
                trackings.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>{getShopName(order.shopId)}</TableCell>
                    <TableCell
                      className={cn(
                        'font-medium cursor-pointer transition-colors',
                        copiedCellId === `order-${order.id}`
                          ? 'bg-primary/10'
                          : 'hover:bg-muted/50'
                      )}
                      onClick={() =>
                        handleCopyToClipboard(
                          order.order,
                          `order-${order.id}`,
                          'Order'
                        )
                      }
                      title="Click to copy order number"
                    >
                      {order.order}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'font-mono text-sm cursor-pointer transition-colors',
                        copiedCellId === `tracking-${order.id}`
                          ? 'bg-primary/10'
                          : 'hover:bg-muted/50'
                      )}
                      onClick={() =>
                        handleCopyToClipboard(
                          order.trackingNumber,
                          `tracking-${order.id}`,
                          'Tracking number'
                        )
                      }
                      title="Click to copy tracking number"
                    >
                      {order.trackingNumber}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(order.currentStatus)}>
                        {order.currentStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {order.trackingId ? (
                        <Badge
                          variant={
                            order.processStatus === 'Running'
                              ? 'default'
                              : 'secondary'
                          }
                        >
                          {order.processStatus || 'Running'}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          N/A
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{order.lastStatusUpdate}</TableCell>
                    <TableCell>{order.daysSinceUpdate}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            handleCopyOrderAndTracking(
                              order.order,
                              order.trackingNumber
                            )
                          }
                          title="Copy order and tracking number"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        {order.processStatus === 'Running' && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleManualUpdate(order.id)}
                              disabled={updatingFulfillmentId === order.id}
                              title="Manually update tracking status"
                            >
                              <RefreshCw
                                className={`h-4 w-4 ${updatingFulfillmentId === order.id ? 'animate-spin' : ''}`}
                              />
                            </Button>
                            {order.trackingId && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleStopTracking(order.trackingId!)}
                                title="Stop tracking"
                              >
                                <Square className="h-4 w-4" />
                              </Button>
                            )}
                          </>
                        )}
                        {order.processStatus === 'Stopped' &&
                          order.trackingId &&
                          order.shopStatus === 'active' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRegisterTracking(order.id)}
                              title="Register tracking with 17Track and activate"
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {!initialLoading && trackings.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Show</span>
            <Select
              value={itemsPerPage.toString()}
              onValueChange={(value) => {
                setItemsPerPage(Number(value));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
              {Math.min(currentPage * itemsPerPage, total)} of {total}
            </span>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <div className="text-sm">
                Page {currentPage} of {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

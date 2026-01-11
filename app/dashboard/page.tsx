'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MultiSelect, MultiSelectOption } from '@/components/ui/multi-select';
import { Skeleton } from '@/components/ui/skeleton';
import { useRole } from '@/lib/role-context';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { TrackingThresholdsSettings } from '@/components/tracking-thresholds-settings';
import { useThresholds } from '@/hooks/use-thresholds';
import type { TrackingThresholds } from '@/lib/threshold-utils';

export default function DashboardPage() {
  const thresholds = useThresholds();
  const { role } = useRole();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [stores, setStores] = useState<MultiSelectOption[]>([]);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [showStoreFilter, setShowStoreFilter] = useState(false);
  const [filterInitialized, setFilterInitialized] = useState(false);
  const isSettingFilterFromUrl = useRef(false);
  const lastUrlStoresParam = useRef<string | null>(null);
  // Track the latest request ID to prevent race conditions
  // Each request gets a unique ID, and only responses matching the latest ID should update state
  const latestRequestIdRef = useRef<number>(0);
  const [kpiData, setKpiData] = useState({
    numberOfOrders: 0,
    numberOfFulfillments: 0,
    numberOfTrackings: 0,
    noStatusUpdateSince: 0,
    orderCreated20Days: 0,
    daysThreshold: thresholds.daysWithoutUpdate,
  });
  const [statusBreakdown, setStatusBreakdown] = useState({
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
  });
  const [averageTimes, setAverageTimes] = useState({
    orderToDelivered: null as number | null,
    fulfillmentToDelivered: null as number | null,
  });

  // Load stores
  useEffect(() => {
    const loadStores = async () => {
      try {
        const response = await fetch('/api/stores/user');
        if (!response.ok) {
          throw new Error('Failed to fetch stores');
        }
        const data = await response.json();
        const storeOptions: MultiSelectOption[] = data.data.map(
          (store: { id: string; name: string }) => ({
            value: store.id,
            label: store.name,
          })
        );
        setStores(storeOptions);

        // Show filter if user has more than 1 store or is admin
        setShowStoreFilter(
          role === 'admin' || storeOptions.length > 1
        );
      } catch (error: any) {
        console.error('Failed to load stores:', error);
      }
    };

    loadStores();
  }, [role]);

  // Sync filter from URL - always read from URL when it changes (e.g., on mount or page navigation)
  useEffect(() => {
    if (stores.length === 0) return; // Wait for stores to load

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
        stores.some((s) => s.value === id)
      );
      setSelectedStores(validStoreIds.length > 0 ? validStoreIds : []);
    } else {
      setSelectedStores([]);
    }
    
    // Mark as initialized and reset flag
    setFilterInitialized(true);
    Promise.resolve().then(() => {
      isSettingFilterFromUrl.current = false;
    });
  }, [stores, searchParams, filterInitialized]);

  // Update URL when selected stores change (but not when setting from URL)
  useEffect(() => {
    if (stores.length === 0) return; // Wait for stores to load
    if (!filterInitialized) return; // Don't update URL until filter is initialized
    if (isSettingFilterFromUrl.current) return; // Don't update URL if we're setting filter from URL

    const params = new URLSearchParams(searchParams.toString());
    const currentStoresParam = params.get('stores') || '';
    const newStoresParam = selectedStores.length > 0 ? selectedStores.join(',') : '';
    
    // Only update if actually changed (normalize null to empty string for comparison)
    if (currentStoresParam === newStoresParam) {
      return;
    }

    const newStoresParamForUrl = selectedStores.length > 0 ? selectedStores.join(',') : null;
    
    if (selectedStores.length > 0) {
      params.set('stores', selectedStores.join(','));
    } else {
      params.delete('stores');
    }

    // Update ref to prevent re-reading from URL
    lastUrlStoresParam.current = newStoresParamForUrl;

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  }, [selectedStores, stores.length, router, searchParams, filterInitialized]);

  useEffect(() => {
    // Wait for stores to load AND filter to be initialized before fetching data
    if (stores.length === 0 || !filterInitialized) {
      return; // Wait for both stores and filter initialization
    }
    // Only use initialLoading if we haven't loaded data yet, otherwise use refreshing
    fetchDashboardData(hasLoadedOnce);
  }, [selectedStores, stores.length, filterInitialized, thresholds]);

  const fetchDashboardData = async (isRefresh = false) => {
    // Generate a unique request ID for this request
    latestRequestIdRef.current += 1;
    const requestId = latestRequestIdRef.current;
    
    // Capture threshold values at request time
    const requestThresholds: TrackingThresholds = {
      daysWithoutUpdate: thresholds.daysWithoutUpdate,
      daysUndelivered: thresholds.daysUndelivered,
    };
    
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setInitialLoading(true);
      }
      
      const params = new URLSearchParams({
        daysThreshold: requestThresholds.daysWithoutUpdate.toString(),
        daysUndelivered: requestThresholds.daysUndelivered.toString(),
      });
      if (selectedStores.length > 0) {
        params.append('stores', selectedStores.join(','));
      }
      const response = await fetch(`/api/dashboard?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }
      const data = await response.json();

      // Only update state if this response is for the latest request
      // This prevents stale responses from overwriting newer data
      if (requestId === latestRequestIdRef.current) {
        setKpiData({
          numberOfOrders: data.numberOfOrders,
          numberOfFulfillments: data.numberOfFulfillments,
          numberOfTrackings: data.numberOfTrackings,
          noStatusUpdateSince: data.noStatusUpdateSince,
          orderCreated20Days: data.orderCreated20Days,
          daysThreshold: requestThresholds.daysWithoutUpdate,
        });
        setStatusBreakdown(data.statusBreakdown);
        setAverageTimes(data.averageTimes);
        setHasLoadedOnce(true);
      }
      // If a newer request was made, ignore this response
    } catch (error: any) {
      // Only show error if this is still the latest request (to avoid stale error messages)
      if (requestId === latestRequestIdRef.current) {
        toast.error('Error', {
          description: error.message || 'Failed to fetch dashboard data',
        });
      }
    } finally {
      // Only update loading state if this is still the latest request
      if (requestId === latestRequestIdRef.current) {
        if (isRefresh) {
          setRefreshing(false);
        } else {
          setInitialLoading(false);
        }
      }
    }
  };

  // Only show full loading screen on first load, not on subsequent refreshes
  if (initialLoading && !hasLoadedOnce) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-64 mt-1" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="border rounded-lg p-6 space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-10 w-24" />
          </div>
          <div className="border rounded-lg p-6 space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-10 w-24" />
          </div>
          <div className="border rounded-lg p-6 space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="border rounded-lg p-6 space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-10 w-24" />
          </div>
          <div className="border rounded-lg p-6 space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>

        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-5 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="border rounded-lg p-6 space-y-3">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <Skeleton className="h-8 w-40" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="border rounded-lg p-6 space-y-3">
              <Skeleton className="h-5 w-56" />
              <Skeleton className="h-8 w-24" />
            </div>
            <div className="border rounded-lg p-6 space-y-3">
              <Skeleton className="h-5 w-64" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Overview of your system metrics and activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showStoreFilter && (
            <>
              <span className="text-sm font-medium text-muted-foreground">
                Stores:
              </span>
              <MultiSelect
                options={stores}
                value={selectedStores}
                onChange={setSelectedStores}
                placeholder="All Stores"
                emptyMessage="No stores found."
                className="w-[200px]"
              />
            </>
          )}
          <TrackingThresholdsSettings />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Number of orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{kpiData.numberOfOrders}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Number of fulfillments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {kpiData.numberOfFulfillments}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              Number of trackings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {kpiData.numberOfTrackings}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              No status update since {thresholds.daysWithoutUpdate} days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {kpiData.noStatusUpdateSince}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {thresholds.daysUndelivered}d+ since Order created (excl. Delivered)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">
              {kpiData.orderCreated20Days}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Status Breakdown</h2>
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-5 lg:grid-cols-5">
          <Card className="flex flex-col">
            <CardContent className="flex-1 flex flex-col justify-between p-6">
              <span className="text-sm font-medium text-muted-foreground">
                Label purchased
              </span>
              <span className="text-3xl font-bold mt-2">
                {statusBreakdown.labelPurchased}
              </span>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardContent className="flex-1 flex flex-col justify-between p-6">
              <span className="text-sm font-medium text-muted-foreground">
                Confirmed
              </span>
              <span className="text-3xl font-bold mt-2">
                {statusBreakdown.confirmed}
              </span>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardContent className="flex-1 flex flex-col justify-between p-6">
              <span className="text-sm font-medium text-muted-foreground">
                Picked up by carrier
              </span>
              <span className="text-3xl font-bold mt-2">
                {statusBreakdown.pickedUpByCarrier}
              </span>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardContent className="flex-1 flex flex-col justify-between p-6">
              <span className="text-sm font-medium text-muted-foreground">
                In transit
              </span>
              <span className="text-3xl font-bold mt-2">
                {statusBreakdown.inTransit}
              </span>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardContent className="flex-1 flex flex-col justify-between p-6">
              <span className="text-sm font-medium text-muted-foreground">
                Out for delivery
              </span>
              <span className="text-3xl font-bold mt-2">
                {statusBreakdown.outForDelivery}
              </span>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardContent className="flex-1 flex flex-col justify-between p-6">
              <span className="text-sm font-medium text-muted-foreground">
                Attempted delivery
              </span>
              <span className="text-3xl font-bold mt-2">
                {statusBreakdown.attemptedDelivery}
              </span>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardContent className="flex-1 flex flex-col justify-between p-6">
              <span className="text-sm font-medium text-muted-foreground">
                Delivered
              </span>
              <span className="text-3xl font-bold mt-2">
                {statusBreakdown.delivered}
              </span>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardContent className="flex-1 flex flex-col justify-between p-6">
              <span className="text-sm font-medium text-muted-foreground">
                Ready for pickup
              </span>
              <span className="text-3xl font-bold mt-2">
                {statusBreakdown.readyForPickup}
              </span>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardContent className="flex-1 flex flex-col justify-between p-6">
              <span className="text-sm font-medium text-muted-foreground">
                Delayed
              </span>
              <span className="text-3xl font-bold mt-2">
                {statusBreakdown.delayed}
              </span>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardContent className="flex-1 flex flex-col justify-between p-6">
              <span className="text-sm font-medium text-muted-foreground">
                Failure
              </span>
              <span className="text-3xl font-bold mt-2">
                {statusBreakdown.failure}
              </span>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Average times</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Ø Order created → Delivered
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {averageTimes.orderToDelivered !== null
                  ? `${averageTimes.orderToDelivered.toFixed(1)} Tage`
                  : 'N/A'}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Ø Fulfillment created → Delivered
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {averageTimes.fulfillmentToDelivered !== null
                  ? `${averageTimes.fulfillmentToDelivered.toFixed(1)} Tage`
                  : 'N/A'}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MultiSelect, MultiSelectOption } from '@/components/ui/multi-select';
import { Skeleton } from '@/components/ui/skeleton';
import { useRole } from '@/lib/role-context';
import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function DashboardPage() {
  const daysThreshold = 7;
  const { role } = useRole();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [stores, setStores] = useState<MultiSelectOption[]>([]);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [showStoreFilter, setShowStoreFilter] = useState(false);
  const [kpiData, setKpiData] = useState({
    numberOfOrders: 0,
    numberOfFulfillments: 0,
    numberOfTrackings: 0,
    noStatusUpdateSince: 0,
    orderCreated20Days: 0,
    daysThreshold: daysThreshold,
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

  // Load stores and initialize filter from URL
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

        // Initialize selected stores from URL params
        const storesParam = searchParams.get('stores');
        if (storesParam) {
          const storeIds = storesParam.split(',').filter(Boolean);
          // Validate that all store IDs exist
          const validStoreIds = storeIds.filter((id) =>
            storeOptions.some((s) => s.value === id)
          );
          if (validStoreIds.length > 0) {
            setSelectedStores(validStoreIds);
          }
        }
      } catch (error: any) {
        console.error('Failed to load stores:', error);
      }
    };

    loadStores();
  }, [role, searchParams.toString()]);

  // Update URL when selected stores change
  useEffect(() => {
    if (stores.length === 0) return; // Wait for stores to load

    const params = new URLSearchParams(searchParams.toString());
    const currentStoresParam = params.get('stores') || '';
    const newStoresParam = selectedStores.length > 0 ? selectedStores.join(',') : '';
    
    // Only update if actually changed (normalize null to empty string for comparison)
    if (currentStoresParam === newStoresParam) {
      return;
    }

    if (selectedStores.length > 0) {
      params.set('stores', selectedStores.join(','));
    } else {
      params.delete('stores');
    }

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  }, [selectedStores, stores.length, router]);

  useEffect(() => {
    // Only use initialLoading if we haven't loaded data yet, otherwise use refreshing
    fetchDashboardData(hasLoadedOnce);
  }, [selectedStores]);

  const fetchDashboardData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setInitialLoading(true);
      }
      const params = new URLSearchParams({
        daysThreshold: daysThreshold.toString(),
      });
      if (selectedStores.length > 0) {
        params.append('stores', selectedStores.join(','));
      }
      const response = await fetch(`/api/dashboard?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }
      const data = await response.json();

      setKpiData({
        numberOfOrders: data.numberOfOrders,
        numberOfFulfillments: data.numberOfFulfillments,
        numberOfTrackings: data.numberOfTrackings,
        noStatusUpdateSince: data.noStatusUpdateSince,
        orderCreated20Days: data.orderCreated20Days,
        daysThreshold: data.daysThreshold,
      });
      setStatusBreakdown(data.statusBreakdown);
      setAverageTimes(data.averageTimes);
      setHasLoadedOnce(true);
    } catch (error: any) {
      toast.error('Error', {
        description: error.message || 'Failed to fetch dashboard data',
      });
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setInitialLoading(false);
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
        {showStoreFilter && (
          <div className="flex items-center gap-2">
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
          </div>
        )}
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
              No status update since {kpiData.daysThreshold} days
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
              20d since Order created (excl. Delivered)
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

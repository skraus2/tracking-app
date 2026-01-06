'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState, useEffect, Fragment } from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { useRole } from '@/lib/role-context';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Skeleton } from '@/components/ui/skeleton';

const STATUS_MAPPINGS = [
  {
    mainStatus: 'NotFound',
    subStatuses: ['NotFound_Other', 'NotFound_InvalidCode'],
  },
  { mainStatus: 'InfoReceived', subStatuses: ['InfoReceived'] },
  {
    mainStatus: 'InTransit',
    subStatuses: [
      'InTransit_PickedUp',
      'InTransit_Other',
      'InTransit_Departure',
      'InTransit_Arrival',
      'InTransit_CustomsProcessing',
      'InTransit_CustomsReleased',
      'InTransit_CustomsRequiringInformation',
    ],
  },
  { mainStatus: 'Expired', subStatuses: ['Expired_Other'] },
  {
    mainStatus: 'AvailableForPickup',
    subStatuses: ['AvailableForPickup_Other'],
  },
  { mainStatus: 'OutForDelivery', subStatuses: ['OutForDelivery_Other'] },
  {
    mainStatus: 'DeliveryFailure',
    subStatuses: [
      'DeliveryFailure_Other',
      'DeliveryFailure_NoBody',
      'DeliveryFailure_Security',
      'DeliveryFailure_Rejected',
      'DeliveryFailure_InvalidAddress',
    ],
  },
  { mainStatus: 'Delivered', subStatuses: ['Delivered_Other'] },
  {
    mainStatus: 'Exception',
    subStatuses: [
      'Exception_Other',
      'Exception_Returning',
      'Exception_Returned',
      'Exception_NoBody',
      'Exception_Security',
      'Exception_Damage',
      'Exception_Rejected',
      'Exception_Delayed',
      'Exception_Lost',
      'Exception_Destroyed',
      'Exception_Cancel',
    ],
  },
];

// Only allow mapping to these statuses (excludes LABEL_PRINTED)
const SHOPIFY_STATUSES = [
  'ATTEMPTED_DELIVERY',
  'CARRIER_PICKED_UP',
  'CONFIRMED',
  'DELAYED',
  'DELIVERED',
  'FAILURE',
  'IN_TRANSIT',
  'LABEL_PURCHASED',
  'OUT_FOR_DELIVERY',
  'READY_FOR_PICKUP',
];

export default function SettingsPage() {
  const { role } = useRole();
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [storedApiKey, setStoredApiKey] = useState<{
    masked: string;
    lastUpdated: string;
  } | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [shopifyMappings, setShopifyMappings] = useState<
    Record<string, string>
  >({});
  const [savingMappings, setSavingMappings] = useState(false);

  // Check authentication and role
  useEffect(() => {
    authClient.getSession().then((session) => {
      if (!session?.data?.user) {
        router.push('/sign-in');
        return;
      }
      const user = session.data.user as { role?: string };
      const userRole = user.role?.toLowerCase();
      
      if (userRole !== 'admin') {
        router.push('/dashboard');
        toast.error('Access Denied', {
          description: 'Admin access required',
        });
        return;
      }
      setAuthLoading(false);
    });
  }, [router]);

  // Fetch settings on mount
  useEffect(() => {
    if (!authLoading && role === 'admin') {
      // Only use initialLoading if we haven't loaded data yet, otherwise use refreshing
      fetchSettings(hasLoadedOnce);
    }
  }, [authLoading, role]);

  const fetchSettings = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setInitialLoading(true);
      }
      const response = await fetch('/api/settings');
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/sign-in');
          return;
        }
        throw new Error('Failed to fetch settings');
      }
      const data = await response.json();

      if (data.track17ApiKey) {
        setStoredApiKey({
          masked: data.track17ApiKey.masked,
          lastUpdated: new Date(data.track17ApiKey.lastUpdated).toLocaleString(
            'en-US',
            {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true,
            }
          ),
        });
      } else {
        setStoredApiKey(null);
      }

      setShopifyMappings(data.statusMappings || {});
      setHasLoadedOnce(true);
    } catch (error: any) {
      toast.error('Error', {
        description: error.message || 'Failed to fetch settings',
      });
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setInitialLoading(false);
      }
    }
  };

  const handleSave = async () => {
    if (apiKeyInput.length < 7) return;

    try {
      setIsSaving(true);
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          track17ApiKey: apiKeyInput,
        }),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/sign-in');
          return;
        }
        const error = await response.json();
        throw new Error(error.error || 'Failed to save API key');
      }

      toast.success('API Key Saved', {
        description: 'The API key has been saved successfully.',
      });

      setIsEditing(false);
      setApiKeyInput('');
      setShowPassword(false);
      fetchSettings();
    } catch (error: any) {
      toast.error('Error', {
        description: error.message || 'Failed to save API key',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReplace = () => {
    setIsEditing(true);
    setApiKeyInput('');
    setShowPassword(false);
  };

  const handleDelete = async () => {
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          track17ApiKey: null,
        }),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/sign-in');
          return;
        }
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete API key');
      }

      toast.success('API Key Deleted', {
        description: 'The API key has been deleted successfully.',
      });

      setStoredApiKey(null);
      setIsEditing(false);
      setApiKeyInput('');
      setShowDeleteDialog(false);
      fetchSettings();
    } catch (error: any) {
      toast.error('Error', {
        description: error.message || 'Failed to delete API key',
      });
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setApiKeyInput('');
    setShowPassword(false);
  };

  const handleShopifyStatusChange = (
    subStatus: string,
    shopifyStatus: string
  ) => {
    setShopifyMappings((prev) => ({
      ...prev,
      [subStatus]: shopifyStatus,
    }));
  };

  const handleSaveMappings = async () => {
    try {
      setSavingMappings(true);
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          statusMappings: shopifyMappings,
        }),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/sign-in');
          return;
        }
        const error = await response.json();
        throw new Error(error.error || 'Failed to save status mappings');
      }

      toast.success('Status Mappings Saved', {
        description: 'The status mappings have been saved successfully.',
      });

      fetchSettings();
    } catch (error: any) {
      toast.error('Error', {
        description: error.message || 'Failed to save status mappings',
      });
    } finally {
      setSavingMappings(false);
    }
  };

  if (authLoading || (initialLoading && !hasLoadedOnce)) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-64 mt-1" />
        </div>

        <div className="border rounded-lg p-6 space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-5 w-80" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-10" />
          </div>
        </div>

        <div className="border rounded-lg p-6 space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-5 w-80" />
          </div>
          <div className="border rounded-lg">
            <div className="p-4 space-y-3">
              <div className="flex gap-4">
                <Skeleton className="h-10 w-[180px]" />
                <Skeleton className="h-10 w-[280px]" />
                <Skeleton className="h-10 w-[280px]" />
              </div>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-10 w-[180px]" />
                  <Skeleton className="h-10 w-[280px]" />
                  <Skeleton className="h-10 w-[280px]" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (role !== 'admin') {
    return null; // Will redirect
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure your system preferences
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>17Track API Key</CardTitle>
          <CardDescription>
            Configure your 17Track API key for tracking features
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!storedApiKey || isEditing ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="api-key">API Key</Label>
                <div className="relative">
                  <Input
                    id="api-key"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your 17Track API key..."
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  After saving, only the first 3 and last 3 characters will be
                  visible for security.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSave}
                  disabled={apiKeyInput.length < 7 || isSaving}
                >
                  {isSaving
                    ? 'Saving...'
                    : isEditing && storedApiKey
                      ? 'Update Key'
                      : 'Save Key'}
                </Button>
                {isEditing && storedApiKey && (
                  <Button variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="flex items-center justify-between rounded-md border border-input bg-muted/50 px-3 py-2">
                  <span className="font-mono text-sm">
                    {storedApiKey.masked}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Last updated: {storedApiKey.lastUpdated}
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleReplace}>Replace API Key</Button>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="h-4 w-4 text-destructive-foreground" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Status Mappings</CardTitle>
          <CardDescription>
            Map 17Track statuses to Shopify fulfillment statuses. Fallback mappings are used when a specific sub-status mapping doesn't exist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-4xl space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Main Status</TableHead>
                  <TableHead className="w-[280px]">Sub-Status</TableHead>
                  <TableHead className="w-[280px]">Shopify Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {STATUS_MAPPINGS.map((mapping) => {
                  const totalRows = mapping.subStatuses.length + 1; // +1 for fallback row
                  return (
                    <Fragment key={mapping.mainStatus}>
                      {mapping.subStatuses.map((subStatus, index) => (
                        <TableRow key={`${mapping.mainStatus}-${subStatus}`}>
                          {index === 0 && (
                            <TableCell
                              rowSpan={totalRows}
                              className="font-medium align-top"
                            >
                              {mapping.mainStatus}
                            </TableCell>
                          )}
                          <TableCell>{subStatus}</TableCell>
                          <TableCell>
                            <Select
                              value={shopifyMappings[subStatus] || ''}
                              onValueChange={(value) =>
                                handleShopifyStatusChange(subStatus, value)
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select Shopify status..." />
                              </SelectTrigger>
                              <SelectContent>
                                {SHOPIFY_STATUSES.map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {status}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Fallback mapping row */}
                      <TableRow key={`${mapping.mainStatus}-fallback`} className="bg-muted/30">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground italic">(Fallback)</span>
                            <Badge variant="outline" className="text-xs">
                              Default
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={shopifyMappings[mapping.mainStatus] || ''}
                            onValueChange={(value) =>
                              handleShopifyStatusChange(mapping.mainStatus, value)
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select Shopify status..." />
                            </SelectTrigger>
                            <SelectContent>
                              {SHOPIFY_STATUSES.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {status}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex justify-end">
              <Button onClick={handleSaveMappings} disabled={savingMappings}>
                {savingMappings ? 'Saving...' : 'Save Status Mappings'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this API key? This action cannot
              be undone and tracking features will stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSelectWidth } from '@/hooks/use-select-width';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowUpDown,
  StoreIcon,
  Plus,
  Pencil,
  Trash2,
  Search,
  Eye,
  EyeOff,
  Webhook,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRole } from '@/lib/role-context';
import { authClient } from '@/lib/auth-client';
import { Skeleton } from '@/components/ui/skeleton';

type Store = {
  id: string;
  name: string;
  shopDomain: string;
  clientId: string;
  secret?: string;
  email: string;
  status: 'active' | 'inactive';
  webhooksRegistered: boolean;
  trackingEnabled: boolean;
  autoUpdateEnabled: boolean;
  registeredDaysAgo: number;
  remainingTrackings: number;
  ownerId?: string;
  ownerName?: string;
};

type User = {
  id: string;
  name: string;
  email: string;
};

export default function StoresPage() {
  const { role } = useRole();
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);

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

  const [stores, setStores] = useState<Store[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortColumn, setSortColumn] = useState<'name' | 'trackings' | null>(
    null
  );
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Calculate width for status select based on all possible text values
  const statusSelectWidth = useSelectWidth([
    'Status',
    'All Statuses',
    'Active',
    'Inactive',
  ]);

  const [addEditDialog, setAddEditDialog] = useState<{
    open: boolean;
    mode: 'add' | 'edit';
    storeId?: string;
  }>({
    open: false,
    mode: 'add',
  });
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    storeId?: string;
  }>({ open: false });

  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [registeringWebhooks, setRegisteringWebhooks] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    shopDomain: '',
    clientId: '',
    secret: '',
    ownerId: '',
    status: 'active' as 'active' | 'inactive',
  });

  // Fetch stores
  const fetchStores = async (isRefresh = false) => {
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

      if (searchQuery) {
        params.append('search', searchQuery);
      }
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      if (sortColumn) {
        params.append('sortBy', sortColumn);
        params.append('sortOrder', sortDirection);
      }

      const response = await fetch(`/api/stores?${params.toString()}`);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/sign-in');
          return;
        }
        throw new Error('Failed to fetch stores');
      }

      const data = await response.json();
      setStores(data.data);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
      setHasLoadedOnce(true);
    } catch (error: any) {
      toast.error('Error', {
        description: error.message || 'Failed to fetch stores',
      });
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setInitialLoading(false);
      }
    }
  };

  // Fetch users for owner dropdown
  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users?limit=100');
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }
      const data = await response.json();
      setUsers(data.data);
    } catch (error: any) {
      console.error('Failed to fetch users:', error);
    }
  };

  useEffect(() => {
    if (!authLoading && !false && role === 'admin') {
      // Only use initialLoading if we haven't loaded data yet, otherwise use refreshing
      fetchStores(hasLoadedOnce);
    }
  }, [
    currentPage,
    itemsPerPage,
    searchQuery,
    statusFilter,
    sortColumn,
    sortDirection,
    authLoading,
    false,
    role,
  ]);

  useEffect(() => {
    if (!authLoading && !false && role === 'admin') {
      fetchUsers();
    }
  }, [authLoading, false, role]);

  const handleSort = (column: 'name' | 'trackings') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const isFormValid = () => {
    if (
      !formData.name.trim() ||
      !formData.shopDomain.trim() ||
      !formData.clientId.trim() ||
      !formData.ownerId
    ) {
      return false;
    }
    return true;
  };

  const handleSaveStore = async () => {
    if (!isFormValid()) return;

    try {
      setSaving(true);
      const url =
        addEditDialog.mode === 'add'
          ? '/api/stores'
          : `/api/stores/${addEditDialog.storeId}`;

      const method = addEditDialog.mode === 'add' ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          shopDomain: formData.shopDomain,
          clientId: formData.clientId,
          secret: formData.secret || undefined,
          ownerId: formData.ownerId,
          status: formData.status,
        }),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/sign-in');
          return;
        }
        const error = await response.json();
        throw new Error(error.error || 'Failed to save store');
      }

      toast.success(
        addEditDialog.mode === 'add' ? 'Store Added' : 'Store Updated',
        {
          description: `${formData.name} has been ${addEditDialog.mode === 'add' ? 'added' : 'updated'} successfully.`,
        }
      );

      setFormData({
        name: '',
        shopDomain: '',
        clientId: '',
        secret: '',
        ownerId: '',
        status: 'active',
      });
      setAddEditDialog({ open: false, mode: 'add' });
      setShowSecret(false);
      fetchStores();
    } catch (error: any) {
      toast.error('Error', {
        description: error.message || 'Failed to save store',
      });
    } finally {
      setSaving(false);
    }
  };

  const openEditDialog = async (storeId: string) => {
    try {
      const response = await fetch(`/api/stores/${storeId}`);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/sign-in');
          return;
        }
        throw new Error('Failed to fetch store');
      }
      const store = await response.json();
      setFormData({
        name: store.name,
        shopDomain: store.shopDomain,
        clientId: store.clientId,
        secret: '', // Don't pre-fill secret for security
        ownerId: store.ownerId || '',
        status: store.status,
      });
      setAddEditDialog({ open: true, mode: 'edit', storeId });
    } catch (error: any) {
      toast.error('Error', {
        description: error.message || 'Failed to load store',
      });
    }
  };

  const handleDeleteStore = async () => {
    if (!deleteDialog.storeId) return;

    try {
      const response = await fetch(`/api/stores/${deleteDialog.storeId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/sign-in');
          return;
        }
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete store');
      }

      toast.success('Store Deleted', {
        description: 'The store has been deleted successfully.',
      });

      setDeleteDialog({ open: false });
      fetchStores();
    } catch (error: any) {
      toast.error('Error', {
        description: error.message || 'Failed to delete store',
      });
    }
  };

  const handleRegisterWebhooks = async (storeId: string) => {
    try {
      setRegisteringWebhooks(storeId);
      const response = await fetch(`/api/stores/${storeId}/webhooks/register`, {
        method: 'POST',
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/sign-in');
          return;
        }
        const error = await response.json();
        throw new Error(error.error || 'Failed to register webhooks');
      }

      const data = await response.json();
      toast.success('Webhooks Registered', {
        description: data.webhooksRegistered
          ? `Successfully registered ${data.webhookCount} webhook(s) for this store.`
          : 'Webhook registration completed, but some webhooks may have failed.',
      });

      fetchStores();
    } catch (error: any) {
      toast.error('Error', {
        description: error.message || 'Failed to register webhooks',
      });
    } finally {
      setRegisteringWebhooks(null);
    }
  };

  const getOwnerName = (ownerId?: string) => {
    if (!ownerId) return '—';
    const user = users.find((u) => u.id === ownerId);
    return user?.name || '—';
  };

  if (authLoading || false) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-5 w-64 mt-1" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Skeleton className="h-10 flex-1 min-w-[200px]" />
          <Skeleton className="h-10 w-[150px]" />
        </div>

        <div className="border rounded-lg">
          <div className="p-8 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-12" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-5 w-48" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-8 w-16" />
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Stores</h1>
          <p className="text-muted-foreground mt-1">
            View and manage all registered stores
          </p>
        </div>
        <Button onClick={() => setAddEditDialog({ open: true, mode: 'add' })}>
          <Plus className="h-4 w-4 mr-2" />
          Add Store
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger
            className="w-fit"
            style={
              statusSelectWidth
                ? {
                    width: `${statusSelectWidth}px`,
                    minWidth: `${statusSelectWidth}px`,
                  }
                : undefined
            }
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {initialLoading && !hasLoadedOnce ? (
        <div className="border rounded-lg">
          <div className="p-8 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      ) : stores.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border rounded-lg bg-muted/30">
          <StoreIcon className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No stores yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add your first store to get started.
          </p>
          <Button onClick={() => setAddEditDialog({ open: true, mode: 'add' })}>
            <Plus className="h-4 w-4 mr-2" />
            Add Store
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8"
                    onClick={() => handleSort('name')}
                  >
                    Name
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Webhooks</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8"
                    onClick={() => handleSort('trackings')}
                  >
                    Trackings
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.map((store) => (
                <TableRow key={store.id}>
                  <TableCell className="font-medium">{store.name}</TableCell>
                  <TableCell>{getOwnerName(store.ownerId)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        store.status === 'active' ? 'default' : 'secondary'
                      }
                    >
                      {store.status === 'active' ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        store.webhooksRegistered ? 'default' : 'outline'
                      }
                    >
                      {store.webhooksRegistered ? 'Registered' : 'Not Registered'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {store.remainingTrackings}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {!store.webhooksRegistered && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRegisterWebhooks(store.id)}
                          disabled={registeringWebhooks === store.id || store.status !== 'active'}
                          title={
                            store.status !== 'active'
                              ? 'Store must be active to register webhooks'
                              : 'Register webhooks'
                          }
                        >
                          {registeringWebhooks === store.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Webhook className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(store.id)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteDialog({ open: true, storeId: store.id })}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!initialLoading && stores.length > 0 && (
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

      <Dialog
        open={addEditDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setAddEditDialog({ open: false, mode: 'add' });
            setFormData({
              name: '',
              shopDomain: '',
              clientId: '',
              secret: '',
              ownerId: '',
              status: 'active',
            });
            setShowSecret(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {addEditDialog.mode === 'add' ? 'Add Store' : 'Edit Store'}
            </DialogTitle>
            <DialogDescription>
              {addEditDialog.mode === 'add'
                ? 'Create a new store registration.'
                : 'Modify store details.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Store Info</h3>

              <div className="space-y-2">
                <Label htmlFor="store-name">Name</Label>
                <Input
                  id="store-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Enter store name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="store-domain">Shop Domain</Label>
                <Input
                  id="store-domain"
                  value={formData.shopDomain}
                  onChange={(e) =>
                    setFormData({ ...formData, shopDomain: e.target.value })
                  }
                  placeholder="example.myshopify.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="store-client-id">Client ID</Label>
                <Input
                  id="store-client-id"
                  value={formData.clientId}
                  onChange={(e) =>
                    setFormData({ ...formData, clientId: e.target.value })
                  }
                  placeholder="Enter client ID"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="store-secret">Secret</Label>
                <div className="relative">
                  <Input
                    id="store-secret"
                    type={showSecret ? 'text' : 'password'}
                    value={formData.secret}
                    onChange={(e) =>
                      setFormData({ ...formData, secret: e.target.value })
                    }
                    placeholder={
                      addEditDialog.mode === 'edit'
                        ? 'Enter new secret (optional)'
                        : 'Enter secret'
                    }
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showSecret ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="store-owner">Owner</Label>
                <Select
                  value={formData.ownerId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, ownerId: value })
                  }
                >
                  <SelectTrigger id="store-owner">
                    <SelectValue placeholder="Select owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="store-status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: 'active' | 'inactive') =>
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger id="store-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddEditDialog({ open: false, mode: 'add' });
                setFormData({
                  name: '',
                  shopDomain: '',
                  clientId: '',
                  secret: '',
                  ownerId: '',
                  status: 'active',
                });
                setShowSecret(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveStore}
              disabled={!isFormValid() || saving}
            >
              {saving
                ? 'Saving...'
                : addEditDialog.mode === 'add'
                  ? 'Save'
                  : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialog.open}
        onOpenChange={(open) =>
          setDeleteDialog({ open, storeId: deleteDialog.storeId })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Store</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this store? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false })}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteStore}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

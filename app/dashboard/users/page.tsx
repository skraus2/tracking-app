'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSelectWidth } from '@/hooks/use-select-width';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, Pencil, Plus, ArrowUpDown, Users, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';
import { useRole } from '@/lib/role-context';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';

type User = {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Customer';
  access: boolean;
  shopAccess: { mode: 'selected'; shops: string[] };
};

type FormData = {
  name: string;
  email: string;
  role: User['role'];
  access: boolean;
};

export default function UsersPage() {
  const { role } = useRole();
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [accessFilter, setAccessFilter] = useState<
    'all' | 'enabled' | 'disabled'
  >('all');
  const [sortColumn, setSortColumn] = useState<keyof User | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Calculate width for role select based on all possible text values
  const roleSelectWidth = useSelectWidth(['Role', 'All Roles', 'Admin', 'Customer']);

  // Calculate width for access states select based on all possible text values
  const accessStatesSelectWidth = useSelectWidth([
    'All Access States',
    'Access Enabled',
    'Access Disabled',
  ]);

  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    role: 'Customer',
    access: true,
  });

  const [addEditDialog, setAddEditDialog] = useState<{
    open: boolean;
    mode: 'add' | 'edit';
    userId?: string;
  }>({
    open: false,
    mode: 'add',
  });
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    userId?: string;
  }>({ open: false });
  const [saving, setSaving] = useState(false);

  // Check authentication and role
  useEffect(() => {
    authClient.getSession().then((session) => {
      if (!session?.data?.user) {
        router.push('/sign-in');
        return;
      }
      const user = session.data.user as { id?: string; role?: string };
      if (user.id) {
        setCurrentUserId(user.id);
      }
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

  // Fetch users
  const fetchUsers = async (isRefresh = false) => {
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
      if (roleFilter !== 'all') {
        params.append('role', roleFilter);
      }
      if (accessFilter !== 'all') {
        params.append('access', accessFilter);
      }
      if (sortColumn) {
        params.append('sortBy', sortColumn);
        params.append('sortOrder', sortDirection);
      }

      const response = await fetch(`/api/users?${params.toString()}`);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/sign-in');
          return;
        }
        throw new Error('Failed to fetch users');
      }

      const data = await response.json();
      setUsers(data.data);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
      setHasLoadedOnce(true);
    } catch (error: any) {
      toast.error('Error', {
        description: error.message || 'Failed to fetch users',
      });
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setInitialLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!authLoading && !false && role === 'admin') {
      // Only use initialLoading if we haven't loaded data yet, otherwise use refreshing
      fetchUsers(hasLoadedOnce);
    }
  }, [
    currentPage,
    itemsPerPage,
    searchQuery,
    roleFilter,
    accessFilter,
    sortColumn,
    sortDirection,
    authLoading,
    false,
    role,
  ]);

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const isFormValid = () => {
    if (!formData.name.trim() || !formData.email.trim()) {
      return false;
    }
    if (!isValidEmail(formData.email)) {
      return false;
    }
    return true;
  };

  const handleSort = (column: keyof User) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const openAddDialog = () => {
    setFormData({
      name: '',
      email: '',
      role: 'Customer',
      access: true,
    });
    setAddEditDialog({ open: true, mode: 'add' });
  };

  const openEditDialog = async (userId: string) => {
    try {
      const response = await fetch(`/api/users/${userId}`);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/sign-in');
          return;
        }
        throw new Error('Failed to fetch user');
      }
      const user = await response.json();
      setFormData({
        name: user.name,
        email: user.email,
        role: user.role,
        access: user.access,
      });
      setAddEditDialog({ open: true, mode: 'edit', userId });
    } catch (error: any) {
      toast.error('Error', {
        description: error.message || 'Failed to load user',
      });
    }
  };

  const handleSaveUser = async () => {
    if (!isFormValid()) return;

    try {
      setSaving(true);
      const url =
        addEditDialog.mode === 'add'
          ? '/api/users'
          : `/api/users/${addEditDialog.userId}`;

      const method = addEditDialog.mode === 'add' ? 'POST' : 'PUT';

      // When editing own account, don't send role or access
      const isEditingOwnAccount = addEditDialog.mode === 'edit' && addEditDialog.userId === currentUserId;
      
      const requestBody: any = {
        name: formData.name,
        email: formData.email,
      };

      // Only include role and access if not editing own account
      if (!isEditingOwnAccount) {
        requestBody.role = formData.role;
        requestBody.access = formData.access;
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/sign-in');
          return;
        }
        const error = await response.json();
        throw new Error(error.error || 'Failed to save user');
      }

      toast.success(
        addEditDialog.mode === 'add' ? 'User Added' : 'User Updated',
        {
          description: `${formData.name} has been ${addEditDialog.mode === 'add' ? 'added' : 'updated'} successfully.`,
        }
      );

      setFormData({
        name: '',
        email: '',
        role: 'Customer',
        access: true,
      });
      setAddEditDialog({ open: false, mode: 'add' });
      fetchUsers();
    } catch (error: any) {
      toast.error('Error', {
        description: error.message || 'Failed to save user',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteDialog.userId) return;

    try {
      const response = await fetch(`/api/users/${deleteDialog.userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          router.push('/sign-in');
          return;
        }
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete user');
      }

      toast.success('User Deleted', {
        description: 'The user has been deleted successfully.',
      });

      setDeleteDialog({ open: false });
      fetchUsers();
    } catch (error: any) {
      toast.error('Error', {
        description: error.message || 'Failed to delete user',
      });
    }
  };

  const formatShopAccess = (shopAccess: { mode: string; shops: string[] }) => {
    if (shopAccess.mode === 'selected') {
      const count = shopAccess.shops.length;
      return `${count} ${count === 1 ? 'Store' : 'Stores'}`;
    }
    return 'Unknown';
  };

  if (authLoading || false) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-5 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Skeleton className="h-10 flex-1 min-w-[200px]" />
          <Skeleton className="h-10 w-[150px]" />
          <Skeleton className="h-10 w-[180px]" />
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
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold">Users</h1>
          <p className="text-muted-foreground">
            Management of Admins & Customers
          </p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add User
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
          value={roleFilter}
          onValueChange={(value) => {
            setRoleFilter(value);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger
            className="w-fit"
            style={
              roleSelectWidth
                ? {
                    width: `${roleSelectWidth}px`,
                    minWidth: `${roleSelectWidth}px`,
                  }
                : undefined
            }
          >
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="Admin">Admin</SelectItem>
            <SelectItem value="Customer">Customer</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={accessFilter}
          onValueChange={(value: 'all' | 'enabled' | 'disabled') => {
            setAccessFilter(value);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger
            className="w-fit"
            style={
              accessStatesSelectWidth
                ? {
                    width: `${accessStatesSelectWidth}px`,
                    minWidth: `${accessStatesSelectWidth}px`,
                  }
                : undefined
            }
          >
            <SelectValue>
              {accessFilter === 'all' && 'All Access States'}
              {accessFilter === 'enabled' && 'Access Enabled'}
              {accessFilter === 'disabled' && 'Access Disabled'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Access States</SelectItem>
            <SelectItem value="enabled">Access Enabled</SelectItem>
            <SelectItem value="disabled">Access Disabled</SelectItem>
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
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 border rounded-lg bg-muted/30">
          <Users className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No users yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add your first admin or customer to get started.
          </p>
          <Button onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add User
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
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8"
                    onClick={() => handleSort('email')}
                  >
                    E-Mail
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8"
                    onClick={() => handleSort('role')}
                  >
                    Role
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Stores</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant={user.role === 'Admin' ? 'default' : 'secondary'}
                    >
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.access ? 'default' : 'secondary'}>
                      {user.access ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {user.shopAccess.mode === 'selected' &&
                    user.shopAccess.shops.length > 0
                      ? `${user.shopAccess.shops.length} ${user.shopAccess.shops.length === 1 ? 'Store' : 'Stores'}`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(user.id)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {user.id !== currentUserId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setDeleteDialog({ open: true, userId: user.id })
                          }
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!initialLoading && users.length > 0 && (
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
              email: '',
              role: 'Customer',
              access: true,
            });
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {addEditDialog.mode === 'add' ? 'Add User' : 'Edit User'}
            </DialogTitle>
            <DialogDescription>
              {addEditDialog.mode === 'add'
                ? 'Create a new admin or customer account.'
                : 'Modify user details.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="user-name">Name</Label>
              <Input
                id="user-name"
                placeholder="Full name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-email">E-Mail</Label>
              <Input
                id="user-email"
                type="email"
                placeholder="user@example.com"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
              />
            </div>

            {/* Only show Role and Access fields if not editing own account */}
            {addEditDialog.mode === 'add' || addEditDialog.userId !== currentUserId ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="user-role">Role</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) =>
                      setFormData({ ...formData, role: value as User['role'] })
                    }
                  >
                    <SelectTrigger id="user-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="Customer">Customer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between space-x-2">
                  <div className="space-y-0.5">
                    <Label htmlFor="user-access">Access</Label>
                    <div className="text-sm text-muted-foreground">
                      Enable or disable user access
                    </div>
                  </div>
                  <Switch
                    id="user-access"
                    checked={formData.access}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, access: checked })
                    }
                  />
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                You cannot modify your own role or access settings.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddEditDialog({ open: false, mode: 'add' });
                setFormData({
                  name: '',
                  email: '',
                  role: 'Customer',
                  access: true,
                });
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveUser}
              disabled={!isFormValid() || saving}
            >
              {saving
                ? 'Saving...'
                : addEditDialog.mode === 'add'
                  ? 'Add User'
                  : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteDialog.open}
        onOpenChange={(open) =>
          setDeleteDialog({ open, userId: deleteDialog.userId })
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this user? This action cannot be
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
            <Button variant="destructive" onClick={handleDeleteUser}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { Store, StoreStatus, User, UserRole, UserAccess, Fulfillment, TrackingProcessStatus } from '@prisma/client';

export interface FrontendStore {
  id: string;
  name: string;
  shopDomain: string;
  clientId: string;
  secret?: string;
  email?: string; // Not in schema - optional
  status: 'active' | 'inactive';
  webhooksRegistered: boolean;
  trackingEnabled: boolean;
  autoUpdateEnabled: boolean;
  registeredDaysAgo: number;
  remainingTrackings: number;
  ownerId: string; // Required in schema, not optional
  ownerName?: string;
}

export interface FrontendUser {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Customer';
  access: boolean;
  shopAccess: { mode: 'selected'; shops: string[] };
}

export interface FrontendTrackingOrder {
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
}

export function maskSecret(secret: string | null | undefined): string | undefined {
  if (!secret) return undefined;
  if (secret.length <= 6) return '••••••';
  return `${secret.slice(0, 3)}••••••${secret.slice(-3)}`;
}

export function calculateDaysAgo(date: Date | null | undefined): number {
  if (!date) return 0;
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

export function formatAmericanDateTime(date: Date | null | undefined): string {
  if (!date) return '';
  
  // Format as MM/DD/YYYY, H:MM AM/PM (American format, UTC timezone)
  // Note: UTC label is shown in table header, not repeated in each row
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = date.getUTCFullYear();
  
  let hours = date.getUTCHours();
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  
  return `${month}/${day}/${year}, ${hours}:${minutes} ${ampm}`;
}

export function transformStore(
  store: Store & { owner?: { name: string } | null },
  trackingCount: number = 0
): FrontendStore {
  return {
    id: store.id,
    name: store.name,
    shopDomain: store.shopDomain,
    clientId: store.clientId,
    secret: maskSecret(store.secret), // store.secret is required in schema (String, not String?)
    email: undefined, // Not in schema - optional
    status: store.status === StoreStatus.Active ? 'active' : 'inactive',
    webhooksRegistered: store.webhooksRegistered ?? false,
    trackingEnabled: false, // Placeholder - not in schema
    autoUpdateEnabled: false, // Placeholder - not in schema
    registeredDaysAgo: calculateDaysAgo(store.createdAt),
    remainingTrackings: trackingCount,
    ownerId: store.ownerId, // Required in schema (String, not String?)
    ownerName: store.owner?.name,
  };
}

export function transformUser(
  user: User & { stores?: { id: string }[] }
): FrontendUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role === UserRole.Admin ? 'Admin' : 'Customer',
    access: user.access === UserAccess.Enabled,
    shopAccess: {
      mode: 'selected',
      shops: user.stores?.map((s) => s.id) || [],
    },
  };
}

export function transformTracking(
  fulfillment: Fulfillment & {
    order: { name: string };
    shop: { id: string; status: StoreStatus };
    tracking?: { id: string; processStatus: TrackingProcessStatus; lastEventAt: Date | null } | null;
  }
): FrontendTrackingOrder {
  // Use tracking.lastEventAt for display (17Track last event), not fulfillment.statusCurrentUpdatedAt
  const lastEventAt = fulfillment.tracking?.lastEventAt || null;
  const daysSinceUpdate = calculateDaysAgo(lastEventAt);
  
  // statusCurrent is ShopifyStatus? in schema, convert enum to string
  // Use "Unknown" for null statuses to display in UI
  const currentStatus = fulfillment.statusCurrent 
    ? fulfillment.statusCurrent.toString() 
    : 'UNKNOWN';
  
  return {
    id: fulfillment.id,
    shopId: fulfillment.shopId,
    shopStatus: fulfillment.shop.status === StoreStatus.Active ? 'active' : 'inactive',
    order: fulfillment.order.name,
    trackingNumber: fulfillment.trackingNumber || '',
    currentStatus,
    lastStatusUpdate: formatAmericanDateTime(lastEventAt),
    daysSinceUpdate,
    processStatus: fulfillment.tracking?.processStatus || null,
    trackingId: fulfillment.tracking?.id || null,
  };
}

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export function parsePaginationParams(searchParams: URLSearchParams): PaginationParams {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10', 10)));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

export interface SortParams {
  sortBy: string | null;
  sortOrder: 'asc' | 'desc';
}

export function parseSortParams(searchParams: URLSearchParams): SortParams {
  const sortBy = searchParams.get('sortBy') || null;
  const sortOrder = (searchParams.get('sortOrder') || 'asc') as 'asc' | 'desc';
  return { sortBy, sortOrder };
}

export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

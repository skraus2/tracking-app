export type Store = {
  id: string
  name: string
  shopDomain: string
  clientId: string
  secret?: string // Stored masked, optional since it may not be set yet
  email: string
  status: "active" | "inactive"
  registeredDaysAgo: number
  apiKey?: string
  webhookUrl?: string
  trackingEnabled: boolean
  autoUpdateEnabled: boolean
  ownerId?: string
  remainingTrackings: number
}

export const STORES: Store[] = [
  {
    id: "shop1",
    name: "Main Store",
    shopDomain: "main-store.myshopify.com",
    clientId: "client_abc123",
    secret: "sec_xyz789",
    email: "main@example.com",
    status: "active",
    registeredDaysAgo: 45,
    apiKey: "17t-abc123def456ghi789",
    webhookUrl: "https://main.example.com/webhooks/tracking",
    trackingEnabled: true,
    autoUpdateEnabled: true,
    ownerId: "1",
    remainingTrackings: 150,
  },
  {
    id: "shop2",
    name: "Outlet Store",
    shopDomain: "outlet-store.myshopify.com",
    clientId: "client_def456",
    secret: "sec_uvw012",
    email: "outlet@example.com",
    status: "active",
    registeredDaysAgo: 30,
    apiKey: "17t-xyz987uvw654rst321",
    webhookUrl: "https://outlet.example.com/webhooks/tracking",
    trackingEnabled: true,
    autoUpdateEnabled: false,
    ownerId: "2",
    remainingTrackings: 75,
  },
  {
    id: "shop3",
    name: "Premium Store",
    shopDomain: "premium-store.myshopify.com",
    clientId: "client_ghi789",
    email: "premium@example.com",
    status: "inactive",
    registeredDaysAgo: 15,
    trackingEnabled: false,
    autoUpdateEnabled: false,
    ownerId: "3",
    remainingTrackings: 0,
  },
  {
    id: "shop4",
    name: "Downtown Branch",
    shopDomain: "downtown.myshopify.com",
    clientId: "client_jkl012",
    secret: "sec_mno345",
    email: "downtown@example.com",
    status: "active",
    registeredDaysAgo: 60,
    apiKey: "17t-mno456pqr789stu012",
    webhookUrl: "https://downtown.example.com/webhooks/tracking",
    trackingEnabled: true,
    autoUpdateEnabled: true,
    ownerId: "4",
    remainingTrackings: 200,
  },
  {
    id: "shop5",
    name: "Online Store",
    shopDomain: "online-store.myshopify.com",
    clientId: "client_pqr345",
    secret: "sec_stu678",
    email: "online@example.com",
    status: "active",
    registeredDaysAgo: 90,
    apiKey: "17t-jkl345mno678pqr901",
    webhookUrl: "https://online.example.com/webhooks/tracking",
    trackingEnabled: false,
    autoUpdateEnabled: true,
    ownerId: "1",
    remainingTrackings: 50,
  },
]

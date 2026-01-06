import { prisma } from '@/lib/prisma';

/**
 * Shopify API Service
 * 
 * This service handles webhook subscription management, webhook signature verification,
 * access token management, and fulfillment event creation for the Shopify Admin API.
 */

/**
 * FulfillmentEventStatus enum values
 * Used for creating fulfillment events to track shipment status
 */
export enum FulfillmentEventStatus {
  ATTEMPTED_DELIVERY = 'ATTEMPTED_DELIVERY',
  CARRIER_PICKED_UP = 'CARRIER_PICKED_UP',
  CONFIRMED = 'CONFIRMED',
  DELAYED = 'DELAYED',
  DELIVERED = 'DELIVERED',
  FAILURE = 'FAILURE',
  IN_TRANSIT = 'IN_TRANSIT',
  LABEL_PRINTED = 'LABEL_PRINTED',
  LABEL_PURCHASED = 'LABEL_PURCHASED',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
}

/**
 * Webhook topics that are used in this application
 */
export enum WebhookTopic {
  ORDERS_CREATE = 'ORDERS_CREATE',
  FULFILLMENTS_CREATE = 'FULFILLMENTS_CREATE',
  FULFILLMENTS_UPDATE = 'FULFILLMENTS_UPDATE',
  REFUNDS_CREATE = 'REFUNDS_CREATE',
}

export interface FulfillmentEventInput {
  fulfillmentId: string;
  status: FulfillmentEventStatus;
  happenedAt: string; // ISO 8601 datetime
  message?: string;
  address1?: string;
  city?: string;
  province?: string;
  country?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  estimatedDeliveryAt?: string; // ISO 8601 datetime
}

export interface FulfillmentEvent {
  id: string;
  status: string;
  message?: string;
  happenedAt: string;
  createdAt: string;
  address1?: string;
  city?: string;
  province?: string;
  country?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  estimatedDeliveryAt?: string;
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: Array<string | number>;
  }>;
}

export interface FulfillmentEventCreateResponse {
  fulfillmentEventCreate: {
    fulfillmentEvent?: FulfillmentEvent;
    userErrors: Array<{
      field: string[];
      message: string;
    }>;
  };
}

export interface AccessTokenResponse {
  access_token: string;
  scope: string;
  expires_in: number;
}

export interface WebhookSubscriptionMetafieldIdentifier {
  key: string;
  namespace: string;
}

export interface WebhookSubscriptionMetafieldIdentifierInput {
  key: string;
  namespace?: string;
}

export interface ApiVersion {
  displayName: string;
  handle: string;
  supported: boolean;
}

export interface WebhookSubscription {
  id: string;
  topic: string;
  uri: string;
  filter?: string;
  format: string;
  includeFields: string[];
  metafieldNamespaces: string[];
  metafields: WebhookSubscriptionMetafieldIdentifier[];
  apiVersion?: ApiVersion;
  createdAt: string;
  updatedAt: string;
  legacyResourceId?: string;
}

export interface WebhookSubscriptionInput {
  uri: string;
  filter?: string;
  format?: 'JSON' | 'XML';
  includeFields?: string[];
  metafieldNamespaces?: string[];
  metafields?: WebhookSubscriptionMetafieldIdentifierInput[];
}

export interface WebhookSubscriptionEdge {
  node: WebhookSubscription;
  cursor: string;
}

export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

export interface WebhookSubscriptionsResponse {
  webhookSubscriptions: {
    edges: WebhookSubscriptionEdge[];
    pageInfo: PageInfo;
  };
}

export interface WebhookSubscriptionCreateResponse {
  webhookSubscriptionCreate: {
    webhookSubscription?: WebhookSubscription;
    userErrors: Array<{
      field: string[];
      message: string;
    }>;
  };
}

export interface WebhookSubscriptionUpdateResponse {
  webhookSubscriptionUpdate: {
    webhookSubscription?: WebhookSubscription;
    userErrors: Array<{
      field: string[];
      message: string;
    }>;
  };
}

export interface WebhookSubscriptionDeleteResponse {
  webhookSubscriptionDelete: {
    deletedWebhookSubscriptionId?: string;
    userErrors: Array<{
      field: string[];
      message: string;
    }>;
  };
}

export interface WebhookSubscriptionsQueryParams {
  first?: number;
  after?: string;
  last?: number;
  before?: string;
  topics?: WebhookTopic[]; // Only ORDERS_CREATE, FULFILLMENTS_CREATE, FULFILLMENTS_UPDATE, REFUNDS_CREATE
  format?: string;
  query?: string;
  uri?: string;
  sortKey?: string;
  reverse?: boolean;
}

/**
 * Shopify API Client Class
 * 
 * Uses Shopify Admin API version 2025-10
 */
export class ShopifyService {
  // Shopify Admin API version 2025-10
  private graphqlUrl = 'https://{shop}.myshopify.com/admin/api/2025-10/graphql.json';

  /**
   * Get store credentials from database
   * 
   * @param shopDomain - The shop domain (e.g., 'example.myshopify.com')
   * @param requireAccessToken - Whether to require an access token (default: false)
   * @returns Store with credentials or null if not found
   */
  private async getStore(shopDomain: string, requireAccessToken: boolean = false) {
    const store = await prisma.store.findUnique({
      where: { shopDomain },
    });

    if (!store) {
      throw new Error(`Store not found: ${shopDomain}`);
    }

    if (requireAccessToken && !store.accessToken) {
      throw new Error(`Store access token not available: ${shopDomain}`);
    }

    return store;
  }

  /**
   * Ensure a valid access token exists for the shop
   * Handles token retrieval, expiration checking, and refresh
   * 
   * @param shopDomain - The shop domain
   * @returns Valid access token
   */
  private async ensureValidAccessToken(shopDomain: string): Promise<string> {
    const store = await this.getStore(shopDomain, false);
    
    // 1. No token in database → fetch new one
    if (!store.accessToken) {
      console.log(`ℹ️ No access token found for ${shopDomain}, fetching new token...`);
      const tokenResponse = await this.getAccessToken(shopDomain);
      return tokenResponse.access_token;
    }
    
    // 2. Token exists → check expiration (with 5 minute buffer)
    const now = new Date();
    const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
    const expiresAt = store.accessTokenExpiresAt 
      ? new Date(store.accessTokenExpiresAt.getTime() - bufferTime)
      : null;
    
    if (!expiresAt || now >= expiresAt) {
      // Token expired or no expiration date → refresh
      console.log(`ℹ️ Access token expired or missing expiration for ${shopDomain}, refreshing...`);
      const tokenResponse = await this.getAccessToken(shopDomain);
      return tokenResponse.access_token;
    }
    
    // 3. Token is still valid
    return store.accessToken;
  }

  /**
   * Make authenticated GraphQL request to Shopify API
   * Automatically handles token refresh and 401 errors
   * 
   * @param shopDomain - The shop domain
   * @param query - GraphQL query or mutation string
   * @param variables - GraphQL variables
   * @param retryOn401 - Whether to retry on 401 (default: true, set to false to prevent infinite loops)
   * @returns GraphQL response
   */
  private async makeGraphQLRequest<T>(
    shopDomain: string,
    query: string,
    variables?: Record<string, unknown>,
    retryOn401: boolean = true
  ): Promise<GraphQLResponse<T>> {
    // Ensure we have a valid access token
    const accessToken = await this.ensureValidAccessToken(shopDomain);
    const url = this.graphqlUrl.replace('{shop}', shopDomain.replace('.myshopify.com', ''));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    // Handle 401 Unauthorized - token might be invalid even if not expired
    if (response.status === 401 && retryOn401) {
      console.warn(`⚠️ Received 401 for ${shopDomain}, token may be invalid. Invalidating and retrying...`);
      
      // Invalidate token in database
      await prisma.store.update({
        where: { shopDomain },
        data: {
          accessToken: null,
          accessTokenExpiresAt: null,
        },
      });
      
      // Get new token and retry (with retryOn401=false to prevent infinite loops)
      const newToken = await this.ensureValidAccessToken(shopDomain);
      const retryResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': newToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables,
        }),
      });

      if (!retryResponse.ok) {
        const error = await retryResponse.json().catch(() => ({ message: retryResponse.statusText }));
        throw new Error(`Shopify GraphQL API error: ${error.message || retryResponse.statusText}`);
      }

      const retryData: GraphQLResponse<T> = await retryResponse.json();

      if (retryData.errors && retryData.errors.length > 0) {
        const errorMessages = retryData.errors.map(e => e.message).join(', ');
        throw new Error(`Shopify GraphQL errors: ${errorMessages}`);
      }

      return retryData;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(`Shopify GraphQL API error: ${error.message || response.statusText}`);
    }

    const data: GraphQLResponse<T> = await response.json();

    if (data.errors && data.errors.length > 0) {
      const errorMessages = data.errors.map(e => e.message).join(', ');
      throw new Error(`Shopify GraphQL errors: ${errorMessages}`);
    }

    return data;
  }

  /**
   * Verify webhook signature from Shopify
   * 
   * Validates the HMAC SHA256 signature from the X-Shopify-Hmac-SHA256 header.
   * The signature is calculated using the app's client secret and the raw request body.
   * 
   * @param signature - The HMAC signature from the webhook header (X-Shopify-Hmac-SHA256, base64-encoded)
   * @param payload - The raw webhook payload (as string, must be unparsed raw body)
   * @param shopDomain - The shop domain (to get webhook secret/client secret)
   * @returns True if signature is valid
   */
  async verifyWebhookSignature(
    signature: string,
    payload: string,
    shopDomain: string
  ): Promise<boolean> {
    try {
      const store = await this.getStore(shopDomain, false); // Don't require access token for webhook verification
      
      if (!signature) {
        console.error('❌ Webhook signature is missing');
        return false;
      }

      // Shopify uses HMAC SHA256 with the client secret (app's client secret)
      // The signature in the header is base64-encoded
      const crypto = await import('crypto');
      const hmac = crypto.createHmac('sha256', store.secret);
      hmac.update(payload, 'utf8');
      const calculatedHmacDigest = hmac.digest('base64');

      // Compare signatures using constant-time comparison to prevent timing attacks
      // Both signatures are base64-encoded strings, so we decode them to buffers for comparison
      const isValid = crypto.timingSafeEqual(
        Buffer.from(calculatedHmacDigest, 'base64'),
        Buffer.from(signature, 'base64')
      );

      if (!isValid) {
        console.error('❌ Webhook signature verification failed', {
          shopDomain,
          receivedLength: signature.length,
          expectedLength: calculatedHmacDigest.length,
        });
      }

      return isValid;
    } catch (error: unknown) {
      console.error('❌ Error verifying webhook signature:', error);
      return false;
    }
  }

  /**
   * Get access token using OAuth client credentials flow
   * 
   * @param shopDomain - The shop domain
   * @returns Access token response with token, scope, and expiration
   */
  async getAccessToken(shopDomain: string): Promise<AccessTokenResponse> {
    try {
      // Don't require access token for OAuth token request (Catch-22 problem)
      const store = await this.getStore(shopDomain, false);
      const url = `https://${shopDomain}/admin/oauth/access_token`;

      const formData = new URLSearchParams();
      formData.append('grant_type', 'client_credentials');
      formData.append('client_id', store.clientId);
      formData.append('client_secret', store.secret);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(`Failed to get access token: ${error.message || response.statusText}`);
      }

      const data: AccessTokenResponse = await response.json();

      // Calculate expiration date: current time + expires_in seconds
      const expiresAt = new Date(Date.now() + data.expires_in * 1000);

      // Update store with new token
      await prisma.store.update({
        where: { id: store.id },
        data: {
          accessToken: data.access_token,
          accessTokenExpiresAt: expiresAt,
        },
      });

      console.log('✅ Shopify: Access token obtained', {
        shopDomain,
        expiresIn: data.expires_in,
        scope: data.scope,
      });

      return data;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error getting access token:', error);
      throw new Error(`Failed to get access token: ${errorMessage}`);
    }
  }

  /**
   * Refresh access token if expired
   * Uses the same OAuth client credentials flow as getting a new token
   * 
   * @param shopDomain - The shop domain
   * @returns New access token or null if refresh failed
   */
  async refreshAccessToken(shopDomain: string): Promise<string | null> {
    try {
      const tokenResponse = await this.getAccessToken(shopDomain);
      return tokenResponse.access_token;
    } catch (error: unknown) {
      console.error('❌ Error refreshing access token:', error);
      return null;
    }
  }

  /**
   * Convert fulfillment ID to Shopify GID format
   * Handles both numeric IDs and already-formatted GIDs
   */
  private toShopifyFulfillmentGid(fulfillmentId: string): string {
    // If already in GID format, return as-is
    if (fulfillmentId.startsWith('gid://')) {
      return fulfillmentId;
    }
    // Otherwise, convert numeric ID to GID format
    return `gid://shopify/Fulfillment/${fulfillmentId}`;
  }

  /**
   * Update fulfillment status in Shopify
   * Convenience wrapper around createFulfillmentEvent
   * 
   * @param shopDomain - The shop domain
   * @param clientId - The client ID (not used, kept for backward compatibility)
   * @param secret - The client secret (not used, kept for backward compatibility)
   * @param fulfillmentId - The fulfillment ID (numeric string or GID, will be converted to GID)
   * @param status - The new fulfillment status
   * @returns Created fulfillment event
   */
  async updateFulfillmentStatus(
    shopDomain: string,
    clientId: string,
    secret: string,
    fulfillmentId: string,
    status: FulfillmentEventStatus
  ): Promise<FulfillmentEvent> {
    // Convert fulfillment ID to Shopify GID format
    const fulfillmentGid = this.toShopifyFulfillmentGid(fulfillmentId);
    
    return this.createFulfillmentEvent(
      shopDomain,
      fulfillmentGid,
      status,
      new Date().toISOString()
    );
  }

  /**
   * Create a fulfillment event to update fulfillment status
   * 
   * Primarily used to update the status of a fulfillment (e.g., IN_TRANSIT, DELIVERED, etc.)
   * 
   * @param shopDomain - The shop domain
   * @param fulfillmentId - The fulfillment ID (GID format: gid://shopify/Fulfillment/...)
   * @param status - The new fulfillment status
   * @param happenedAt - The time at which this event happened (ISO 8601 datetime)
   * @param options - Optional additional event data (message, location, etc.)
   * @returns Created fulfillment event
   */
  async createFulfillmentEvent(
    shopDomain: string,
    fulfillmentId: string,
    status: FulfillmentEventStatus,
    happenedAt: string,
    options?: {
      message?: string;
      address1?: string;
      city?: string;
      province?: string;
      country?: string;
      zip?: string;
      latitude?: number;
      longitude?: number;
      estimatedDeliveryAt?: string;
    }
  ): Promise<FulfillmentEvent> {
    try {
      const mutation = `
        mutation fulfillmentEventCreate($fulfillmentEvent: FulfillmentEventInput!) {
          fulfillmentEventCreate(fulfillmentEvent: $fulfillmentEvent) {
            fulfillmentEvent {
              id
              status
              message
              happenedAt
              createdAt
              address1
              city
              province
              country
              zip
              latitude
              longitude
              estimatedDeliveryAt
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        fulfillmentEvent: {
          fulfillmentId,
          status,
          happenedAt,
          ...(options?.message && { message: options.message }),
          ...(options?.address1 && { address1: options.address1 }),
          ...(options?.city && { city: options.city }),
          ...(options?.province && { province: options.province }),
          ...(options?.country && { country: options.country }),
          ...(options?.zip && { zip: options.zip }),
          ...(options?.latitude !== undefined && { latitude: options.latitude }),
          ...(options?.longitude !== undefined && { longitude: options.longitude }),
          ...(options?.estimatedDeliveryAt && { estimatedDeliveryAt: options.estimatedDeliveryAt }),
        },
      };

      const response = await this.makeGraphQLRequest<FulfillmentEventCreateResponse>(
        shopDomain,
        mutation,
        variables
      );

      const result = response.data as FulfillmentEventCreateResponse;
      const { fulfillmentEventCreate } = result;

      // Check for user errors
      if (fulfillmentEventCreate.userErrors && fulfillmentEventCreate.userErrors.length > 0) {
        const errorMessages = fulfillmentEventCreate.userErrors
          .map(e => `${e.field.join('.')}: ${e.message}`)
          .join(', ');
        throw new Error(`Fulfillment event creation failed: ${errorMessages}`);
      }

      if (!fulfillmentEventCreate.fulfillmentEvent) {
        throw new Error('Fulfillment event creation returned no event');
      }

      console.log('✅ Shopify: Fulfillment event created', {
        shopDomain,
        fulfillmentId,
        eventId: fulfillmentEventCreate.fulfillmentEvent.id,
        status: fulfillmentEventCreate.fulfillmentEvent.status,
      });

      return fulfillmentEventCreate.fulfillmentEvent;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error creating fulfillment event:', error);
      throw new Error(`Failed to create fulfillment event: ${errorMessage}`);
    }
  }

  /**
   * Get webhook subscriptions for a shop
   * 
   * @param shopDomain - The shop domain
   * @param params - Query parameters for filtering and pagination
   * @returns Webhook subscriptions with pagination info
   */
  async getWebhookSubscriptions(
    shopDomain: string,
    params: WebhookSubscriptionsQueryParams = {}
  ): Promise<{ subscriptions: WebhookSubscription[]; pageInfo: PageInfo }> {
    try {
      const {
        first = 10,
        after,
        last,
        before,
        topics,
        format,
        query,
        uri,
        sortKey = 'CREATED_AT',
        reverse = false,
      } = params;

      let queryString = 'query webhookSubscriptions(';
      const variables: Record<string, unknown> = {};
      const variableParts: string[] = [];

      if (first) {
        variableParts.push('$first: Int');
        variables.first = first;
      }
      if (after) {
        variableParts.push('$after: String');
        variables.after = after;
      }
      if (last) {
        variableParts.push('$last: Int');
        variables.last = last;
      }
      if (before) {
        variableParts.push('$before: String');
        variables.before = before;
      }
      if (topics && topics.length > 0) {
        variableParts.push('$topics: [WebhookSubscriptionTopic!]');
        variables.topics = topics;
      }
      if (format) {
        variableParts.push('$format: WebhookSubscriptionFormat');
        variables.format = format;
      }
      if (query) {
        variableParts.push('$query: String');
        variables.query = query;
      }
      if (uri) {
        variableParts.push('$uri: String');
        variables.uri = uri;
      }
      if (sortKey) {
        variableParts.push('$sortKey: WebhookSubscriptionSortKeys');
        variables.sortKey = sortKey;
      }
      if (reverse !== undefined) {
        variableParts.push('$reverse: Boolean');
        variables.reverse = reverse;
      }

      queryString += variableParts.join(', ') + ') { ';
      queryString += 'webhookSubscriptions(';
      const args: string[] = [];
      if (first) args.push('first: $first');
      if (after) args.push('after: $after');
      if (last) args.push('last: $last');
      if (before) args.push('before: $before');
      if (topics && topics.length > 0) args.push('topics: $topics');
      if (format) args.push('format: $format');
      if (query) args.push('query: $query');
      if (uri) args.push('uri: $uri');
      if (sortKey) args.push('sortKey: $sortKey');
      if (reverse !== undefined) args.push('reverse: $reverse');
      queryString += args.join(', ') + ') { ';
      queryString += `
        edges {
          node {
            id
            topic
            uri
            filter
            format
            includeFields
            metafieldNamespaces
            metafields {
              key
              namespace
            }
            apiVersion {
              displayName
              handle
              supported
            }
            createdAt
            updatedAt
            legacyResourceId
          }
          cursor
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
      } }`;

      const response = await this.makeGraphQLRequest<WebhookSubscriptionsResponse>(
        shopDomain,
        queryString,
        Object.keys(variables).length > 0 ? variables : undefined
      );

      const result = response.data as WebhookSubscriptionsResponse;
      const subscriptions = result.webhookSubscriptions.edges.map(edge => edge.node);

      console.log('✅ Shopify: Webhook subscriptions retrieved', {
        shopDomain,
        count: subscriptions.length,
      });

      return {
        subscriptions,
        pageInfo: result.webhookSubscriptions.pageInfo,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error getting webhook subscriptions:', error);
      throw new Error(`Failed to get webhook subscriptions: ${errorMessage}`);
    }
  }

  /**
   * Create a webhook subscription
   * 
   * Only supports: ORDERS_CREATE, FULFILLMENTS_CREATE, FULFILLMENTS_UPDATE, REFUNDS_CREATE
   * 
   * @param shopDomain - The shop domain
   * @param topic - The webhook topic (must be one of: ORDERS_CREATE, FULFILLMENTS_CREATE, FULFILLMENTS_UPDATE, REFUNDS_CREATE)
   * @param webhookSubscription - Webhook subscription input
   * @returns Created webhook subscription
   */
  async createWebhookSubscription(
    shopDomain: string,
    topic: WebhookTopic,
    webhookSubscription: WebhookSubscriptionInput
  ): Promise<WebhookSubscription> {
    try {
      // Validate that only supported topics are used
      const supportedTopics = [
        WebhookTopic.ORDERS_CREATE,
        WebhookTopic.FULFILLMENTS_CREATE,
        WebhookTopic.FULFILLMENTS_UPDATE,
        WebhookTopic.REFUNDS_CREATE,
      ];
      
      if (!supportedTopics.includes(topic)) {
        throw new Error(
          `Unsupported webhook topic: ${topic}. Only ${supportedTopics.join(', ')} are supported.`
        );
      }

      const mutation = `
        mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription {
              id
              topic
              uri
              filter
              format
              includeFields
              metafieldNamespaces
              metafields {
                key
                namespace
              }
              apiVersion {
                displayName
                handle
                supported
              }
              createdAt
              updatedAt
              legacyResourceId
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        topic,
        webhookSubscription: {
          uri: webhookSubscription.uri,
          ...(webhookSubscription.filter && { filter: webhookSubscription.filter }),
          ...(webhookSubscription.format && { format: webhookSubscription.format }),
          ...(webhookSubscription.includeFields && { includeFields: webhookSubscription.includeFields }),
          ...(webhookSubscription.metafieldNamespaces && { metafieldNamespaces: webhookSubscription.metafieldNamespaces }),
          ...(webhookSubscription.metafields && { metafields: webhookSubscription.metafields }),
        },
      };

      const response = await this.makeGraphQLRequest<WebhookSubscriptionCreateResponse>(
        shopDomain,
        mutation,
        variables
      );

      const result = response.data as WebhookSubscriptionCreateResponse;
      const { webhookSubscriptionCreate } = result;

      // Check for user errors
      if (webhookSubscriptionCreate.userErrors && webhookSubscriptionCreate.userErrors.length > 0) {
        const errorMessages = webhookSubscriptionCreate.userErrors
          .map(e => `${e.field.join('.')}: ${e.message}`)
          .join(', ');
        throw new Error(`Webhook subscription creation failed: ${errorMessages}`);
      }

      if (!webhookSubscriptionCreate.webhookSubscription) {
        throw new Error('Webhook subscription creation returned no subscription');
      }

      console.log('✅ Shopify: Webhook subscription created', {
        shopDomain,
        subscriptionId: webhookSubscriptionCreate.webhookSubscription.id,
        topic: webhookSubscriptionCreate.webhookSubscription.topic,
        uri: webhookSubscriptionCreate.webhookSubscription.uri,
      });

      return webhookSubscriptionCreate.webhookSubscription;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error creating webhook subscription:', error);
      throw new Error(`Failed to create webhook subscription: ${errorMessage}`);
    }
  }

  /**
   * Update a webhook subscription
   * 
   * @param shopDomain - The shop domain
   * @param id - The webhook subscription ID
   * @param webhookSubscription - Updated webhook subscription input
   * @returns Updated webhook subscription
   */
  async updateWebhookSubscription(
    shopDomain: string,
    id: string,
    webhookSubscription: WebhookSubscriptionInput
  ): Promise<WebhookSubscription> {
    try {
      const mutation = `
        mutation webhookSubscriptionUpdate($id: ID!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionUpdate(id: $id, webhookSubscription: $webhookSubscription) {
            webhookSubscription {
              id
              topic
              uri
              filter
              format
              includeFields
              metafieldNamespaces
              metafields {
                key
                namespace
              }
              apiVersion {
                displayName
                handle
                supported
              }
              createdAt
              updatedAt
              legacyResourceId
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        id,
        webhookSubscription: {
          uri: webhookSubscription.uri,
          ...(webhookSubscription.filter && { filter: webhookSubscription.filter }),
          ...(webhookSubscription.format && { format: webhookSubscription.format }),
          ...(webhookSubscription.includeFields && { includeFields: webhookSubscription.includeFields }),
          ...(webhookSubscription.metafieldNamespaces && { metafieldNamespaces: webhookSubscription.metafieldNamespaces }),
          ...(webhookSubscription.metafields && { metafields: webhookSubscription.metafields }),
        },
      };

      const response = await this.makeGraphQLRequest<WebhookSubscriptionUpdateResponse>(
        shopDomain,
        mutation,
        variables
      );

      const result = response.data as WebhookSubscriptionUpdateResponse;
      const { webhookSubscriptionUpdate } = result;

      // Check for user errors
      if (webhookSubscriptionUpdate.userErrors && webhookSubscriptionUpdate.userErrors.length > 0) {
        const errorMessages = webhookSubscriptionUpdate.userErrors
          .map(e => `${e.field.join('.')}: ${e.message}`)
          .join(', ');
        throw new Error(`Webhook subscription update failed: ${errorMessages}`);
      }

      if (!webhookSubscriptionUpdate.webhookSubscription) {
        throw new Error('Webhook subscription update returned no subscription');
      }

      console.log('✅ Shopify: Webhook subscription updated', {
        shopDomain,
        subscriptionId: webhookSubscriptionUpdate.webhookSubscription.id,
        topic: webhookSubscriptionUpdate.webhookSubscription.topic,
      });

      return webhookSubscriptionUpdate.webhookSubscription;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error updating webhook subscription:', error);
      throw new Error(`Failed to update webhook subscription: ${errorMessage}`);
    }
  }

  /**
   * Delete a webhook subscription
   * 
   * @param shopDomain - The shop domain
   * @param id - The webhook subscription ID
   * @returns Deleted webhook subscription ID
   */
  async deleteWebhookSubscription(
    shopDomain: string,
    id: string
  ): Promise<string> {
    try {
      const mutation = `
        mutation webhookSubscriptionDelete($id: ID!) {
          webhookSubscriptionDelete(id: $id) {
            deletedWebhookSubscriptionId
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = { id };

      const response = await this.makeGraphQLRequest<WebhookSubscriptionDeleteResponse>(
        shopDomain,
        mutation,
        variables
      );

      const result = response.data as WebhookSubscriptionDeleteResponse;
      const { webhookSubscriptionDelete } = result;

      // Check for user errors
      if (webhookSubscriptionDelete.userErrors && webhookSubscriptionDelete.userErrors.length > 0) {
        const errorMessages = webhookSubscriptionDelete.userErrors
          .map(e => `${e.field.join('.')}: ${e.message}`)
          .join(', ');
        throw new Error(`Webhook subscription deletion failed: ${errorMessages}`);
      }

      if (!webhookSubscriptionDelete.deletedWebhookSubscriptionId) {
        throw new Error('Webhook subscription deletion returned no ID');
      }

      console.log('✅ Shopify: Webhook subscription deleted', {
        shopDomain,
        subscriptionId: webhookSubscriptionDelete.deletedWebhookSubscriptionId,
      });

      return webhookSubscriptionDelete.deletedWebhookSubscriptionId;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error deleting webhook subscription:', error);
      throw new Error(`Failed to delete webhook subscription: ${errorMessage}`);
    }
  }

  /**
   * Get base URL for webhook endpoints
   * Uses environment variable or falls back to default
   */
  private getWebhookBaseUrl(): string {
    // Try environment variable first
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.WEBHOOK_BASE_URL;
    
    if (baseUrl) {
      return baseUrl.replace(/\/$/, ''); // Remove trailing slash
    }
    
    // Fallback: construct from request (if available) or use default
    // In production, this should always be set via environment variable
    console.warn('⚠️ Webhook base URL not configured. Using fallback. Set NEXT_PUBLIC_APP_URL or WEBHOOK_BASE_URL environment variable.');
    return 'https://your-domain.com'; // This should be overridden
  }

  /**
   * Get webhook URL for a specific topic
   */
  private getWebhookUrl(topic: WebhookTopic): string {
    const baseUrl = this.getWebhookBaseUrl();
    
    const urlMap: Record<WebhookTopic, string> = {
      [WebhookTopic.ORDERS_CREATE]: `${baseUrl}/api/webhooks/orders/create`,
      [WebhookTopic.FULFILLMENTS_CREATE]: `${baseUrl}/api/webhooks/fulfillments/create`,
      [WebhookTopic.FULFILLMENTS_UPDATE]: `${baseUrl}/api/webhooks/fulfillments/update`,
      [WebhookTopic.REFUNDS_CREATE]: `${baseUrl}/api/webhooks/refunds/create`,
    };
    
    return urlMap[topic];
  }

  /**
   * Check if a webhook subscription already exists for a topic and URI
   * 
   * @param shopDomain - The shop domain
   * @param topic - The webhook topic
   * @param uri - The webhook URI to check
   * @returns Existing webhook subscription or null
   */
  private async checkWebhookExists(
    shopDomain: string,
    topic: WebhookTopic,
    uri: string
  ): Promise<WebhookSubscription | null> {
    try {
      const { subscriptions } = await this.getWebhookSubscriptions(shopDomain, {
        topics: [topic],
        uri,
        first: 10,
      });

      // Find exact match by topic and URI
      const existing = subscriptions.find(
        (sub) => sub.topic === topic && sub.uri === uri
      );

      return existing || null;
    } catch (error) {
      console.error(`❌ Error checking webhook existence for ${shopDomain}:`, error);
      return null;
    }
  }

  /**
   * Ensure webhook subscription exists for a specific topic
   * Creates if not exists, updates if URI changed
   * 
   * @param shopDomain - The shop domain
   * @param topic - The webhook topic
   * @returns Created or updated webhook subscription
   */
  private async ensureWebhookSubscription(
    shopDomain: string,
    topic: WebhookTopic
  ): Promise<WebhookSubscription | null> {
    const startTime = Date.now();
    const uri = this.getWebhookUrl(topic);

    try {
      console.log('🔍 Checking webhook subscription', {
        shopDomain,
        topic,
        uri,
      });

      // Check if webhook already exists
      const existing = await this.checkWebhookExists(shopDomain, topic, uri);
      
      if (existing) {
        // Webhook exists with correct URI - nothing to do
        const duration = Date.now() - startTime;
        console.log('✅ Webhook already exists (no action needed)', {
          shopDomain,
          topic,
          webhookId: existing.id,
          uri: existing.uri,
          duration: `${duration}ms`,
        });
        return existing;
      }

      // Check if webhook exists with different URI
      console.log('🔍 Checking for webhook with different URI', {
        shopDomain,
        topic,
        expectedUri: uri,
      });
      const { subscriptions } = await this.getWebhookSubscriptions(shopDomain, {
        topics: [topic],
        first: 10,
      });

      const existingWithDifferentUri = subscriptions.find(
        (sub) => sub.topic === topic && sub.uri !== uri
      );

      if (existingWithDifferentUri) {
        // Update existing webhook with new URI
        console.log('🔄 Updating webhook subscription (URI changed)', {
          shopDomain,
          topic,
          webhookId: existingWithDifferentUri.id,
          oldUri: existingWithDifferentUri.uri,
          newUri: uri,
        });
        const updated = await this.updateWebhookSubscription(
          shopDomain,
          existingWithDifferentUri.id,
          {
            uri,
            format: 'JSON',
          }
        );
        const duration = Date.now() - startTime;
        console.log('✅ Webhook subscription updated successfully', {
          shopDomain,
          topic,
          webhookId: updated.id,
          uri: updated.uri,
          duration: `${duration}ms`,
        });
        return updated;
      }

      // Create new webhook subscription
      console.log('➕ Creating new webhook subscription', {
        shopDomain,
        topic,
        uri,
      });
      const created = await this.createWebhookSubscription(shopDomain, topic, {
        uri,
        format: 'JSON',
      });
      const duration = Date.now() - startTime;
      console.log('✅ Webhook subscription created successfully', {
        shopDomain,
        topic,
        webhookId: created.id,
        uri: created.uri,
        duration: `${duration}ms`,
      });
      return created;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const duration = Date.now() - startTime;
      console.error('❌ Error ensuring webhook subscription', {
        shopDomain,
        topic,
        uri,
        error: errorMessage,
        duration: `${duration}ms`,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return null;
    }
  }

  /**
   * Ensure all required webhooks exist for a store
   * Only creates webhooks if store is active and has access token
   * 
   * @param shopDomain - The shop domain
   * @returns Array of created/updated webhook subscriptions (or null if failed)
   */
  async ensureWebhooksForStore(shopDomain: string): Promise<Array<WebhookSubscription | null>> {
    const startTime = Date.now();
    console.log('🔗 Starting webhook setup for store', { shopDomain });

    try {
      const store = await this.getStore(shopDomain, false);
      console.log('📋 Store details retrieved', {
        shopDomain,
        storeId: store.id,
        status: store.status,
        hasSecret: !!store.secret,
      });

      // Only create webhooks for active stores
      if (store.status !== 'Active') {
        console.log('ℹ️ Skipping webhook setup: Store is not active', {
          shopDomain,
          storeId: store.id,
          status: store.status,
        });
        return [];
      }

      // Ensure access token is available (will be fetched automatically by makeGraphQLRequest)
      // But we check here to avoid unnecessary API calls if token is definitely not available
      if (!store.secret || store.secret.trim() === '') {
        console.warn('⚠️ Cannot ensure webhooks: Store has no secret', {
          shopDomain,
          storeId: store.id,
        });
        return [];
      }

      // Ensure valid access token (non-blocking check)
      console.log('🔑 Verifying access token availability', { shopDomain });
      try {
        await this.ensureValidAccessToken(shopDomain);
        console.log('✅ Access token verified', { shopDomain });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn('⚠️ Cannot ensure webhooks: Access token not available', {
          shopDomain,
          storeId: store.id,
          error: errorMessage,
        });
        return [];
      }

      // Create/update all required webhooks
      const topics = [
        WebhookTopic.ORDERS_CREATE,
        WebhookTopic.FULFILLMENTS_CREATE,
        WebhookTopic.FULFILLMENTS_UPDATE,
        WebhookTopic.REFUNDS_CREATE,
      ];

      console.log('📝 Setting up webhooks', {
        shopDomain,
        storeId: store.id,
        topics: topics.map((t) => t),
        count: topics.length,
      });

      const results = await Promise.all(
        topics.map((topic) => this.ensureWebhookSubscription(shopDomain, topic))
      );

      const successCount = results.filter((r) => r !== null).length;
      const failedCount = results.length - successCount;
      const duration = Date.now() - startTime;

      console.log('✅ Webhook setup completed', {
        shopDomain,
        storeId: store.id,
        successCount,
        failedCount,
        total: topics.length,
        duration: `${duration}ms`,
        results: results.map((r, idx) => ({
          topic: topics[idx],
          success: r !== null,
          webhookId: r?.id || null,
          uri: r?.uri || null,
        })),
      });

      if (failedCount > 0) {
        console.warn('⚠️ Some webhooks failed to setup', {
          shopDomain,
          storeId: store.id,
          failedCount,
          failedTopics: topics.filter((_, idx) => results[idx] === null),
        });
      }

      return results;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const duration = Date.now() - startTime;
      console.error('❌ Error ensuring webhooks for store', {
        shopDomain,
        error: errorMessage,
        duration: `${duration}ms`,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return [];
    }
  }

  /**
   * Remove all webhooks for a store
   * Finds webhooks by matching URI pattern
   * 
   * @param shopDomain - The shop domain
   * @returns Number of webhooks deleted
   */
  async removeWebhooksForStore(shopDomain: string): Promise<number> {
    const startTime = Date.now();
    console.log('🗑️ Starting webhook removal for store', { shopDomain });

    try {
      const baseUrl = this.getWebhookBaseUrl();
      const webhookUris = [
        `${baseUrl}/api/webhooks/orders/create`,
        `${baseUrl}/api/webhooks/fulfillments/create`,
        `${baseUrl}/api/webhooks/fulfillments/update`,
        `${baseUrl}/api/webhooks/refunds/create`,
      ];

      console.log('🔍 Fetching existing webhooks', {
        shopDomain,
        expectedUris: webhookUris,
      });

      // Get all webhooks for this store
      const { subscriptions } = await this.getWebhookSubscriptions(shopDomain, {
        first: 50, // Should be enough for our 3 webhooks
      });

      console.log('📋 Found webhooks', {
        shopDomain,
        totalWebhooks: subscriptions.length,
        webhooks: subscriptions.map((s) => ({
          id: s.id,
          topic: s.topic,
          uri: s.uri,
        })),
      });

      // Find webhooks that match our URIs
      const webhooksToDelete = subscriptions.filter((sub) =>
        webhookUris.some((uri) => sub.uri === uri)
      );

      if (webhooksToDelete.length === 0) {
        const duration = Date.now() - startTime;
        console.log('ℹ️ No webhooks found to delete', {
          shopDomain,
          duration: `${duration}ms`,
        });
        return 0;
      }

      console.log('🗑️ Deleting webhooks', {
        shopDomain,
        count: webhooksToDelete.length,
        webhooks: webhooksToDelete.map((w) => ({
          id: w.id,
          topic: w.topic,
          uri: w.uri,
        })),
      });

      // Delete all matching webhooks
      const deletePromises = webhooksToDelete.map((webhook) =>
        this.deleteWebhookSubscription(shopDomain, webhook.id).catch((error) => {
          console.error('❌ Error deleting webhook', {
            shopDomain,
            webhookId: webhook.id,
            topic: webhook.topic,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          return null;
        })
      );

      const results = await Promise.all(deletePromises);
      const successCount = results.filter((r) => r !== null).length;
      const failedCount = results.length - successCount;
      const duration = Date.now() - startTime;

      console.log('✅ Webhook removal completed', {
        shopDomain,
        successCount,
        failedCount,
        total: webhooksToDelete.length,
        duration: `${duration}ms`,
      });

      if (failedCount > 0) {
        console.warn('⚠️ Some webhooks failed to delete', {
          shopDomain,
          failedCount,
          failedWebhooks: webhooksToDelete.filter((_, idx) => results[idx] === null).map((w) => ({
            id: w.id,
            topic: w.topic,
          })),
        });
      }

      return successCount;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const duration = Date.now() - startTime;
      console.error('❌ Error removing webhooks for store', {
        shopDomain,
        error: errorMessage,
        duration: `${duration}ms`,
        stack: error instanceof Error ? error.stack : undefined,
      });
      return 0;
    }
  }
}

// Export singleton instance
export const shopifyService = new ShopifyService();

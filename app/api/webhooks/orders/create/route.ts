import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createErrorResponse } from '@/lib/auth-helpers';
import { shopifyService } from '@/lib/services/shopify';

/**
 * Webhook endpoint for order creation events
 * POST /api/webhooks/orders/create
 * 
 * This endpoint receives webhook notifications when a new order is created.
 * Validates webhook signature before processing.
 * 
 * Requirements:
 * - Must respond with 200 OK within 5 seconds
 * - Validates HMAC SHA256 signature from X-Shopify-Hmac-SHA256 header
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body for HMAC signature verification (must be unparsed)
    const rawBody = await request.text();
    
    // Extract HMAC signature from header
    const signature = request.headers.get('x-shopify-hmac-sha256');
    if (!signature) {
      console.warn('⚠️ Webhook missing signature header');
      return createErrorResponse('Missing signature header', 401);
    }

    // Parse body to extract shop domain
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return createErrorResponse('Invalid JSON payload', 400);
    }

    // Extract shop domain from payload or header
    // Shopify webhooks typically include 'shop' or 'shop_domain' in the payload
    // Also check X-Shopify-Shop-Domain header as fallback
    const shopDomain = 
      (typeof body === 'object' && body !== null && 'shop_domain' in body && typeof body.shop_domain === 'string' ? body.shop_domain : null) ||
      (typeof body === 'object' && body !== null && 'shop' in body && typeof body.shop === 'string' ? body.shop : null) ||
      request.headers.get('x-shopify-shop-domain') ||
      null;

    if (!shopDomain) {
      console.warn('⚠️ Webhook missing shop domain');
      return createErrorResponse('Missing shop domain', 400);
    }

    // Verify webhook signature
    const isValid = await shopifyService.verifyWebhookSignature(
      signature,
      rawBody,
      shopDomain
    );

    if (!isValid) {
      console.warn('⚠️ Invalid webhook signature', { shopDomain });
      return createErrorResponse('Invalid webhook signature', 401);
    }
    
    // Validate webhook payload structure
    if (
      typeof body !== 'object' ||
      body === null ||
      !('id' in body) ||
      !('name' in body)
    ) {
      return createErrorResponse('Invalid webhook payload: missing required fields (id, name)', 400);
    }

    // Extract order data from webhook payload
    // Shopify order ID is numeric: 820982911946154508 (as shown in sample payload)
    const orderIdRaw = body.id;
    const orderName = typeof body.name === 'string' ? body.name : null;

    if (orderIdRaw === null || orderIdRaw === undefined || !orderName) {
      return createErrorResponse('Invalid webhook payload: order id or name is missing or invalid', 400);
    }

    // Convert numeric ID to string
    // Shopify webhooks send order ID as a number
    let orderId: string;
    if (typeof orderIdRaw === 'number') {
      orderId = String(orderIdRaw);
    } else {
      return createErrorResponse('Invalid webhook payload: order id must be a number', 400);
    }

    // Find store based on shop domain
    const store = await prisma.store.findUnique({
      where: { shopDomain },
    });

    if (!store) {
      console.warn('⚠️ Store not found for shop domain', { shopDomain });
      return createErrorResponse('Store not found', 404);
    }

    // Create order in database (idempotent: return 200 OK even if already exists)
    try {
      await prisma.order.create({
        data: {
          orderId: orderId,
          name: orderName,
          shopId: store.id,
        },
      });

      console.log('✅ Order create webhook processed:', {
        orderId: orderId,
        orderName: orderName,
        shopDomain,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      // If order already exists (P2002 = unique constraint violation), just ignore it
      // Shopify should always get 200 OK for idempotency
      if (error instanceof Error && 'code' in error && error.code === 'P2002') {
        console.log('ℹ️ Order already exists, skipping creation', {
          orderId: orderId,
          orderName: orderName,
        });
      } else {
        throw error;
      }
    }

    // Return success response (must be within 5 seconds)
    // Always return 200 OK for idempotency, even if order already existed
    return NextResponse.json(
      { 
        success: true,
        message: 'Order create webhook processed successfully',
        orderId: orderId,
        orderName: orderName,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('❌ Error processing order create webhook:', error);
    
    // Handle specific error types
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      return createErrorResponse('Order already exists', 409);
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse(
      `Failed to process order create webhook: ${errorMessage}`,
      500
    );
  }
}

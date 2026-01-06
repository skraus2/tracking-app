import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  requireAdmin,
  createErrorResponse,
  createUnauthorizedResponse,
} from '@/lib/auth-helpers';
import { Track17MainStatus, Track17SubStatus, ShopifyStatus } from '@prisma/client';

function maskApiKey(apiKey: string | null | undefined): string | null {
  if (!apiKey) return null;
  if (apiKey.length <= 6) return '••••••';
  return `${apiKey.slice(0, 3)}••••••${apiKey.slice(-3)}`;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    // Get system config (API key)
    const systemConfig = await prisma.systemConfig.findUnique({
      where: { key: 'track17_api_key' },
    });

    // Get all status mappings
    const statusMappings = await prisma.statusMapping.findMany({
      orderBy: [
        { track17Status: 'asc' },
        { track17SubStatus: 'asc' },
      ],
    });

    // Transform status mappings to frontend format
    const mappingsRecord: Record<string, string> = {};
    statusMappings.forEach((mapping) => {
      const key = mapping.track17SubStatus || mapping.track17Status;
      mappingsRecord[key] = mapping.shopifyStatus;
    });

    return NextResponse.json({
      track17ApiKey: systemConfig?.track17ApiKey
        ? {
            masked: maskApiKey(systemConfig.track17ApiKey),
            lastUpdated: systemConfig.updatedAt.toISOString(),
          }
        : null,
      statusMappings: mappingsRecord,
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message === 'Access denied') {
      return createUnauthorizedResponse();
    }
    console.error('Error fetching settings:', error);
    return createErrorResponse(error.message || 'Failed to fetch settings', 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json();
    const { track17ApiKey, statusMappings } = body;

    // Update API key if provided
    if (track17ApiKey !== undefined) {
      if (track17ApiKey === null || track17ApiKey === '') {
        // Delete the API key
        await prisma.systemConfig.deleteMany({
          where: { key: 'track17_api_key' },
        });
      } else {
        // Validate API key format (basic check - at least 7 characters)
        if (typeof track17ApiKey !== 'string' || track17ApiKey.length < 7) {
          return createErrorResponse('API key must be at least 7 characters long');
        }

        // Upsert API key
        await prisma.systemConfig.upsert({
          where: { key: 'track17_api_key' },
          update: { track17ApiKey },
          create: {
            key: 'track17_api_key',
            track17ApiKey,
          },
        });
      }
    }

    // Update status mappings if provided
    if (statusMappings && typeof statusMappings === 'object') {
      // Get all current mappings
      const currentMappings = await prisma.statusMapping.findMany();

      // Process each mapping
      for (const [subStatusKey, shopifyStatus] of Object.entries(statusMappings)) {
        if (typeof shopifyStatus !== 'string') continue;

        // Validate Shopify status
        if (!Object.values(ShopifyStatus).includes(shopifyStatus as ShopifyStatus)) {
          return createErrorResponse(`Invalid Shopify status: ${shopifyStatus}`);
        }

        // Find the main status and sub status
        // subStatusKey can be either a subStatus or mainStatus
        let mainStatus: Track17MainStatus | null = null;
        let subStatus: Track17SubStatus | null = null;

        // Try to find as sub status first
        const subStatusEnum = Object.values(Track17SubStatus).find(
          (s) => s === subStatusKey
        ) as Track17SubStatus | undefined;

        if (subStatusEnum) {
          subStatus = subStatusEnum;
          // Find corresponding main status
          const mainStatusFromSub = Object.values(Track17MainStatus).find((ms) => {
            return subStatusKey.startsWith(ms);
          });
          if (mainStatusFromSub) {
            mainStatus = mainStatusFromSub;
          }
        } else {
          // Try as main status
          const mainStatusEnum = Object.values(Track17MainStatus).find(
            (s) => s === subStatusKey
          ) as Track17MainStatus | undefined;
          if (mainStatusEnum) {
            mainStatus = mainStatusEnum;
          }
        }

        if (!mainStatus) {
          continue; // Skip invalid keys
        }

        // Check if mapping already exists
        const existingMapping = await prisma.statusMapping.findFirst({
          where: {
            track17Status: mainStatus,
            track17SubStatus: subStatus,
          },
        });

        if (existingMapping) {
          // Update existing mapping
          await prisma.statusMapping.update({
            where: { id: existingMapping.id },
            data: {
              shopifyStatus: shopifyStatus as ShopifyStatus,
            },
          });
        } else {
          // Create new mapping
          await prisma.statusMapping.create({
            data: {
              track17Status: mainStatus,
              track17SubStatus: subStatus,
              shopifyStatus: shopifyStatus as ShopifyStatus,
            },
          });
        }
      }
    }

    // Return updated settings
    const systemConfig = await prisma.systemConfig.findUnique({
      where: { key: 'track17_api_key' },
    });

    const statusMappingsUpdated = await prisma.statusMapping.findMany({
      orderBy: [
        { track17Status: 'asc' },
        { track17SubStatus: 'asc' },
      ],
    });

    const mappingsRecord: Record<string, string> = {};
    statusMappingsUpdated.forEach((mapping) => {
      const key = mapping.track17SubStatus || mapping.track17Status;
      mappingsRecord[key] = mapping.shopifyStatus;
    });

    return NextResponse.json({
      track17ApiKey: systemConfig?.track17ApiKey
        ? {
            masked: maskApiKey(systemConfig.track17ApiKey),
            lastUpdated: systemConfig.updatedAt.toISOString(),
          }
        : null,
      statusMappings: mappingsRecord,
    });
  } catch (error: any) {
    if (error.message === 'Unauthorized' || error.message === 'Access denied') {
      return createUnauthorizedResponse();
    }
    if (error.message === 'Admin access required') {
      return createErrorResponse('Admin access required', 403);
    }
    console.error('Error updating settings:', error);
    
    // Handle Prisma unique constraint errors
    if (error.code === 'P2002') {
      return createErrorResponse('Status mapping conflict', 409);
    }

    return createErrorResponse(error.message || 'Failed to update settings', 500);
  }
}

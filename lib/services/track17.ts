import { prisma } from '@/lib/prisma';
import { Track17MainStatus, Track17SubStatus } from '@prisma/client';

/**
 * 17Track API Service
 * 
 * This service handles all interactions with the 17Track API for tracking packages.
 * Business logic will be implemented here.
 * 
 * Note: TypeScript/JavaScript identifiers cannot start with numbers, so we use "Track17" 
 * as the prefix instead of "17Track" to match the brand name "17Track".
 */

export interface Track17TrackingEvent {
  timestamp: string;
  location?: string;
  status: string;
  subStatus?: string;
  description?: string;
}

export interface Track17TrackingResponse {
  trackingNumber: string;
  carrier?: string;
  status: Track17MainStatus;
  subStatus?: Track17SubStatus;
  events: Track17TrackingEvent[];
  origin?: string;
  destination?: string;
  estimatedDelivery?: string;
}

export interface Track17ApiError {
  code: number;
  message: string;
}

export interface Track17RegisterRequest {
  number: string;
  carrier?: number;
  lang?: string;
  translation_mode?: 'Denied' | 'UseDefaultLang' | 'UseThirdPartyServices';
  email?: string;
  order_no?: string;
  order_time?: string;
  final_carrier?: number;
  auto_detection?: boolean;
  origin_country?: string;
  ship_date?: string;
  destination_postal_code?: string;
  destination_country?: string;
  destination_city?: string;
  shipper?: string;
  consignee?: string;
  phone_number_last_4?: string;
  phone_number?: string;
  cpf_or_cnpj?: string;
  special_tracking_info?: {
    number_type?: string;
    parameter?: string;
  };
  tag?: string;
  remark?: string;
}

export interface Track17RegisterResponse {
  code: number;
  data: {
    accepted?: Array<{
      origin: number;
      number: string;
      carrier: number;
      email: string | null;
      lang: string | null;
      tag?: string;
    }>;
    rejected?: Array<{
      number: string;
      carrier: number;
      error: {
        code: number;
        message: string;
      };
    }>;
    errors?: Array<{
      code: number;
      message: string;
    }>;
  };
}

export interface Track17GetTrackingInfoRequest {
  number: string;
  carrier?: number;
}

export interface Track17StopTrackRequest {
  number: string;
  carrier?: number;
}

export interface Track17RetrackRequest {
  number: string;
  carrier?: number;
}

export interface Track17StopTrackResponse {
  code: number;
  data: {
    accepted?: Array<{
      number: string;
      carrier: number;
    }>;
    rejected?: Array<{
      number: string;
      carrier: number;
      error: {
        code: number;
        message: string;
      };
    }>;
  };
}

export interface Track17RetrackResponse {
  code: number;
  data: {
    accepted?: Array<{
      number: string;
      carrier: number;
    }>;
    rejected?: Array<{
      number: string;
      carrier: number;
      error: {
        code: number;
        message: string;
      };
    }>;
  };
}

export type Track17AcceptedTrackingInfo = NonNullable<Track17GetTrackingInfoResponse['data']['accepted']>[0];

export interface Track17GetTrackingInfoResponse {
  code: number;
  data: {
    accepted?: Array<{
      number: string;
      carrier: number;
      param?: string | null;
      tag?: string | null;
      lang?: string | null;
      destination_postal_code?: string | null;
      origin_country?: string | null;
      destination_country?: string | null;
      destination_city?: string | null;
      ship_date?: string | null;
      shipper?: string | null;
      consignee?: string | null;
      phone_number_last_4?: string | null;
      phone_number?: string | null;
      cpf_or_cnpj?: string | null;
      special_tracking_info?: {
        number_type?: string;
        parameter?: string;
      } | null;
      track_info?: {
        shipping_info?: {
          shipper_address?: {
            country?: string;
            state?: string;
            city?: string;
            street?: string;
            postal_code?: string;
            coordinates?: {
              longitude?: string;
              latitude?: string;
            };
          };
          recipient_address?: {
            country?: string;
            state?: string;
            city?: string;
            street?: string;
            postal_code?: string;
            coordinates?: {
              longitude?: string;
              latitude?: string;
            };
          };
        };
        latest_status?: {
          status: string;
          sub_status: string;
          sub_status_descr?: string | null;
        };
        latest_event?: {
          time_iso?: string | null;
          time_utc?: string | null;
          time_raw?: {
            date?: string | null;
            time?: string | null;
            timezone?: string | null;
          };
          description?: string;
          description_translation?: {
            lang?: string;
            description?: string;
          };
          location?: string;
          stage?: string;
          sub_status?: string;
          address?: {
            country?: string;
            state?: string;
            city?: string;
            street?: string;
            postal_code?: string;
            coordinates?: {
              longitude?: string;
              latitude?: string;
            };
          };
        };
        time_metrics?: {
          days_after_order?: number;
          days_of_transit?: number;
          days_of_transit_done?: number;
          days_after_last_update?: number;
          estimated_delivery_date?: {
            source?: string;
            from?: string | null;
            to?: string | null;
          } | null;
        };
        milestone?: Array<{
          key_stage: string;
          time_iso?: string | null;
          time_utc?: string | null;
          time_raw?: {
            date?: string | null;
            time?: string | null;
            timezone?: string | null;
          };
        }>;
        misc_info?: {
          risk_factor?: number;
          service_type?: string;
          weight_raw?: string;
          weight_kg?: string;
          pieces?: string;
          dimensions?: string;
          customer_number?: string;
          reference_number?: string | null;
          local_number?: string;
          local_provider?: string;
          local_key?: number;
        };
        tracking?: {
          providers_hash?: number;
          providers?: Array<{
            provider?: {
              key?: number;
              name?: string;
              alias?: string;
              tel?: string | null;
              homepage?: string | null;
              country?: string;
            };
            service_type?: string;
            latest_sync_status?: string;
            latest_sync_time?: string;
            provider_lang?: string | null;
            provider_tips?: string | null;
            events_hash?: number;
            events?: Array<{
              time_iso?: string | null;
              time_utc?: string | null;
              time_raw?: {
                date?: string | null;
                time?: string | null;
                timezone?: string | null;
              };
              description?: string;
              description_translation?: {
                lang?: string;
                description?: string;
              };
              location?: string;
              stage?: string;
              sub_status?: string;
              address?: {
                country?: string;
                state?: string;
                city?: string;
                street?: string;
                postal_code?: string;
                coordinates?: {
                  longitude?: string;
                  latitude?: string;
                };
              };
            }>;
          }>;
        };
      };
    }>;
    rejected?: Array<{
      number: string;
      carrier: number;
      error: {
        code: number;
        message: string;
      };
    }>;
  };
}

/**
 * Get API key from system config
 */
async function getApiKey(): Promise<string | null> {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'track17_api_key' },
    });
    return config?.track17ApiKey || null;
  } catch (error) {
    console.error('Error fetching 17Track API key:', error);
    return null;
  }
}

/**
 * 17Track API Client Class
 */
export class Track17Service {
  private apiKey: string | null = null;
  private baseUrl = 'https://api.17track.net/track/v2.4';

  constructor() {
    // API key will be loaded on first use
  }

  /**
   * Initialize the service by loading the API key
   */
  private async initialize(): Promise<void> {
    if (!this.apiKey) {
      this.apiKey = await getApiKey();
      if (!this.apiKey) {
        throw new Error('17Track API key not configured');
      }
    }
  }

  /**
   * Register a tracking number with 17Track
   * 
   * @param request - Registration request parameters
   * @returns Registration response with accepted/rejected tracking numbers
   */
  async registerTracking(
    request: Track17RegisterRequest | Track17RegisterRequest[]
  ): Promise<Track17RegisterResponse> {
    try {
      await this.initialize();

      const requests = Array.isArray(request) ? request : [request];
      
      // 17Track allows max 40 numbers per request
      if (requests.length > 40) {
        throw new Error('Maximum 40 tracking numbers allowed per request');
      }

      const response = await fetch(`${this.baseUrl}/register`, {
        method: 'POST',
        headers: {
          '17token': this.apiKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requests),
      });

      const data: Track17RegisterResponse = await response.json();

      // Handle HTTP errors
      if (response.status === 401) {
        throw new Error('Unauthorized: Invalid API key or IP not whitelisted');
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded: Too many requests');
      }
      if (response.status === 500) {
        throw new Error('17Track server error');
      }
      if (response.status === 503) {
        throw new Error('17Track service temporarily unavailable');
      }
      if (!response.ok) {
        throw new Error(`17Track API error: ${response.status} ${response.statusText}`);
      }

      // Check for API-level errors in response
      if (data.code !== 0 && data.data?.errors) {
        const errorMessages = data.data.errors
          .map((e) => e.message)
          .join(', ');
        throw new Error(`17Track API error: ${errorMessages}`);
      }

      return data;
    } catch (error: unknown) {
      console.error('❌ Error registering tracking with 17Track:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to register tracking: ${errorMessage}`);
    }
  }

  /**
   * Get tracking details from 17Track
   * 
   * @param request - Get tracking info request parameters (number and optional carrier)
   * @returns Tracking info response with accepted/rejected tracking numbers
   */
  async getTrackingInfo(
    request: Track17GetTrackingInfoRequest | Track17GetTrackingInfoRequest[]
  ): Promise<Track17GetTrackingInfoResponse> {
    try {
      await this.initialize();

      const requests = Array.isArray(request) ? request : [request];
      
      // 17Track allows max 40 numbers per request
      if (requests.length > 40) {
        throw new Error('Maximum 40 tracking numbers allowed per request');
      }

      const response = await fetch(`${this.baseUrl}/gettrackinfo`, {
        method: 'POST',
        headers: {
          '17token': this.apiKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requests),
      });

      const data: Track17GetTrackingInfoResponse = await response.json();

      // Handle HTTP errors
      if (response.status === 401) {
        throw new Error('Unauthorized: Invalid API key or IP not whitelisted');
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded: Too many requests');
      }
      if (response.status === 500) {
        throw new Error('17Track server error');
      }
      if (response.status === 503) {
        throw new Error('17Track service temporarily unavailable');
      }
      if (!response.ok) {
        throw new Error(`17Track API error: ${response.status} ${response.statusText}`);
      }

      // Check for API-level errors in response
      if (data.code !== 0) {
        const errorMessages = data.data?.rejected
          ?.map((r) => r.error.message)
          .join(', ') || 'Unknown error';
        throw new Error(`17Track API error: ${errorMessages}`);
      }

      return data;
    } catch (error: unknown) {
      console.error('❌ Error getting tracking info from 17Track:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get tracking info: ${errorMessage}`);
    }
  }

  /**
   * Stop tracking a tracking number with 17Track
   * 
   * @param request - Stop tracking request parameters (number and optional carrier)
   * @returns Stop tracking response with accepted/rejected tracking numbers
   */
  async stopTracking(
    request: Track17StopTrackRequest | Track17StopTrackRequest[]
  ): Promise<Track17StopTrackResponse> {
    try {
      await this.initialize();

      const requests = Array.isArray(request) ? request : [request];
      
      // 17Track allows max 40 numbers per request
      if (requests.length > 40) {
        throw new Error('Maximum 40 tracking numbers allowed per request');
      }

      const response = await fetch(`${this.baseUrl}/stoptrack`, {
        method: 'POST',
        headers: {
          '17token': this.apiKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requests),
      });

      const data: Track17StopTrackResponse = await response.json();

      // Handle HTTP errors
      if (response.status === 401) {
        throw new Error('Unauthorized: Invalid API key or IP not whitelisted');
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded: Too many requests');
      }
      if (response.status === 500) {
        throw new Error('17Track server error');
      }
      if (response.status === 503) {
        throw new Error('17Track service temporarily unavailable');
      }
      if (!response.ok) {
        throw new Error(`17Track API error: ${response.status} ${response.statusText}`);
      }

      // Check for API-level errors in response
      if (data.code !== 0) {
        const errorMessages = data.data?.rejected
          ?.map((r) => r.error.message)
          .join(', ') || 'Unknown error';
        throw new Error(`17Track API error: ${errorMessages}`);
      }

      return data;
    } catch (error: unknown) {
      console.error('❌ Error stopping tracking with 17Track:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to stop tracking: ${errorMessage}`);
    }
  }

  /**
   * Retrack a stopped tracking number with 17Track
   * 
   * @param request - Retrack request parameters (number and optional carrier)
   * @returns Retrack response with accepted/rejected tracking numbers
   */
  async retrack(
    request: Track17RetrackRequest | Track17RetrackRequest[]
  ): Promise<Track17RetrackResponse> {
    try {
      await this.initialize();

      const requests = Array.isArray(request) ? request : [request];
      
      // 17Track allows max 40 numbers per request
      if (requests.length > 40) {
        throw new Error('Maximum 40 tracking numbers allowed per request');
      }

      const response = await fetch(`${this.baseUrl}/retrack`, {
        method: 'POST',
        headers: {
          '17token': this.apiKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requests),
      });

      const data: Track17RetrackResponse = await response.json();

      // Handle HTTP errors
      if (response.status === 401) {
        throw new Error('Unauthorized: Invalid API key or IP not whitelisted');
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded: Too many requests');
      }
      if (response.status === 500) {
        throw new Error('17Track server error');
      }
      if (response.status === 503) {
        throw new Error('17Track service temporarily unavailable');
      }
      if (!response.ok) {
        throw new Error(`17Track API error: ${response.status} ${response.statusText}`);
      }

      // Check for API-level errors in response
      if (data.code !== 0) {
        const errorMessages = data.data?.rejected
          ?.map((r) => r.error.message)
          .join(', ') || 'Unknown error';
        throw new Error(`17Track API error: ${errorMessages}`);
      }

      return data;
    } catch (error: unknown) {
      console.error('❌ Error retracking with 17Track:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to retrack: ${errorMessage}`);
    }
  }

  /**
   * Map 17Track API response (from getTrackingInfo) to internal format
   * 
   * @param acceptedItem - Accepted item from getTrackingInfo response
   * @returns Mapped tracking response
   */
  mapResponseToTracking(acceptedItem: Track17AcceptedTrackingInfo): Track17TrackingResponse | null {
    if (!acceptedItem.track_info) {
      return null;
    }

    const trackInfo = acceptedItem.track_info;
    const latestStatus = trackInfo.latest_status;
    
    if (!latestStatus) {
      return null;
    }

    // Map status (17Track uses PascalCase format in both API responses and webhooks)
    let status: Track17MainStatus;
    try {
      status = this.mapStatus(latestStatus.status);
    } catch {
      console.warn(`⚠️ Failed to map status "${latestStatus.status}", using NotFound`);
      status = Track17MainStatus.NotFound;
    }

    // Map sub-status (always call mapSubStatus to get proper default if sub_status is missing)
    const subStatus = this.mapSubStatus(
      latestStatus.sub_status || '',
      status
    );

    // Extract events from all providers
    const events: Track17TrackingEvent[] = [];
    if (trackInfo.tracking?.providers) {
      for (const provider of trackInfo.tracking.providers) {
        if (provider.events) {
          for (const event of provider.events) {
            events.push({
              timestamp: event.time_utc || event.time_iso || new Date().toISOString(),
              location: event.location || undefined,
              status: event.stage || '',
              subStatus: event.sub_status || undefined,
              description: event.description || undefined,
            });
          }
        }
      }
    }

    // Sort events by timestamp (newest first)
    events.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    });

    // Extract origin and destination from shipping_info
    const origin = trackInfo.shipping_info?.shipper_address
      ? [
          trackInfo.shipping_info.shipper_address.city,
          trackInfo.shipping_info.shipper_address.state,
          trackInfo.shipping_info.shipper_address.country,
        ]
          .filter(Boolean)
          .join(', ')
      : undefined;

    const destination = trackInfo.shipping_info?.recipient_address
      ? [
          trackInfo.shipping_info.recipient_address.city,
          trackInfo.shipping_info.recipient_address.state,
          trackInfo.shipping_info.recipient_address.country,
        ]
          .filter(Boolean)
          .join(', ')
      : undefined;

    // Extract estimated delivery date
    const estimatedDelivery = trackInfo.time_metrics?.estimated_delivery_date?.to
      || trackInfo.time_metrics?.estimated_delivery_date?.from
      || undefined;

    return {
      trackingNumber: acceptedItem.number,
      carrier: acceptedItem.carrier.toString(),
      status,
      subStatus,
      events,
      origin,
      destination,
      estimatedDelivery,
    };
  }

  /**
   * Verify webhook signature from 17Track
   * Signature is SHA256 of: {payload}/API_KEY
   * 
   * @param signature - The signature from the webhook header
   * @param payload - The webhook payload (string)
   * @returns True if signature is valid
   */
  async verifyWebhookSignature(signature: string, payload: string): Promise<boolean> {
    try {
      await this.initialize();

      if (!this.apiKey) {
        return false;
      }

      // 17Track signature: SHA256({payload}/API_KEY)
      const crypto = await import('crypto');
      const src = payload + '/' + this.apiKey;
      const hash = crypto.createHash('sha256').update(src, 'utf8').digest('hex');
      
      return signature === hash;
    } catch (error: unknown) {
      console.error('❌ Error verifying webhook signature:', error);
      return false;
    }
  }

  /**
   * Map 17Track status string to Track17MainStatus enum
   * Used for both API responses and webhook payloads (both use PascalCase format)
   * 
   * @param status - The status string from 17Track (e.g., "InfoReceived", "InTransit", "Delivered")
   * @returns Mapped Track17MainStatus enum value
   */
  mapStatus(status: string): Track17MainStatus {
    if (!status || typeof status !== 'string' || status.trim() === '') {
      throw new Error(`Invalid status value: ${status}`);
    }

    const statusMap: Record<string, Track17MainStatus> = {
      'NotFound': Track17MainStatus.NotFound,
      'InfoReceived': Track17MainStatus.InfoReceived,
      'InTransit': Track17MainStatus.InTransit,
      'Expired': Track17MainStatus.Expired,
      'AvailableForPickup': Track17MainStatus.AvailableForPickup,
      'OutForDelivery': Track17MainStatus.OutForDelivery,
      'DeliveryFailure': Track17MainStatus.DeliveryFailure,
      'Delivered': Track17MainStatus.Delivered,
      'Exception': Track17MainStatus.Exception,
    };

    const mappedStatus = statusMap[status];
    if (!mappedStatus) {
      throw new Error(`Unmapped status from 17Track: "${status}"`);
    }

    return mappedStatus;
  }

  /**
   * Map 17Track sub-status string to Track17SubStatus enum
   * Used for both API responses and webhook payloads (both use PascalCase format)
   * 
   * @param subStatus - The sub-status string from 17Track (e.g., "PickedUp", "Departure", "Arrival")
   * @param mainStatus - Main status for context-aware mapping (required)
   * @returns Mapped Track17SubStatus enum value
   */
  mapSubStatus(subStatus: string, mainStatus: Track17MainStatus): Track17SubStatus {
    // Handle empty or invalid subStatus - use default for main status
    if (!subStatus || typeof subStatus !== 'string' || subStatus.trim() === '') {
      return this.getDefaultSubStatusForMainStatus(mainStatus);
    }

    // Direct mappings (case-sensitive)
    const subStatusMap: Record<string, Track17SubStatus> = {
      'InfoReceived': Track17SubStatus.InfoReceived,
      'PickedUp': Track17SubStatus.InTransit_PickedUp,
      'Departure': Track17SubStatus.InTransit_Departure,
      'Arrival': Track17SubStatus.InTransit_Arrival,
      'Returning': Track17SubStatus.Exception_Returning,
      'Returned': Track17SubStatus.Exception_Returned,
      'CustomsProcessing': Track17SubStatus.InTransit_CustomsProcessing,
      'CustomsReleased': Track17SubStatus.InTransit_CustomsReleased,
      'CustomsRequiringInformation': Track17SubStatus.InTransit_CustomsRequiringInformation,
    };

    // Try exact match first
    if (subStatusMap[subStatus]) {
      return subStatusMap[subStatus];
    }

    // Context-aware mapping based on main status
    const subStatusLower = subStatus.toLowerCase();
    
    if (mainStatus === Track17MainStatus.InTransit) {
        if (subStatusLower.includes('picked') || subStatusLower.includes('pickup')) {
          return Track17SubStatus.InTransit_PickedUp;
        }
        if (subStatusLower.includes('departure') || subStatusLower.includes('depart')) {
          return Track17SubStatus.InTransit_Departure;
        }
        if (subStatusLower.includes('arrival') || subStatusLower.includes('arrive')) {
          return Track17SubStatus.InTransit_Arrival;
        }
        if (subStatusLower.includes('customs')) {
          if (subStatusLower.includes('released') || subStatusLower.includes('release')) {
            return Track17SubStatus.InTransit_CustomsReleased;
          }
          if (subStatusLower.includes('requiring') || subStatusLower.includes('require')) {
            return Track17SubStatus.InTransit_CustomsRequiringInformation;
          }
          return Track17SubStatus.InTransit_CustomsProcessing;
        }
        return Track17SubStatus.InTransit_Other;
      }
      
      if (mainStatus === Track17MainStatus.Exception) {
        if (subStatusLower.includes('returning') || subStatusLower.includes('return')) {
          return Track17SubStatus.Exception_Returning;
        }
        if (subStatusLower.includes('returned')) {
          return Track17SubStatus.Exception_Returned;
        }
        if (subStatusLower.includes('lost')) {
          return Track17SubStatus.Exception_Lost;
        }
        if (subStatusLower.includes('damage')) {
          return Track17SubStatus.Exception_Damage;
        }
        if (subStatusLower.includes('destroyed')) {
          return Track17SubStatus.Exception_Destroyed;
        }
        if (subStatusLower.includes('delayed')) {
          return Track17SubStatus.Exception_Delayed;
        }
        if (subStatusLower.includes('cancel')) {
          return Track17SubStatus.Exception_Cancel;
        }
        if (subStatusLower.includes('security')) {
          return Track17SubStatus.Exception_Security;
        }
        if (subStatusLower.includes('rejected')) {
          return Track17SubStatus.Exception_Rejected;
        }
        if (subStatusLower.includes('nobody') || subStatusLower.includes('no body')) {
          return Track17SubStatus.Exception_NoBody;
        }
        return Track17SubStatus.Exception_Other;
      }
      
      if (mainStatus === Track17MainStatus.DeliveryFailure) {
        if (subStatusLower.includes('nobody') || subStatusLower.includes('no body')) {
          return Track17SubStatus.DeliveryFailure_NoBody;
        }
        if (subStatusLower.includes('security')) {
          return Track17SubStatus.DeliveryFailure_Security;
        }
        if (subStatusLower.includes('rejected')) {
          return Track17SubStatus.DeliveryFailure_Rejected;
        }
        if (subStatusLower.includes('invalid') || subStatusLower.includes('address')) {
          return Track17SubStatus.DeliveryFailure_InvalidAddress;
        }
        return Track17SubStatus.DeliveryFailure_Other;
      }
      
      if (mainStatus === Track17MainStatus.AvailableForPickup) {
        return Track17SubStatus.AvailableForPickup_Other;
      }
      
      if (mainStatus === Track17MainStatus.OutForDelivery) {
        return Track17SubStatus.OutForDelivery_Other;
      }
      
      if (mainStatus === Track17MainStatus.Delivered) {
        return Track17SubStatus.Delivered_Other;
      }
      
      if (mainStatus === Track17MainStatus.Expired) {
        return Track17SubStatus.Expired_Other;
      }
      
      if (mainStatus === Track17MainStatus.NotFound) {
        if (subStatusLower.includes('invalid')) {
          return Track17SubStatus.NotFound_InvalidCode;
        }
        return Track17SubStatus.NotFound_Other;
      }

    // Try to match by partial string match
    const matchingSubStatus = Object.values(Track17SubStatus).find((s) => {
      const enumLower = s.toLowerCase().replace(/_/g, '');
      const subStatusLower = subStatus.toLowerCase().replace(/[_\s]/g, '');
      return enumLower.includes(subStatusLower) || subStatusLower.includes(enumLower);
    });

    if (matchingSubStatus) {
      return matchingSubStatus;
    }

    // Return appropriate default sub-status for main status
    console.warn(`⚠️ Unmapped sub-status from 17Track: "${subStatus}" (mainStatus: ${mainStatus}) - using default`);
    return this.getDefaultSubStatusForMainStatus(mainStatus);
  }

  /**
   * Get default sub-status for a given main status
   * Used when sub-status is missing or cannot be mapped
   */
  private getDefaultSubStatusForMainStatus(mainStatus: Track17MainStatus): Track17SubStatus {
    switch (mainStatus) {
      case Track17MainStatus.NotFound:
        return Track17SubStatus.NotFound_Other;
      case Track17MainStatus.InfoReceived:
        return Track17SubStatus.InfoReceived;
      case Track17MainStatus.InTransit:
        return Track17SubStatus.InTransit_Other;
      case Track17MainStatus.Expired:
        return Track17SubStatus.Expired_Other;
      case Track17MainStatus.AvailableForPickup:
        return Track17SubStatus.AvailableForPickup_Other;
      case Track17MainStatus.OutForDelivery:
        return Track17SubStatus.OutForDelivery_Other;
      case Track17MainStatus.DeliveryFailure:
        return Track17SubStatus.DeliveryFailure_Other;
      case Track17MainStatus.Delivered:
        return Track17SubStatus.Delivered_Other;
      case Track17MainStatus.Exception:
        return Track17SubStatus.Exception_Other;
      default:
        return Track17SubStatus.NotFound_Other;
    }
  }
}

// Export singleton instance
export const track17Service = new Track17Service();

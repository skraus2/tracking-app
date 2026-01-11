/**
 * Tracking threshold utilities for session-only configuration
 * Thresholds are stored in sessionStorage and persist across page navigation
 * but reset when the browser tab closes.
 */

export interface TrackingThresholds {
  daysWithoutUpdate: number;
  daysUndelivered: number;
  timestamp?: number; // optional, for debugging
}

const SESSION_STORAGE_KEY = 'trackingThresholds';
const SYSTEM_DEFAULTS: TrackingThresholds = {
  daysWithoutUpdate: 7,
  daysUndelivered: 20,
};

/**
 * Get effective thresholds using priority: session override > system defaults
 */
export function getEffectiveThresholds(): TrackingThresholds {
  // Check sessionStorage for session override
  const sessionOverride = getSessionOverride();
  if (sessionOverride) {
    return sessionOverride;
  }

  // Fall back to system defaults
  return SYSTEM_DEFAULTS;
}

/**
 * Get session override from sessionStorage
 * Returns null if no override exists or if data is invalid
 */
export function getSessionOverride(): TrackingThresholds | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as TrackingThresholds;
    
    // Validate the parsed data
    if (
      typeof parsed.daysWithoutUpdate === 'number' &&
      typeof parsed.daysUndelivered === 'number' &&
      parsed.daysWithoutUpdate > 0 &&
      parsed.daysUndelivered > 0
    ) {
      return parsed;
    }

    // Invalid data, clear it
    clearSessionOverride();
    return null;
  } catch (error) {
    // Corrupted data, clear it
    console.warn('Failed to parse session threshold override:', error);
    clearSessionOverride();
    return null;
  }
}

/**
 * Set session override in sessionStorage
 */
export function setSessionOverride(thresholds: TrackingThresholds): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const data: TrackingThresholds = {
      ...thresholds,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save session threshold override:', error);
    throw new Error('Failed to save thresholds');
  }
}

/**
 * Clear session override from sessionStorage
 */
export function clearSessionOverride(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear session threshold override:', error);
  }
}

/**
 * Check if a session override is currently active
 */
export function hasSessionOverride(): boolean {
  return getSessionOverride() !== null;
}

/**
 * Validate threshold values
 */
export function validateThresholds(
  daysWithoutUpdate: number,
  daysUndelivered: number
): { valid: boolean; error?: string } {
  if (!Number.isInteger(daysWithoutUpdate) || daysWithoutUpdate < 1) {
    return {
      valid: false,
      error: 'Days without update must be a positive integer',
    };
  }

  if (!Number.isInteger(daysUndelivered) || daysUndelivered < 1) {
    return {
      valid: false,
      error: 'Days undelivered must be a positive integer',
    };
  }

  if (daysWithoutUpdate > 365) {
    return {
      valid: false,
      error: 'Days without update cannot exceed 365',
    };
  }

  if (daysUndelivered > 365) {
    return {
      valid: false,
      error: 'Days undelivered cannot exceed 365',
    };
  }

  return { valid: true };
}

/**
 * Get system defaults
 */
export function getSystemDefaults(): TrackingThresholds {
  return { ...SYSTEM_DEFAULTS };
}

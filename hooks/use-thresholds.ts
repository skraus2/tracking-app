import { useState, useEffect } from 'react';
import {
  getEffectiveThresholds,
  type TrackingThresholds,
} from '@/lib/threshold-utils';

const THRESHOLDS_CHANGED_EVENT = 'tracking-thresholds-changed';

/**
 * Custom hook that syncs tracking thresholds from sessionStorage
 * and listens for changes across tabs and within the same tab.
 */
export function useThresholds() {
  const [thresholds, setThresholds] = useState<TrackingThresholds>(() => {
    if (typeof window === 'undefined') {
      return { daysWithoutUpdate: 7, daysUndelivered: 20 };
    }
    return getEffectiveThresholds();
  });

  useEffect(() => {
    // Listen for storage events (cross-tab/window synchronization)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'trackingThresholds') {
        const newThresholds = getEffectiveThresholds();
        setThresholds(newThresholds);
      }
    };

    // Listen for custom events (same-tab synchronization)
    const handleThresholdsChanged = () => {
      const newThresholds = getEffectiveThresholds();
      setThresholds(newThresholds);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(THRESHOLDS_CHANGED_EVENT, handleThresholdsChanged);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(THRESHOLDS_CHANGED_EVENT, handleThresholdsChanged);
    };
  }, []);

  return thresholds;
}

/**
 * Dispatch a custom event to notify other components in the same tab
 * that thresholds have changed. This complements the storage event
 * which only fires in other tabs/windows.
 */
export function dispatchThresholdsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(THRESHOLDS_CHANGED_EVENT));
  }
}

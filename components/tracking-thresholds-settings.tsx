'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Settings, AlertTriangle } from 'lucide-react';
import {
  getEffectiveThresholds,
  getSessionOverride,
  setSessionOverride,
  clearSessionOverride,
  validateThresholds,
  getSystemDefaults,
  type TrackingThresholds,
} from '@/lib/threshold-utils';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { dispatchThresholdsChanged } from '@/hooks/use-thresholds';

interface TrackingThresholdsSettingsProps {
  onThresholdsChange?: (thresholds: TrackingThresholds) => void;
}

export function TrackingThresholdsSettings({
  onThresholdsChange,
}: TrackingThresholdsSettingsProps) {
  const [open, setOpen] = useState(false);
  const [daysWithoutUpdate, setDaysWithoutUpdate] = useState<number>(7);
  const [daysUndelivered, setDaysUndelivered] = useState<number>(20);
  const [hasOverride, setHasOverride] = useState(false);

  // Load current effective thresholds on mount and when popover opens
  useEffect(() => {
    const effective = getEffectiveThresholds();
    setDaysWithoutUpdate(effective.daysWithoutUpdate);
    setDaysUndelivered(effective.daysUndelivered);
    setHasOverride(getSessionOverride() !== null);
  }, [open]);

  const handleApply = () => {
    const validation = validateThresholds(daysWithoutUpdate, daysUndelivered);
    if (!validation.valid) {
      toast.error('Invalid Thresholds', {
        description: validation.error,
      });
      return;
    }

    try {
      setSessionOverride({
        daysWithoutUpdate,
        daysUndelivered,
      });
      
      setHasOverride(true);
      toast.success('Thresholds Applied', {
        description: 'Thresholds applied for this session',
      });

      // Dispatch event to notify other components in the same tab
      dispatchThresholdsChanged();

      // Notify parent component
      if (onThresholdsChange) {
        onThresholdsChange({ daysWithoutUpdate, daysUndelivered });
      }

      // Close popover
      setOpen(false);
    } catch (error) {
      toast.error('Failed to Apply', {
        description: error instanceof Error ? error.message : 'Failed to save thresholds',
      });
    }
  };

  const handleReset = () => {
    const defaults = getSystemDefaults();
    setDaysWithoutUpdate(defaults.daysWithoutUpdate);
    setDaysUndelivered(defaults.daysUndelivered);
    
    clearSessionOverride();
    setHasOverride(false);
    
    toast.success('Reset to Defaults', {
      description: 'Thresholds reset to system defaults',
    });

    // Dispatch event to notify other components in the same tab
    dispatchThresholdsChanged();

    // Notify parent component
    if (onThresholdsChange) {
      onThresholdsChange(defaults);
    }
  };

  const defaults = getSystemDefaults();
  const differsFromDefaults =
    daysWithoutUpdate !== defaults.daysWithoutUpdate ||
    daysUndelivered !== defaults.daysUndelivered;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" title="Tracking Thresholds">
          <Settings className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-sm mb-1">Tracking Thresholds</h3>
            <p className="text-xs text-muted-foreground">
              Configure thresholds for this session. Values reset when you close this tab.
            </p>
          </div>

          {hasOverride && (
            <div
              className={cn(
                'flex items-start gap-2 p-3 rounded-md border',
                'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
              )}
            >
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1 space-y-1">
                <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
                  Session override active
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  These values will reset to defaults when you close this tab.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs mt-1 text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100"
                  onClick={handleReset}
                >
                  Reset to defaults
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="days-without-update" className="text-sm">
                Days Without Status Update
              </Label>
              <Input
                id="days-without-update"
                type="number"
                min="1"
                max="365"
                value={daysWithoutUpdate}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  if (!isNaN(value)) {
                    setDaysWithoutUpdate(value);
                  }
                }}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Used for "No status update" filters and KPIs
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="days-undelivered" className="text-sm">
                Days+ Undelivered
              </Label>
              <Input
                id="days-undelivered"
                type="number"
                min="1"
                max="365"
                value={daysUndelivered}
                onChange={(e) => {
                  const value = parseInt(e.target.value, 10);
                  if (!isNaN(value)) {
                    setDaysUndelivered(value);
                  }
                }}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Used for "Undelivered" filters and KPIs
              </p>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleApply}
              className="flex-1"
              disabled={
                daysWithoutUpdate === defaults.daysWithoutUpdate &&
                daysUndelivered === defaults.daysUndelivered &&
                !hasOverride
              }
            >
              Apply
            </Button>
            {differsFromDefaults && (
              <Button
                variant="outline"
                onClick={handleReset}
                className="flex-1"
              >
                Reset
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

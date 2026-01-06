'use client';

import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select items...',
  emptyMessage = 'No items found.',
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [popoverWidth, setPopoverWidth] = React.useState<number | undefined>(
    undefined
  );
  const popoverContentRef = React.useRef<HTMLDivElement>(null);
  const hiddenMeasureRef = React.useRef<HTMLDivElement>(null);

  // Calculate initial width using hidden element
  React.useLayoutEffect(() => {
    if (!popoverWidth && hiddenMeasureRef.current) {
      const width = hiddenMeasureRef.current.offsetWidth;
      if (width > 0) {
        setPopoverWidth(width);
      }
    }
  }, [popoverWidth, options]);

  // Measure popover content width when it opens
  React.useLayoutEffect(() => {
    if (open && popoverContentRef.current) {
      // Use multiple attempts to ensure accurate measurement
      const measureWidth = () => {
        if (popoverContentRef.current) {
          const width = popoverContentRef.current.offsetWidth;
          if (width > 0) {
            setPopoverWidth(width);
          }
        }
      };

      // Measure immediately
      measureWidth();

      // Measure after animation frame
      requestAnimationFrame(() => {
        measureWidth();
        // Measure again after a small delay to ensure everything is rendered
        setTimeout(measureWidth, 10);
      });
    }
  }, [open]);

  const handleSelect = (selectedValue: string) => {
    const newValue = value.includes(selectedValue)
      ? value.filter((v) => v !== selectedValue)
      : [...value, selectedValue];
    onChange(newValue);
  };

  const selectedLabels = value
    .map((v) => options.find((opt) => opt.value === v)?.label)
    .filter(Boolean);

  return (
    <>
      {/* Hidden element to measure width before popover opens */}
      <div
        ref={hiddenMeasureRef}
        className="absolute invisible -z-50 pointer-events-none"
        style={{
          visibility: 'hidden',
          position: 'absolute',
          top: '-9999px',
          left: '-9999px',
        }}
      >
        {/* Match exact PopoverContent structure with border and rounded corners */}
        <div className="w-auto p-0 min-w-[200px] rounded-md border">
          <Command>
            <CommandInput placeholder="Search..." />
            <CommandList>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => {}}
                  >
                    <Check className="mr-2 h-4 w-4 opacity-0" />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn('justify-between h-9', className)}
            style={
              popoverWidth
                ? { width: `${popoverWidth}px`, minWidth: `${popoverWidth}px` }
                : undefined
            }
          >
            <div className="flex items-center gap-2 flex-1 overflow-hidden">
              {value.length === 0 ? (
                <span className="text-sm">{placeholder}</span>
              ) : value.length === 1 ? (
                <span className="text-sm font-medium">{selectedLabels[0]}</span>
              ) : (
                <span className="text-sm font-medium">
                  {value.length} selected
                </span>
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          ref={popoverContentRef}
          className="w-auto p-0 min-w-[200px]"
          align="start"
          onOpenAutoFocus={() => {
            // Measure width after popover is fully opened to ensure accuracy
            setTimeout(() => {
              if (popoverContentRef.current) {
                const width = popoverContentRef.current.offsetWidth;
                if (width > 0) {
                  setPopoverWidth(width);
                }
              }
            }, 0);
          }}
        >
          <Command>
            <CommandInput placeholder="Search..." />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => handleSelect(option.value)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value.includes(option.value)
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}

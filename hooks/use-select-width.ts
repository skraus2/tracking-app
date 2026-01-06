import { useState, useLayoutEffect } from 'react';

/**
 * Hook to calculate dynamic width for Select components based on all possible text values
 * @param texts - Array of all possible text values (placeholder + all option labels)
 * @returns The calculated width in pixels, or undefined if not yet calculated
 */
export function useSelectWidth(texts: string[]): number | undefined {
  const [width, setWidth] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (texts.length === 0) return;

    let maxWidth = 0;

    texts.forEach((text) => {
      const measureDiv = document.createElement('div');
      measureDiv.className =
        'flex items-center gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap absolute invisible';
      measureDiv.style.position = 'absolute';
      measureDiv.style.visibility = 'hidden';
      measureDiv.style.top = '-9999px';
      measureDiv.innerHTML = `<span>${text}</span><svg class="ml-2 h-4 w-4 shrink-0 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline></svg>`;
      document.body.appendChild(measureDiv);
      const measuredWidth = measureDiv.offsetWidth;
      if (measuredWidth > maxWidth) {
        maxWidth = measuredWidth;
      }
      document.body.removeChild(measureDiv);
    });

    if (maxWidth > 0) {
      setWidth(maxWidth);
    }
  }, [texts.join(',')]); // Recalculate if texts change

  return width;
}


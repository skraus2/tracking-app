import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-64 mt-1" />
      </div>

      <div className="border rounded-lg p-6 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-5 w-80" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-10" />
        </div>
      </div>

      <div className="border rounded-lg p-6 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-5 w-80" />
        </div>
        <div className="border rounded-lg">
          <div className="p-4 space-y-3">
            <div className="flex gap-4">
              <Skeleton className="h-10 w-[180px]" />
              <Skeleton className="h-10 w-[280px]" />
              <Skeleton className="h-10 w-[280px]" />
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-10 w-[180px]" />
                <Skeleton className="h-10 w-[280px]" />
                <Skeleton className="h-10 w-[280px]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import type { TrendStatus } from '@/types/trends';

interface TrendViewModel {
  id:            string;
  name:          string;
  slug:          string;
  category:      string | null;
  status:        TrendStatus;
  momentumScore: number;
  narrative:     string | null;
  detectedAt:    string; // ISO string — safe to pass to client components
}

const STATUS_STYLES: Record<TrendStatus, string> = {
  emerging: 'bg-green-100 text-green-800',
  rising:   'bg-blue-100 text-blue-800',
  peak:     'bg-purple-100 text-purple-800',
  fading:   'bg-gray-100 text-gray-600',
};

export function TrendCard({ trend }: { trend: TrendViewModel }) {
  return (
    <div className="border rounded-lg p-4 space-y-3 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm leading-tight">{trend.name}</h3>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_STYLES[trend.status]}`}
        >
          {trend.status}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${trend.momentumScore}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground w-8 text-right">{trend.momentumScore}</span>
      </div>

      {trend.narrative && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
          {trend.narrative}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Detected {new Date(trend.detectedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
    </div>
  );
}

export type { TrendViewModel };

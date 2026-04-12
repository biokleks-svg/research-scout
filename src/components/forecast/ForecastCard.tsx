import { Badge } from '@/components/ui/badge';
import type { AreaForecastPrediction } from '@/types/trends';

interface ForecastCardProps {
  taxonomyArea: string;
  forecastDate: Date;
  prediction:   AreaForecastPrediction;
  narrative:    string;
}

const CONFIDENCE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  high:   'default',
  medium: 'secondary',
  low:    'outline',
};

export function ForecastCard({ taxonomyArea, forecastDate, prediction, narrative }: ForecastCardProps) {
  const isPositive = prediction.growthPercent >= 0;
  const sign = isPositive ? '+' : '';

  return (
    <div className="border rounded-lg p-5 space-y-3 bg-card">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-base leading-tight">{taxonomyArea}</h3>
        <Badge variant={CONFIDENCE_VARIANT[prediction.confidence] ?? 'outline'}>
          {prediction.confidence}
        </Badge>
      </div>

      <p className={`text-3xl font-bold tabular-nums ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
        {sign}{prediction.growthPercent.toFixed(1)}%
      </p>

      <p className="text-sm text-muted-foreground leading-relaxed">{narrative}</p>

      <p className="text-xs text-muted-foreground">
        Forecast: {forecastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        {' · '}horizon: {prediction.horizon}
      </p>
    </div>
  );
}

'use client';

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { CriticScores } from '@/types/critic';

interface Props {
  scores: CriticScores;
}

export function CriticRadarChart({ scores }: Props) {
  const data = [
    { dimension: 'Novelty',         value: scores.aiNovelty.score },
    { dimension: 'Usefulness',      value: scores.usefulness.score },
    { dimension: 'Rigor',           value: scores.methodologicalRigor.score },
    { dimension: 'Reproducibility', value: scores.reproducibility.score },
    { dimension: 'Buzz',            value: scores.webBuzz.score },
    { dimension: 'Popularity',      value: scores.popularity.total },
    { dimension: 'Industry',        value: scores.industryRelevance.score },
    { dimension: 'Longevity',       value: scores.longevityPotential.score },
  ];

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid />
          <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
          <Radar
            name="Score"
            dataKey="value"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.25}
          />
          <Tooltip formatter={(value: number) => [`${value}/100`, 'Score']} />
        </RadarChart>
      </ResponsiveContainer>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 mt-4 text-sm">
        {data.map(({ dimension, value }) => (
          <div key={dimension} className="flex justify-between">
            <dt className="text-muted-foreground">{dimension}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

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
    { dimension: 'Novelty',         value: scores.aiNovelty.score,           reasoning: scores.aiNovelty.reasoning },
    { dimension: 'Usefulness',      value: scores.usefulness.score,          reasoning: scores.usefulness.reasoning },
    { dimension: 'Rigor',           value: scores.methodologicalRigor.score, reasoning: scores.methodologicalRigor.reasoning },
    { dimension: 'Reproducibility', value: scores.reproducibility.score,     reasoning: scores.reproducibility.reasoning },
    { dimension: 'Buzz',            value: scores.webBuzz.score,             reasoning: scores.webBuzz.reasoning },
    { dimension: 'Popularity',      value: scores.popularity.total,          reasoning: '' },
    { dimension: 'Longevity',       value: scores.longevityPotential.score,  reasoning: scores.longevityPotential.reasoning },
    { dimension: 'Industry',        value: scores.industryRelevance.score,   reasoning: scores.industryRelevance.reasoning },
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

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-4">
        {data.map((d) => (
          <div key={d.dimension} className="flex flex-col gap-0.5">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{d.dimension}</span>
              <span className="text-muted-foreground">{d.value}/100</span>
            </div>
            {d.reasoning ? (
              <p className="text-xs text-muted-foreground">{d.reasoning}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

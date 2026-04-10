'use client';
import { useState } from 'react';
import { trpc } from '@/app/providers';

interface Props {
  current: Record<string, unknown>;
}

const SETTINGS_SPEC = [
  { key: 'pass1.infographic.enabled',      label: 'Enable Infographic Generation',          type: 'boolean' as const, default: true },
  { key: 'pass1.infographic.topNPercent',  label: 'Infographic: Top N% of papers',          type: 'number'  as const, min: 10, max: 100, default: 100 },
  { key: 'pass2.summary.enabled',          label: 'Enable Summary Generation',               type: 'boolean' as const, default: true },
  { key: 'pass3.podcast.enabled',          label: 'Enable On-Demand Podcasts',               type: 'boolean' as const, default: true },
  { key: 'pass3.podcast.autoGenerateTopN', label: 'Auto-Podcast: Top N papers/week',         type: 'number'  as const, min: 0, max: 50, default: 0 },
  { key: 'critic.enabled',                 label: 'Enable Critic Scoring',                   type: 'boolean' as const, default: true },
  { key: 'rec.candidateWindowDays',        label: 'Rec Engine: Candidate Window (days)',     type: 'number'  as const, min: 7, max: 90, default: 21 },
] as const;

export function SettingsForm({ current }: Props) {
  const utils   = trpc.useUtils();
  const { mutate: setSetting, isPending } = trpc.settings.set.useMutation({
    onSuccess: () => utils.settings.getAll.invalidate(),
  });

  function handleChange(key: string, value: boolean | number) {
    setSetting({ key: key as Parameters<typeof setSetting>[0]['key'], value });
  }

  return (
    <div className="space-y-6">
      {SETTINGS_SPEC.map((spec) => {
        const rawValue = current[spec.key];
        const value = rawValue !== undefined ? rawValue : spec.default;

        return (
          <div key={spec.key} className="flex items-center justify-between border-b pb-4">
            <div>
              <p className="text-sm font-medium">{spec.label}</p>
              <p className="text-xs text-muted-foreground font-mono">{spec.key}</p>
            </div>
            {spec.type === 'boolean' ? (
              <button
                onClick={() => handleChange(spec.key, !(value as boolean))}
                disabled={isPending}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  value ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {value ? 'ON' : 'OFF'}
              </button>
            ) : (
              <input
                type="number"
                min={spec.min}
                max={spec.max}
                defaultValue={value as number}
                onBlur={(e) => handleChange(spec.key, Number(e.target.value))}
                disabled={isPending}
                className="w-20 text-sm border rounded px-2 py-1 text-right"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

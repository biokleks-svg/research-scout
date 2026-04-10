'use client';

import { useState } from 'react';
import { TrendCard, type TrendViewModel } from './TrendCard';

const FIXED_CATEGORIES = [
  'All',
  'NLP',
  'Computer Vision',
  'Reinforcement Learning',
  'Safety',
  'Efficiency',
];

interface Props {
  trends:     TrendViewModel[];
  categories: string[];
}

export function CategoryTabs({ trends, categories }: Props) {
  const [selected, setSelected] = useState('All');

  const allCats = ['All', ...new Set([...FIXED_CATEGORIES.slice(1), ...categories])];

  const filtered = selected === 'All'
    ? trends
    : trends.filter(t =>
        t.category?.toLowerCase().includes(selected.toLowerCase()) ||
        t.name.toLowerCase().includes(selected.toLowerCase()),
      );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {allCats.map(cat => (
          <button
            key={cat}
            onClick={() => setSelected(cat)}
            className={`px-3 py-1 text-sm rounded-full border transition-colors ${
              selected === cat
                ? 'bg-blue-600 text-white border-blue-600'
                : 'hover:bg-muted border-border text-foreground'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No active trends in this category yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(t => (
            <TrendCard key={t.id} trend={t} />
          ))}
        </div>
      )}
    </div>
  );
}

'use client';
import { useState } from 'react';
import { CategoryTabs } from './CategoryTabs';
import { TrendCard } from './TrendCard';
import type { TrendStatus } from '@/types/trends';

interface TrendViewModel {
  id:            string;
  name:          string;
  slug:          string;
  category:      string | null;
  status:        TrendStatus;
  momentumScore: number;
  narrative:     string | null;
  detectedAt:    string;
}

interface Props {
  trends:     TrendViewModel[];
  categories: string[];
}

export function TrendsClientShell({ trends, categories }: Props) {
  const [selected, setSelected] = useState('All');
  const filtered = selected === 'All' ? trends : trends.filter(t => t.category === selected);
  return (
    <div className="space-y-6">
      <CategoryTabs categories={categories} selected={selected} onSelect={setSelected} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map(t => <TrendCard key={t.id} trend={t} />)}
      </div>
    </div>
  );
}

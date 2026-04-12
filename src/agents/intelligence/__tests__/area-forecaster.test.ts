import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB before importing the module under test
vi.mock('@/server/db', () => ({
  db: {
    execute: vi.fn(),
  },
}));
vi.mock('pino', () => ({ pino: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

import { db } from '@/server/db';
import { aggregateSignals, getDistinctAreas } from '../area-forecaster';

// Mirror of the implementation's getMondayOfWeek so test data aligns with real output
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Helper: build a row array simulating week-bucket query results
function makeWeekRows(weekOffsets: number[], counts: number[]) {
  const thisMonday = getMondayOfWeek(new Date());
  return weekOffsets.map((offset, i) => {
    const monday = new Date(thisMonday);
    monday.setUTCDate(monday.getUTCDate() - offset * 7);
    return {
      week:            monday.toISOString(),
      count:           String(counts[i]),
      avg_citations:   String(counts[i] * 2),
      avg_engagement:  String(counts[i] * 0.5),
      harvest_volume:  String(counts[i] * 3),
    };
  });
}

describe('getDistinctAreas', () => {
  it('returns distinct taxonomy area strings', async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [
        { primary_area: 'Computer Vision' },
        { primary_area: 'NLP' },
      ],
    } as never);
    const areas = await getDistinctAreas();
    expect(areas).toEqual(['Computer Vision', 'NLP']);
  });

  it('returns empty array when no areas found', async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({ rows: [] } as never);
    const areas = await getDistinctAreas();
    expect(areas).toEqual([]);
  });
});

describe('aggregateSignals', () => {
  beforeEach(() => {
    vi.mocked(db.execute).mockReset();
  });

  it('returns an object with four 8-element arrays', async () => {
    // Simulate 8 weeks of data
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: makeWeekRows([7, 6, 5, 4, 3, 2, 1, 0], [5, 6, 7, 8, 9, 10, 11, 12]),
    } as never);
    const signals = await aggregateSignals('Computer Vision');
    expect(signals).not.toBeNull();
    expect(signals!.clusterGrowthRate).toHaveLength(8);
    expect(signals!.citationVelocity).toHaveLength(8);
    expect(signals!.engagementTrend).toHaveLength(8);
    expect(signals!.harvestVolume).toHaveLength(8);
  });

  it('returns null when fewer than 4 weeks have non-zero counts', async () => {
    // Only 3 weeks have data (5 weeks are zero)
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: makeWeekRows([2, 1, 0], [3, 4, 5]),
    } as never);
    const signals = await aggregateSignals('Sparse Area');
    expect(signals).toBeNull();
  });

  it('fills missing weeks with 0', async () => {
    // Only 6 of 8 weeks have data rows — the other 2 should be 0-filled
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: makeWeekRows([5, 4, 3, 2, 1, 0], [1, 2, 3, 4, 5, 6]),
    } as never);
    const signals = await aggregateSignals('Partial Area');
    expect(signals).not.toBeNull();
    expect(signals!.clusterGrowthRate).toHaveLength(8);
    // The two oldest slots should be 0
    expect(signals!.clusterGrowthRate[0]).toBe(0);
    expect(signals!.clusterGrowthRate[1]).toBe(0);
  });
});

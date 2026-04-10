import { describe, it, expect } from 'vitest';
import {
  buildConferenceContentHash,
  normalizeDblpHit,
  matchPaperToPage,
  type RawDblpHit,
  type ConferencePageEntry,
} from '../conference';

describe('buildConferenceContentHash', () => {
  it('returns stable 64-char hex', () => {
    const h = buildConferenceContentHash('NeurIPS', 'Attention Is All You Need');
    expect(h).toHaveLength(64);
    expect(buildConferenceContentHash('NeurIPS', 'Attention Is All You Need')).toBe(h);
  });

  it('differs for different venues', () => {
    const h1 = buildConferenceContentHash('NeurIPS', 'Same Title');
    const h2 = buildConferenceContentHash('ICML',    'Same Title');
    expect(h1).not.toBe(h2);
  });

  it('differs for different titles', () => {
    const h1 = buildConferenceContentHash('NeurIPS', 'Title A');
    const h2 = buildConferenceContentHash('NeurIPS', 'Title B');
    expect(h1).not.toBe(h2);
  });
});

describe('normalizeDblpHit', () => {
  const hit: RawDblpHit = {
    info: {
      title:   'Attention Is All You Need',
      authors: { author: [{ text: 'Ashish Vaswani' }, { text: 'Noam Shazeer' }] },
      year:    '2017',
      venue:   'NeurIPS',
      url:     'https://dblp.org/rec/conf/nips/VaswaniSPUJGKP17',
      doi:     '10.5555/3295222.3295349',
      key:     'conf/nips/VaswaniSPUJGKP17',
    },
  };

  it('sets sourceType to conference', () => {
    expect(normalizeDblpHit(hit, 'NeurIPS').sourceType).toBe('conference');
  });

  it('uses doi as sourceId when present', () => {
    expect(normalizeDblpHit(hit, 'NeurIPS').sourceId).toBe('10.5555/3295222.3295349');
  });

  it('falls back to dblp key when doi is missing', () => {
    const noDoi: RawDblpHit = { info: { ...hit.info, doi: undefined } };
    expect(normalizeDblpHit(noDoi, 'NeurIPS').sourceId).toBe('dblp:conf/nips/VaswaniSPUJGKP17');
  });

  it('sets publishedAt to Jan 1 of conference year', () => {
    const d = normalizeDblpHit(hit, 'NeurIPS').publishedAt;
    expect(d.getFullYear()).toBe(2017);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });

  it('maps single author object (not array) correctly', () => {
    const singleAuthor: RawDblpHit = {
      info: { ...hit.info, authors: { author: { text: 'Solo Author' } } },
    };
    expect(normalizeDblpHit(singleAuthor, 'NeurIPS').authors).toEqual(['Solo Author']);
  });

  it('includes venue in rawText', () => {
    expect(normalizeDblpHit(hit, 'NeurIPS').rawText).toContain('NeurIPS');
  });
});

describe('matchPaperToPage', () => {
  const entries: ConferencePageEntry[] = [
    { title: 'Attention Is All You Need', recordingUrl: 'https://youtube.com/watch?v=abc', sessionTrack: 'oral' },
    { title: 'BERT: Pre-training of Deep Bidirectional Transformers', sessionTrack: 'poster' },
    { title: 'Deep Residual Learning for Image Recognition', recordingUrl: 'https://youtube.com/watch?v=xyz' },
  ];

  it('returns the best-matching entry for an exact title', () => {
    const result = matchPaperToPage('Attention Is All You Need', entries);
    expect(result?.sessionTrack).toBe('oral');
  });

  it('returns a match for a slightly different casing and punctuation', () => {
    const result = matchPaperToPage('attention is all you need!', entries);
    expect(result).not.toBeNull();
  });

  it('returns null when no entry meets the 0.7 word-overlap threshold', () => {
    const result = matchPaperToPage('Completely Unrelated Paper Title Here', entries);
    expect(result).toBeNull();
  });

  it('returns the highest-scoring match when multiple entries are similar', () => {
    const similar: ConferencePageEntry[] = [
      { title: 'Attention Is All You Need', sessionTrack: 'oral' },
      { title: 'Attention Is All You Require', sessionTrack: 'poster' },
    ];
    const result = matchPaperToPage('Attention Is All You Need', similar);
    expect(result?.sessionTrack).toBe('oral');
  });
});

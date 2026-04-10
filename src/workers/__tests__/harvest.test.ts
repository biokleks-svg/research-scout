import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/agents/harvesters/paper', () => ({
  harvestArxiv: vi.fn().mockResolvedValue(5),
  enrichRecentPapers: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/agents/harvesters/blog',        () => ({ harvestAllBlogs:    vi.fn().mockResolvedValue(3) }));
vi.mock('@/agents/harvesters/huggingface', () => ({ harvestHuggingFace: vi.fn().mockResolvedValue(2) }));
vi.mock('@/agents/harvesters/social',      () => ({ harvestSocial:      vi.fn().mockResolvedValue(4) }));
vi.mock('@/agents/harvesters/video',       () => ({ harvestYouTube:     vi.fn().mockResolvedValue(1) }));
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(function () { this.on = vi.fn(); }),
}));
vi.mock('@/lib/queue', () => ({ getRedisConnection: vi.fn().mockReturnValue({}) }));

import { harvestJob } from '../harvest';
import { harvestAllBlogs } from '@/agents/harvesters/blog';
import { harvestHuggingFace } from '@/agents/harvesters/huggingface';
import { harvestSocial } from '@/agents/harvesters/social';
import { harvestYouTube } from '@/agents/harvesters/video';

describe('harvestJob', () => {
  it('calls harvestAllBlogs for blog type', async () => {
    await harvestJob('blog');
    expect(harvestAllBlogs).toHaveBeenCalled();
  });
  it('calls harvestHuggingFace for huggingface type', async () => {
    await harvestJob('huggingface');
    expect(harvestHuggingFace).toHaveBeenCalled();
  });
  it('calls harvestSocial for social type', async () => {
    await harvestJob('social');
    expect(harvestSocial).toHaveBeenCalled();
  });
  it('calls harvestYouTube for video type', async () => {
    await harvestJob('video');
    expect(harvestYouTube).toHaveBeenCalled();
  });
});

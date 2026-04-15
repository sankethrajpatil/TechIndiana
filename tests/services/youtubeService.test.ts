import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock googleapis before importing the module under test
vi.mock('googleapis', () => {
  const searchList = vi.fn();
  return {
    google: {
      youtube: () => ({
        search: { list: searchList },
      }),
    },
    __searchList: searchList,
  };
});

// We need to access the mock for assertions
import { __searchList } from 'googleapis';
import { fetchVideosForSkills } from '../../server/services/youtubeService';

describe('youtubeService - fetchVideosForSkills', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return empty array when GOOGLE_API_KEY is missing', async () => {
    delete process.env.GOOGLE_API_KEY;
    const result = await fetchVideosForSkills(['Python', 'AWS']);
    expect(result).toEqual([]);
  });

  it('should return empty array for empty skills list', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    const result = await fetchVideosForSkills([]);
    expect(result).toEqual([]);
    expect((__searchList as any)).not.toHaveBeenCalled();
  });

  it('should fetch one video per skill', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';

    (__searchList as any).mockResolvedValue({
      data: {
        items: [{
          id: { videoId: 'abc123' },
          snippet: {
            title: 'Learn Python in 1 Hour',
            thumbnails: { default: { url: 'https://img.youtube.com/vi/abc123/default.jpg' } },
          },
        }],
      },
    });

    const result = await fetchVideosForSkills(['Python']);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      skill: 'Python',
      title: 'Learn Python in 1 Hour',
      videoId: 'abc123',
      url: 'https://www.youtube.com/watch?v=abc123',
      thumbnail: 'https://img.youtube.com/vi/abc123/default.jpg',
    });
  });

  it('should handle API response with no items', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';

    (__searchList as any).mockResolvedValue({
      data: { items: [] },
    });

    const result = await fetchVideosForSkills(['Obscure_Skill']);
    expect(result).toEqual([]);
  });

  it('should handle API response with undefined items', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';

    (__searchList as any).mockResolvedValue({
      data: {},
    });

    const result = await fetchVideosForSkills(['Obscure_Skill']);
    expect(result).toEqual([]);
  });

  it('should skip skills that throw errors and continue with remaining', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';

    (__searchList as any)
      .mockRejectedValueOnce(new Error('Quota exceeded'))
      .mockResolvedValueOnce({
        data: {
          items: [{
            id: { videoId: 'def456' },
            snippet: {
              title: 'AWS Tutorial',
              thumbnails: { default: { url: 'https://img.youtube.com/vi/def456/default.jpg' } },
            },
          }],
        },
      });

    const result = await fetchVideosForSkills(['Python', 'AWS']);
    expect(result).toHaveLength(1);
    expect(result[0].skill).toBe('AWS');
  });

  it('should fallback to skill name as title when snippet title is missing', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';

    (__searchList as any).mockResolvedValue({
      data: {
        items: [{
          id: { videoId: 'xyz789' },
          snippet: {
            thumbnails: { default: { url: 'https://example.com/thumb.jpg' } },
          },
        }],
      },
    });

    const result = await fetchVideosForSkills(['Docker']);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Docker Tutorial');
  });

  it('should handle video without videoId', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';

    (__searchList as any).mockResolvedValue({
      data: {
        items: [{
          id: {},
          snippet: { title: 'Some Video' },
        }],
      },
    });

    const result = await fetchVideosForSkills(['Kubernetes']);
    expect(result).toEqual([]);
  });

  it('should handle multiple skills successfully', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';

    (__searchList as any)
      .mockResolvedValueOnce({
        data: {
          items: [{
            id: { videoId: 'v1' },
            snippet: { title: 'Python 101', thumbnails: { default: { url: 'thumb1' } } },
          }],
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [{
            id: { videoId: 'v2' },
            snippet: { title: 'AWS Basics', thumbnails: { default: { url: 'thumb2' } } },
          }],
        },
      });

    const result = await fetchVideosForSkills(['Python', 'AWS']);
    expect(result).toHaveLength(2);
    expect(result[0].skill).toBe('Python');
    expect(result[1].skill).toBe('AWS');
  });
});

import { describe, expect, it } from 'vitest';
import { buildYoutubeThumbnailUrl, extractYoutubeVideoId } from '../src/utils/youtube';

describe('extractYoutubeVideoId', () => {
  it('parses watch urls', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=Zs3CIgFET_Y')).toBe('Zs3CIgFET_Y');
  });

  it('parses short urls', () => {
    expect(extractYoutubeVideoId('https://youtu.be/DEyzYWLvXqA?si=abc')).toBe('DEyzYWLvXqA');
  });

  it('parses embed urls', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/embed/wOzHXgqNpe8')).toBe('wOzHXgqNpe8');
  });

  it('accepts youtube subdomains', () => {
    expect(extractYoutubeVideoId('https://music.youtube.com/watch?v=Zs3CIgFET_Y')).toBe('Zs3CIgFET_Y');
    expect(extractYoutubeVideoId('https://youtube.com/watch?v=Zs3CIgFET_Y')).toBe('Zs3CIgFET_Y');
  });

  it('rejects look-alike hosts', () => {
    expect(extractYoutubeVideoId('https://evilyoutube.com/watch?v=Zs3CIgFET_Y')).toBeNull();
    expect(extractYoutubeVideoId('https://youtube.com.evil.io/watch?v=Zs3CIgFET_Y')).toBeNull();
    expect(extractYoutubeVideoId('https://notyoutube-nocookie.com/embed/wOzHXgqNpe8')).toBeNull();
  });
});

describe('youtube url builders', () => {
  it('builds thumbnail urls', () => {
    expect(buildYoutubeThumbnailUrl('DEyzYWLvXqA')).toBe('https://img.youtube.com/vi/DEyzYWLvXqA/mqdefault.jpg');
  });
});

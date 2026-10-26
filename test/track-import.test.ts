import { describe, expect, it } from 'vitest';
import { DEFAULT_PROPERTY_MAPPING } from '../src/domain/config';
import { buildMusicFrontmatter, classifyImport, parseFlatPlaylistOutput, parseOembed } from '../src/domain/track-import';

describe('parseOembed', () => {
  it('reads title, author and thumbnail', () => {
    expect(parseOembed({ title: 'Song', author_name: 'Band', thumbnail_url: 'https://i/x.jpg' }))
      .toEqual({ title: 'Song', author: 'Band', thumbnailUrl: 'https://i/x.jpg' });
  });

  it('defaults a missing author to empty', () => {
    expect(parseOembed({ title: 'Song' })).toEqual({ title: 'Song', author: '', thumbnailUrl: '' });
  });

  it('rejects non-objects and missing titles', () => {
    expect(parseOembed(null)).toBeNull();
    expect(parseOembed('x')).toBeNull();
    expect(parseOembed({ author_name: 'Band' })).toBeNull();
  });
});

describe('buildMusicFrontmatter', () => {
  const meta = { videoId: 'Zs3CIgFET_Y', title: 'Song', author: 'Band', thumbnailUrl: 'https://i/x.jpg' };

  it('uses the first configured keys and the note type', () => {
    expect(buildMusicFrontmatter(meta, DEFAULT_PROPERTY_MAPPING)).toEqual({
      type: 'music',
      source: 'https://www.youtube.com/watch?v=Zs3CIgFET_Y',
      author: 'Band',
      image: 'https://i/x.jpg',
    });
  });

  it('honours custom mapping and omits an empty author', () => {
    const mapping = { ...DEFAULT_PROPERTY_MAPPING, musicNoteType: 'song', musicUrlProperties: ['yt'] };
    expect(buildMusicFrontmatter({ ...meta, author: '' }, mapping)).toEqual({
      type: 'song',
      yt: 'https://www.youtube.com/watch?v=Zs3CIgFET_Y',
      image: 'https://i/x.jpg',
    });
  });
});

describe('classifyImport', () => {
  const tracks = [{ path: 'a.md', videoId: 'Zs3CIgFET_Y' }];

  it('creates when unknown', () => {
    expect(classifyImport('DEyzYWLvXqA', tracks, [])).toEqual({ action: 'create' });
  });

  it('reuses a known note outside the playlist', () => {
    expect(classifyImport('Zs3CIgFET_Y', tracks, ['b.md'])).toEqual({ action: 'reuse', path: 'a.md' });
  });

  it('flags a track already in the playlist', () => {
    expect(classifyImport('Zs3CIgFET_Y', tracks, ['a.md'])).toEqual({ action: 'already-in-playlist', path: 'a.md' });
  });
});

describe('parseFlatPlaylistOutput', () => {
  it('parses rows, skipping blanks and invalid ids', () => {
    const out = [
      'Zs3CIgFET_Y\tFirst\tBand\tMy List',
      '',
      'bad\tNope\tx\tMy List',
      'DEyzYWLvXqA\tSecond\tNA\tMy List\r',
      'wOzHXgqNpe8\t\t\t',
    ].join('\n');
    expect(parseFlatPlaylistOutput(out)).toEqual({
      title: 'My List',
      entries: [
        { videoId: 'Zs3CIgFET_Y', title: 'First', author: 'Band' },
        { videoId: 'DEyzYWLvXqA', title: 'Second', author: '' },
        { videoId: 'wOzHXgqNpe8', title: 'wOzHXgqNpe8', author: '' },
      ],
    });
  });
});

import { describe, expect, it } from 'vitest';
import { plural } from '../src/utils/plural';

describe('plural', () => {
	it('pluralizes by count', () => {
		expect(plural(1, 'track')).toBe('1 track');
		expect(plural(0, 'track')).toBe('0 tracks');
		expect(plural(2, 'music note')).toBe('2 music notes');
	});
});

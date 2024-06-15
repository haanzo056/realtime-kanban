import { describe, expect, it } from 'vitest';
import { comparePositions, isValidKey, keyBetween, keysBetween } from './fractional.js';

describe('keyBetween', () => {
  it('produces a key for an empty list', () => {
    expect(keyBetween(null, null)).toBe('V');
  });

  it('orders keys correctly at the edges', () => {
    const first = keyBetween(null, null);
    const before = keyBetween(null, first);
    const after = keyBetween(first, null);
    expect(before < first).toBe(true);
    expect(after > first).toBe(true);
  });

  it('finds a key between adjacent digits', () => {
    const k = keyBetween('a', 'b');
    expect(k > 'a' && k < 'b').toBe(true);
    expect(isValidKey(k)).toBe(true);
  });

  it('handles keys that share a prefix', () => {
    const k = keyBetween('aZ', 'aa');
    expect(k > 'aZ' && k < 'aa').toBe(true);
  });

  it('handles a being a prefix of b', () => {
    const k = keyBetween('a', 'a1');
    expect(k > 'a' && k < 'a1').toBe(true);
  });

  it('never returns a key with a trailing zero', () => {
    let lo: string | null = null;
    for (let i = 0; i < 200; i++) {
      lo = keyBetween(null, lo);
      expect(isValidKey(lo)).toBe(true);
    }
  });

  it('stays ordered under repeated inserts at the same spot', () => {
    const a = keyBetween(null, null);
    let b = keyBetween(a, null);
    const keys = [a, b];
    for (let i = 0; i < 100; i++) {
      b = keyBetween(a, b);
      keys.push(b);
    }
    const sorted = [...keys].sort();
    expect(new Set(keys).size).toBe(keys.length);
    expect(sorted[0]).toBe(a);
  });

  it('keeps keys reasonably short when appending', () => {
    let k: string | null = null;
    for (let i = 0; i < 1000; i++) k = keyBetween(k, null);
    // ~1 char per 5-6 appends with no integer part; this guards against
    // accidental quadratic growth, not a hard budget.
    expect(k!.length).toBeLessThan(250);
  });

  it('rejects bad input', () => {
    expect(() => keyBetween('b', 'a')).toThrow();
    expect(() => keyBetween('a', 'a')).toThrow();
    expect(() => keyBetween('a0', null)).toThrow();
    expect(() => keyBetween('a-', null)).toThrow();
  });

  it('matches a random sequence of inserts against a reference order', () => {
    const list: string[] = [];
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 500; i++) {
      const at = Math.floor(rand() * (list.length + 1));
      const key = keyBetween(list[at - 1] ?? null, list[at] ?? null);
      list.splice(at, 0, key);
    }
    expect([...list].sort()).toEqual(list);
  });
});

describe('keysBetween', () => {
  it('returns n ordered keys', () => {
    const keys = keysBetween(null, null, 5);
    expect(keys).toHaveLength(5);
    expect([...keys].sort()).toEqual(keys);
  });

  it('respects bounds', () => {
    const keys = keysBetween('a', 'b', 10);
    expect(keys.every((k) => k > 'a' && k < 'b')).toBe(true);
    expect([...keys].sort()).toEqual(keys);
  });
});

describe('comparePositions', () => {
  it('breaks ties by id', () => {
    const items = [
      { id: 'b', position: 'V' },
      { id: 'a', position: 'V' },
      { id: 'c', position: 'F' },
    ];
    expect(items.sort(comparePositions).map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });
});

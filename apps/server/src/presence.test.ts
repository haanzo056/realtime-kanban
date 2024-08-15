import { describe, expect, it } from 'vitest';
import { colorFor, presenceList } from './presence.js';

describe('presence', () => {
  it('gives a user the same colour every time', () => {
    expect(colorFor('user-1')).toBe(colorFor('user-1'));
    expect(colorFor('user-1')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('lists one entry per connection', () => {
    const send = () => {};
    const users = presenceList([
      { id: 'c1', user: { id: 'u1', name: 'alice' }, send },
      { id: 'c2', user: { id: 'u1', name: 'alice' }, send },
      { id: 'c3', user: { id: 'u2', name: 'bob' }, send },
    ]);
    expect(users.map((u) => u.connectionId)).toEqual(['c1', 'c2', 'c3']);
    expect(users[0]!.color).toBe(users[1]!.color);
  });
});

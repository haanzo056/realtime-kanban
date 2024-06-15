// Fractional indexing over base-62 digit strings. A key is read as the
// fractional part of a number in [0, 1): "V" ~ 0.5, "0V" ~ 0.008. Keys sort
// with plain string comparison as long as none of them ends in "0" (a trailing
// zero would make "a" and "a0" the same number but different strings).
//
// Based on the approach described by David Greenspan / Figma's multiplayer
// post, minus the integer-part prefix: we accept that keys grow by roughly one
// character per ~5 consecutive inserts at the same edge.

export const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;

function digitValue(ch: string): number {
  const v = DIGITS.indexOf(ch);
  if (v === -1) throw new Error(`invalid digit "${ch}"`);
  return v;
}

export function isValidKey(key: string): boolean {
  if (key.length === 0 || key.endsWith('0')) return false;
  for (const ch of key) {
    if (!DIGITS.includes(ch)) return false;
  }
  return true;
}

// a < b, a may be "" (meaning 0), b may be null (meaning 1).
function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) throw new Error(`${a} >= ${b}`);

  if (b !== null) {
    // Strip the common prefix, treating a as zero-padded on the right.
    let n = 0;
    while ((a[n] ?? '0') === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }

  const da = a.length > 0 ? digitValue(a[0]!) : 0;
  const db = b !== null ? digitValue(b[0]!) : BASE;

  if (db - da > 1) {
    return DIGITS[Math.round((da + db) / 2)]!;
  }

  // First digits are adjacent. If b has more digits, its first digit alone is
  // strictly between a and b.
  if (b !== null && b.length > 1) return b.slice(0, 1);

  return DIGITS[da]! + midpoint(a.slice(1), null);
}

export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null && !isValidKey(a)) throw new Error(`invalid key: ${a}`);
  if (b !== null && !isValidKey(b)) throw new Error(`invalid key: ${b}`);
  if (a !== null && b !== null && a >= b) {
    throw new Error(`keyBetween: ${a} is not less than ${b}`);
  }
  return midpoint(a ?? '', b);
}

// n keys spread evenly between a and b. Used for seeding default columns.
export function keysBetween(a: string | null, b: string | null, n: number): string[] {
  if (n <= 0) return [];
  if (n === 1) return [keyBetween(a, b)];
  if (b === null) {
    const out: string[] = [];
    let prev = a;
    for (let i = 0; i < n; i++) {
      prev = keyBetween(prev, null);
      out.push(prev);
    }
    return out;
  }
  const mid = Math.floor(n / 2);
  const c = keyBetween(a, b);
  return [...keysBetween(a, c, mid), c, ...keysBetween(c, b, n - mid - 1)];
}

export function comparePositions(
  a: { position: string; id: string },
  b: { position: string; id: string },
): number {
  if (a.position < b.position) return -1;
  if (a.position > b.position) return 1;
  // Ties shouldn't survive the server, but optimistic state can briefly have
  // two clients' cards on the same key. Break ties by id so every client
  // renders the same order.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

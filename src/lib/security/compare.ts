/**
 * Compares two secrets without an early exit on the first differing byte, so
 * response timing does not reveal how much of a guess was right. Lengths are
 * compared first, as node:crypto's timingSafeEqual requires.
 */
export function constantTimeEqual(supplied: string, expected: string): boolean {
  const a = new TextEncoder().encode(supplied);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

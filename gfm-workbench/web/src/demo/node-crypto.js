/**
 * Stand-in for node:crypto in the static demo build.
 *
 * `server/src/lib/auth.js` imports it at module load, but the demo never signs
 * anyone in — it selects a seeded user directly through a role switcher, so no
 * password is ever hashed or verified. The password functions therefore throw
 * rather than pretending to work: a demo that appeared to authenticate would be
 * worse than one that plainly does not.
 */

export function randomBytes(size) {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  return {
    toString(encoding = 'hex') {
      if (encoding !== 'hex') throw new Error(`randomBytes: unsupported encoding ${encoding}`);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    },
  };
}

export function scryptSync() {
  throw new Error(
    'Password authentication is not available in the static demo. ' +
    'Use the role switcher, or run the full application with its API.'
  );
}

export function timingSafeEqual() {
  return false;
}

export default { randomBytes, scryptSync, timingSafeEqual };

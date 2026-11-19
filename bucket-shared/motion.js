// Shared timing curves. Everything is a pure function of time, so frames can render in any order.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
/** 0..1 progress of t through [a, b] */
export const range = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = k => k * k * (3 - 2 * k);
export const easeIn = k => k * k * k;
export const easeOut = k => 1 - Math.pow(1 - k, 3);
export const easeInOut = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/** Pop-in scale: 0 before s=0, overshoots ~25 % then settles to 1. */
export const pop = (s, k = 7, w = 13) => (s <= 0 ? 0 : 1 - Math.exp(-k * s) * Math.cos(w * s));
/** Damped wobble around 0 starting at s=0. */
export const wobble = (s, amp = 1, k = 4, w = 18) => (s <= 0 ? 0 : amp * Math.exp(-k * s) * Math.sin(w * s));

/** Ballistic arc from p0 to p1 (arrays [x,y,z]) with apex `lift` above the higher end; k in 0..1. */
export function arc(p0, p1, lift, k) {
  const y0 = p0[1], y1 = p1[1], top = Math.max(y0, y1) + lift;
  // parabola through y0 (k=0), top (k=m), y1 (k=1)
  const a = Math.sqrt(top - y0), b = Math.sqrt(top - y1), m = a / (a + b);
  const y = k < m ? top - (top - y0) * ((k - m) / m) ** 2 : top - (top - y1) * ((k - m) / (1 - m)) ** 2;
  return [lerp(p0[0], p1[0], k), y, lerp(p0[2], p1[2], k)];
}

/** Keyframe lookup: keys = [[time, value], ...] where value is a number or array. */
export function keys(t, ks, ease = smooth) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) {
      const [t0, v0] = ks[i - 1], [t1, v1] = ks[i];
      const k = ease((t - t0) / (t1 - t0));
      return Array.isArray(v0) ? v0.map((v, j) => lerp(v, v1[j], k)) : lerp(v0, v1, k);
    }
  }
  return ks[ks.length - 1][1];
}

/** Deterministic pseudo-random generator. */
export function rng(seed = 1) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth deterministic noise in -1..1 (for camera shake, idle sway). */
export const noise = (t, seed = 0) =>
  (Math.sin(t * 12.9898 + seed * 78.233) * 0.5 + Math.sin(t * 7.13 + seed * 3.1) * 0.3 + Math.sin(t * 21.7 + seed) * 0.2);

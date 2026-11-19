// Beat times and cameras for "a-boy-is-about". Retime here (e.g. to the VO); scene.js reads only this.
import { keys, range, easeInOut, smooth, noise, lerp } from '../../bucket-shared/motion.js';

export const DURATION = 45;

// brief beats
export const B = { hook: 0, where: 3, dread: 8, bonk: 13, boing: 16, ricochet: 21, catch: 28, twist: 32, end: 39 };

// story events
export const T = {
  brickIn: 0.9, lookUp: 1.6, bang: 2.45, freeze: 2.75,           // hook
  rewindEnd: 3.9, hiccup: 4.6,                                   // where from
  bonk: 13.0, spring: 16.0, launch: 16.15,                       // impact + boing
  // ricochet contacts: [time, anchor name]
  hops: [[21.0, 'hero'], [22.2, 'lamp'], [23.6, 'roofA'], [25.0, 'roofB'], [26.4, 'mailboxTop'], [28.0, 'hero']],
  scoopFall: 29.6, scoopLand: 30.5, grin: 30.9,                  // the catch
  hiccups: [32.4, 32.9, 33.3, 33.8, 34.6, 35.4, 36.3, 37.2, 38.4, 39.8, 41.4, 43.2],
  dogHop: [33.0, 33.6], crouch: [33.3, 34.0],
  bounces: [34.0, 35.2, 36.5, 37.9, 39.3],                       // twist: contacts on the growing pile
  bounceLift: [2.2, 3.0, 4.0, 5.0],
  title: 39.4,
};

const HERO = [0, 0, 2.9];
const view = (target, height, azimuth, elevation, extra = {}) => ({ target, height, azimuth, elevation, ...extra });

/** Camera for time t. kidPos: kid's current world position (for follow shots). */
export function camera(t, kidPos) {
  if (t < B.where) // 1 · hook: low close-up, tiny push-in
    return view([-0.25, 1.5, 2.9], lerp(6.2, 5.6, range(t, 0, 3)), 8, 20);
  if (t < B.dread) { // 2 · pull back to the whole diorama
    const k = easeInOut(range(t, 3.0, 4.1));
    return view(keys(t, [[3, [-0.25, 1.5, 2.9]], [4.1, [0, 6.4, 1]], [8, [0, 6.6, 1]]], easeInOut),
      lerp(5.6, 25, k), lerp(8, 28, k) + range(t, 4.1, 8) * 6, lerp(20, 24, k));
  }
  if (t < B.bonk) // 3 · slow-mo dread, slow dolly along the street
    return view([lerp(-0.6, 0.2, range(t, 8, 13)), 3.4, 2.9], 9.4, 4, 8);
  if (t < B.boing) { // 4 · BONK close-up with a short shake
    const sh = Math.max(0, 1 - (t - T.bonk) / 0.2) * (t >= T.bonk ? 1 : 0);
    return view([-0.6, 1.1, 2.9], 6.8, 8, 18, { offset: [noise(t * 9, 1) * 0.25 * sh, noise(t * 9, 2) * 0.25 * sh] });
  }
  if (t < B.ricochet) // 5 · low angle, tilt up after the brick and back
    return view(keys(t, [[16, [-0.45, 2.3, 2.9]], [16.3, [-0.45, 3.6, 2.9]], [17.3, [-0.2, 8.5, 2.9]], [18.3, [-0.45, 2.8, 2.9]]], easeInOut), 8.4, 8, 5);
  if (t < B.catch) { // 6 · ricochet: wide, cutting to a follow medium on alternate bounces
    const seg = T.hops.findIndex(([h], i) => t < (T.hops[i + 1]?.[0] ?? 1e9));
    if (seg % 2 === 1) return view([kidPos.x * 0.8, kidPos.y + 1.2, kidPos.z * 0.6], 9.5, 24, 18);
    return view([0, 2.6, 0.3], 17.5, 30, 26);
  }
  if (t < B.twist) // 7 · the catch: close-up
    return view([-0.25, 1.9, 2.9], 6.2, 8, 10);
  if (t < B.end) // 8 · twist: pull back to a high wide
    return view(keys(t, [[32, [-0.25, 1.9, 2.9]], [33.4, [0, 4.6, 1.6]], [39, [0, 5.8, 1]]], easeInOut),
      keys(t, [[32, 6.2], [33.4, 14], [39, 19.5]], easeInOut), lerp(8, -8, range(t, 32, 39)), lerp(10, 28, smooth(range(t, 32, 35))));
  // 9 · end card: locked wide, slow zoom out
  return view([0, 6, 1], lerp(19.5, 23.5, range(t, 39, 45)), lerp(-8, -12, range(t, 39, 45)), 28);
}

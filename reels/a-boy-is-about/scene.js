// "Rubber Milo": a brick falls out of a cloud onto a boy who turns out to be made of rubber.
// Brief: briefs/a-boy-is-about.md · Timing: ./timeline.js · Look: lemo-opuscar lowpoly-island (adapted).
import * as THREE from 'three';
import { createStage, blobShadow } from '../../bucket-shared/stage-diorama.js';
import { buildToyTown, buildDog } from '../../bucket-shared/world-toytown.js';
import { buildRubberKid } from '../../bucket-shared/rig-rubberkid.js';
import { buildBrick } from '../../bucket-shared/prop-brick.js';
import { createOverlay } from '../../bucket-shared/overlay-type.js';
import { range, lerp, keys, arc, easeIn, easeOut, smooth, rng, wobble, noise } from '../../bucket-shared/motion.js';
import { DURATION, B, T, camera as camAt } from './timeline.js';
import { loadVoTiming } from '../../bucket-shared/vo-sync.js';

// story time is stretched per beat to fit the voiceover (vo-timing.json from bucket-shared/tts.py)
export let duration = DURATION;
let warp = t => t;

const stage = createStage({ sky: ['#a6d6f2', '#ffe4d2'], shadowSize: 11 });
const { scene } = stage;
const ov = createOverlay();
export const ready = Promise.all([ov.ready, loadVoTiming(new URL('./vo-timing.json', import.meta.url), B)
  .then(vo => { if (vo) { duration = vo.duration; warp = vo.warp; } })]);

const town = buildToyTown({ skyClouds: 9 });
scene.add(town.group);
const A = town.anchors;
const HERO = A.hero.clone();
const DOG = new THREE.Vector3(-1.1, 0, 3.5);   // closer than the town default so close-ups keep him in frame

const kid = buildRubberKid();
scene.add(kid.group);
const dog = buildDog();
scene.add(dog.group);

const brick = buildBrick({ seed: 1 });
brick.group.traverse(o => { o.castShadow = false; });
scene.add(brick.group);
const brickShadow = blobShadow({ square: true });
scene.add(brickShadow);
const BH = brick.size.y / 2;

const drip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), new THREE.MeshStandardMaterial({ color: '#ff9fc4', flatShading: true }));
scene.add(drip);

// contact spots for the ricochet (kid's feet position)
const SPOT = {
  hero: HERO, lamp: new THREE.Vector3(-3.15, 1.1, 3.3), roofA: A.roofA, roofB: A.roofB, mailboxTop: A.mailboxTop,
};

// twist: pile under the kid + rain over the tile
const PILE = T.bounces.slice(0, -1).map((c, j) => ({ land: (c + T.bounces[j + 1]) / 2, y: BH + j * brick.size.y, side: j % 2 ? -1 : 1, b: buildBrick({ seed: 10 + j }) }));
const rand = rng(42);
const blocked = (x, z) => (x > -4.6 && x < -1.6 && z > -4 && z < -1.2) || (x > 1.3 && x < 4 && z > -4.2 && z < -1.6) ||
  (Math.abs(x) < 1.5 && z > 1.6) || (Math.abs(x + 1.1) < 0.9 && z > 2.4);
const RAIN = T.hiccups.map((h, i) => {
  let x, z; do { x = (rand() - 0.5) * 10.4; z = (rand() - 0.5) * 7.4; } while (blocked(x, z));
  return { start: h, land: h + 1.0 + rand() * 0.3, x, z, ry: rand() * 3, b: buildBrick({ seed: 30 + i }) };
});
for (const p of [...PILE, ...RAIN]) scene.add(p.b.group);

const cloudBumps = [3.9, T.hiccup, 17.6, ...T.hiccups];

// ---------- kid ----------
function kidState(t) {
  const st = t >= T.freeze && t < B.where ? T.freeze : t;            // hook freeze-frame
  const p = HERO.clone();
  let pose = { squash: 1, lookUp: 0, lick: 0.3, mouth: 'smile', spin: 0, jiggle: 0, armUp: 0 };
  if (st < T.bonk) {
    const look = smooth(range(st, T.lookUp, T.lookUp + 0.4));
    pose.lick = lerp(0.75 + 0.25 * Math.sin(st * 6), 0.3, look);
    pose.lookUp = look;
    pose.mouth = st > 2.2 ? 'o' : 'smile';
    pose.jiggle = st > B.dread ? Math.sin(st * 47) * 0.25 * range(st, 8, 10) : 0;
  } else if (t < T.spring) {
    pose.squash = lerp(1, 0.15, range(t, T.bonk, T.bonk + 0.08)) + wobble(t - T.bonk - 0.08, 0.06, 3, 16) + Math.sin(t * 4) * 0.012 * range(t, 14, 14.6); // flat, but still breathing
    pose.mouth = 'o'; pose.lookUp = 0.4; pose.jiggle = wobble(t - T.bonk, 0.8, 3, 20);
  } else if (t < B.ricochet) {
    const s = t - T.spring - 0.18;
    pose.squash = s < 0 ? lerp(0.15, 3.1, easeOut(range(t, T.spring, T.spring + 0.18))) : 1 + 2.1 * Math.exp(-2.3 * s) * Math.cos(11 * s);
    pose.lookUp = 1 - smooth(range(t, 17.8, 18.4));
    pose.mouth = t < 18.4 ? 'o' : 'grin';
    pose.jiggle = wobble(t - T.spring, 1, 1.6, 13);
    pose.lean = wobble(t - 18.5, 0.12, 1.2, 6);
  } else if (t < B.catch) {
    const i = T.hops.findIndex(([h], j) => t < T.hops[j + 1][0]);
    const [t0, a] = T.hops[i], [t1, b] = T.hops[i + 1], k = range(t, t0, t1);
    p.fromArray(arc(SPOT[a].toArray(), SPOT[b].toArray(), 2.2, k));
    pose.spin = (i % 2 ? -1 : 1) * Math.PI * 2 * smooth(k);
    const near = Math.min(t - t0, t1 - t);
    pose.squash = near < 0.12 ? 0.6 + near * 3.3 : 1 + Math.sin(k * Math.PI) * 0.25;
    pose.mouth = 'grin'; pose.lick = 0.3;
  } else if (t < B.twist) {
    pose.squash = 1 + wobble(t - B.catch, 0.5, 3, 15);
    pose.lookUp = smooth(range(t, 28.8, 29.3)) * (1 - smooth(range(t, T.scoopLand, T.scoopLand + 0.4)));
    pose.lick = lerp(0.3, 0.55, smooth(range(t, 29, 29.5)));
    pose.mouth = t > T.grin ? 'grin' : 'o';
    pose.blink = t > 31.2 && t < 31.35 ? 1 : 0;
  } else {
    const c = T.bounces;
    pose.mouth = 'grin'; pose.lick = 0.55;
    if (t < c[0]) {
      pose.squash = 1 - 0.4 * smooth(range(t, T.crouch[0], T.crouch[1]));
    } else {
      let i = c.findIndex((x, j) => t < (c[j + 1] ?? 1e9)), t0, t1, lift, y0, y1;
      if (i < c.length - 1) { t0 = c[i]; t1 = c[i + 1]; lift = T.bounceLift[i]; y0 = i * brick.size.y; y1 = y0 + brick.size.y; }
      else { const per = 1.3, n = Math.floor((t - c[i]) / per); t0 = c[i] + n * per; t1 = t0 + per; lift = 2.4; y0 = y1 = PILE.length * brick.size.y; }
      const k = range(t, t0, t1);
      p.y = arc([0, y0, 0], [0, y1, 0], lift, k)[1];
      const near = Math.min(t - t0, t1 - t);
      pose.squash = near < 0.1 ? 0.55 + near * 4.5 : 1 + Math.sin(k * Math.PI) * 0.3;
      pose.armUp = Math.sin(k * Math.PI);
    }
  }
  return { p, pose };
}

// ---------- brick ----------
function brickPos(t) {
  const st = t >= T.freeze && t < B.where ? T.freeze : t;
  const headY = 2.0 + BH;
  if (st < T.brickIn) return null;
  if (st < B.where) return lerp(9, 3.4, easeOut(range(st, T.brickIn, 2.6)));
  if (st < T.rewindEnd) return lerp(3.4, 10.8, smooth(range(st, B.where, T.rewindEnd)));
  if (st < T.hiccup) return null;
  if (st < T.bonk) return keys(st, [[T.hiccup, 10.4], [6.2, 8.6], [B.dread, 6.9], [T.bonk, headY]], k => k);
  if (st < T.spring) return 0.15 * 2.0 + BH + Math.abs(wobble(st - T.bonk, 0.5, 6, 14));
  if (st < T.launch) return lerp(0.3, 2.6, range(st, T.spring, T.launch)) + BH;
  if (st < 17.6) return lerp(2.9, 11, easeOut(range(st, T.launch, 17.6)));
  return null;
}

const v = new THREE.Vector3(), scoopStart = new THREE.Vector3();
function setScoop(worldPos) {
  if (!worldPos) { if (kid.scoop.parent !== kid.anchors.coneSeat) kid.anchors.coneSeat.add(kid.scoop); kid.scoop.position.set(0, 0, 0); return; }
  if (kid.scoop.parent !== scene) scene.add(kid.scoop);
  kid.scoop.position.copy(worldPos);
}

export function renderFrame(tReal) {
  const t = warp(tReal);
  town.update(t);
  // cloud hiccups (swell + squash)
  let bump = 0; for (const h of cloudBumps) bump += wobble(t - h + 0.05, 0.22, 5, 15);
  town.parts.cloud.scale.set(1 + bump, 1 - bump * 0.7, 1 + bump);

  // kid
  const { p, pose } = kidState(t);
  kid.group.position.copy(p);
  kid.pose(pose);
  kid.group.updateMatrixWorld(true);

  // scoop: on the cone, except flying off at the bonk and dropping back at the catch
  if (t >= T.bonk && t < T.scoopFall) {
    const s = t - T.bonk;
    setScoop(s < 1.5 ? v.set(scoopStart.x + 1.2 * s, scoopStart.y + 11 * s, scoopStart.z) : v.set(0, 50, 0));
    kid.scoop.rotation.set(s * 9, s * 4, 0);
  } else if (t >= T.scoopFall && t < T.scoopLand) {
    kid.anchors.coneSeat.getWorldPosition(v);
    setScoop(v.add(new THREE.Vector3(0, 9 * (1 - easeIn(range(t, T.scoopFall, T.scoopLand))), 0)));
    kid.scoop.rotation.set(t * 5, 0, 0);
  } else { setScoop(null); kid.scoop.rotation.set(0, 0, 0); kid.scoop.scale.set(1, 1 + wobble(t - T.scoopLand, 0.5, 5, 18), 1); }

  // ice-cream drip hangs in the slow-mo
  drip.visible = t > 8.6 && t < T.bonk;
  if (drip.visible) { kid.anchors.coneSeat.getWorldPosition(v); drip.position.set(v.x + 0.08, v.y - 0.3 - (t - 8.6) * 0.05, v.z); }

  // main brick + its growing square shadow
  const by = brickPos(t);
  brick.group.visible = by != null;
  brickShadow.visible = by != null && t < T.bonk;
  if (by != null) {
    const bx = t >= T.launch ? (t - T.launch) * 0.6 : 0;
    brick.group.position.set(HERO.x + bx, by, HERO.z);
    const tumble = t < T.bonk ? (T.bonk - t) : t > T.launch ? (t - T.launch) * 6 : 0;
    brick.group.rotation.set(tumble * 0.9, 0.3, tumble * 0.45);
    const near = 1 - range(by, 2.4, 11);
    brickShadow.position.set(HERO.x, 0.03, HERO.z);
    brickShadow.scale.setScalar(0.7 + 1.5 * near * near);
    brickShadow.material.opacity = 0.25 + 0.7 * near;
  }

  // twist bricks: pile under the kid, rain around the town
  const cb = A.cloudBottom;
  for (const q of PILE) {
    const k = range(t, q.land - 0.9, q.land);
    q.b.group.visible = t >= q.land - 0.9;
    q.b.group.position.fromArray(arc([cb.x + 2.2 * q.side, cb.y, cb.z], [HERO.x, q.y, HERO.z], 0.6, easeIn(k)));
    q.b.group.rotation.set(0, (1 - k) * 5 * q.side, 0);
    q.b.group.scale.set(1, 1 + wobble(t - q.land, 0.3, 6, 18), 1);
  }
  for (const r of RAIN) {
    const k = range(t, r.start, r.land);
    r.b.group.visible = t >= r.start;
    r.b.group.position.fromArray(arc([cb.x, cb.y, cb.z], [r.x, BH, r.z], 1.2, k));
    r.b.group.rotation.set((1 - k) * 7, r.ry, (1 - k) * 4);
    r.b.group.scale.set(1, 1 + wobble(t - r.land, 0.35, 6, 18), 1);
  }

  // dog
  let dp = DOG.clone(), dogPose = { wag: t, coverEyes: 0, run: null }, dogScale = 1, dogYaw = 0;
  // startled hop back at the bonk, so the pancake doesn't slide under him
  const back = smooth(range(t, T.bonk, T.bonk + 0.25)) * (1 - smooth(range(t, 20.4, 21)));
  dp.x -= 0.7 * back; dp.y = Math.sin(range(t, T.bonk, T.bonk + 0.25) * Math.PI) * 0.4;
  if (t >= 9 && t < 17) dogPose.coverEyes = smooth(range(t, 9.0, 9.5)) * (1 - smooth(range(t, 16.4, 16.9)));
  if (t >= B.ricochet && t < B.catch + 0.8) {
    const kx = kidState(Math.max(B.ricochet, t - 0.6)).p.x;
    dp.set(lerp(DOG.x, Math.max(-4.6, Math.min(4.6, kx - 0.9)), smooth(range(t, 21, 21.6)) * (1 - smooth(range(t, 28, 28.8)))), 0, lerp(3.5, 3.9, Math.sin(range(t, 21, 28.8) * Math.PI)));
    dogPose.run = t; dogYaw = kx - 0.9 < dp.x ? Math.PI : 0;
  }
  if (t >= T.dogHop[0]) {
    kid.anchors.headTop.getWorldPosition(v);
    const k = range(t, ...T.dogHop);
    dp.fromArray(arc(DOG.toArray(), [v.x - 0.1, v.y - 0.05, v.z], 1.2, k));
    dogScale = lerp(1, 0.7, k);
  }
  dog.group.position.copy(dp); dog.group.scale.setScalar(dogScale); dog.group.rotation.y = dogYaw;
  dog.pose(dogPose);

  // camera
  stage.view(camAt(t, p));

  // overlay: "!" over the kid in the hook, title on the end card
  kid.anchors.headTop.getWorldPosition(v); v.y += 0.55; v.x += 0.5;
  const sp = ov.project(v, stage.camera);
  ov.bang({ show: t >= T.bang && t < B.where ? range(t, T.bang, T.bang + 0.3) + 0.01 : 0, x: sp.x, y: sp.y });
  ov.title(t, { start: T.title, lines: [{ text: 'BOUNCE BACK.', size: 11, y: 7, inset: [2, 14] }, { text: 'Milo is made of rubber.', size: 5.6, y: 15.5, weight: 600, inset: [2, 14], from: 'below', stagger: 0.025 }] });

  stage.render();
}

// where the scoop leaves the cone at the bonk
kid.pose(kidState(T.bonk - 0.01).pose); kid.group.position.copy(HERO); kid.group.updateMatrixWorld(true);
kid.anchors.coneSeat.getWorldPosition(scoopStart);

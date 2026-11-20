// Shared world: a floating low-poly toy-town street tile, plus a small dog rig.
//
//   const town = buildToyTown({ houses: true, trees: true, lamp: true, mailbox: true, cloud: true, skyClouds: 0 });
// skyClouds: number of small distant clouds that drift slowly behind the tile (depth/atmosphere).
//   scene.add(town.group); town.update(t);
//
// Street runs along x; +z is the front (sidewalk), houses at the back (-z). Ground top is y = 0.
// Anchors (world-space THREE.Vector3): hero (front-centre spot), lampTop, mailboxTop, roofA, roofB,
//   cloudBottom, dog (dog's start spot). Parts: cloud, lamp, mailbox, houseA, houseB, bulb.
import * as THREE from 'three';
import { part, flat } from './stage-diorama.js';
import { rng } from './motion.js';

export const PALETTE = {
  grass: '#a4d99b', walk: '#f4e8d2', road: '#bdb6da', soil: '#e0ac82', soilDark: '#c98f6b',
  wallA: '#ffd2a8', wallB: '#cfe6ff', roofA: '#f28c7c', roofB: '#6fc4b6', window: '#fff1b8',
  leaf: '#7fcb8c', leafB: '#9edb8a', trunk: '#c98f63', lamp: '#7d88c6', bulb: '#ffe8a0',
  mail: '#ec6f6f', cloud: '#ffffff', cloudShade: '#e6e0fb',
};

function house(wall, roof, w, d, h) {
  const g = new THREE.Group();
  const body = part(new THREE.BoxGeometry(w, h, d), wall); body.position.y = h / 2; g.add(body);
  const prism = new THREE.CylinderGeometry(0.01, w * 0.74, w * 0.55, 4, 1);
  prism.rotateY(Math.PI / 4); prism.scale(1, 1, d / w);
  const r = part(prism, roof); r.position.y = h + w * 0.275; g.add(r);
  for (const x of [-w * 0.24, w * 0.24]) {
    const win = part(new THREE.BoxGeometry(w * 0.2, h * 0.24, 0.05), PALETTE.window, { emissive: '#ffcc66', emissiveIntensity: 0.15 });
    win.position.set(x, h * 0.58, d / 2 + 0.02); g.add(win);
  }
  const door = part(new THREE.BoxGeometry(w * 0.2, h * 0.38, 0.05), roof); door.position.set(0, h * 0.19, d / 2 + 0.02); g.add(door);
  g.userData.roofTop = h + w * 0.55;
  return g;
}

function tree(rand, s = 1) {
  const g = new THREE.Group();
  const trunk = part(new THREE.CylinderGeometry(0.1 * s, 0.14 * s, 0.6 * s, 5), PALETTE.trunk); trunk.position.y = 0.3 * s; g.add(trunk);
  const crown = part(rand() < 0.5 ? new THREE.ConeGeometry(0.6 * s, 1.5 * s, 6) : new THREE.IcosahedronGeometry(0.7 * s, 0),
    rand() < 0.5 ? PALETTE.leaf : PALETTE.leafB);
  crown.position.y = 1.25 * s; g.add(crown);
  return g;
}

function cloud(rand) {
  const g = new THREE.Group();
  const puffs = [[0, 0, 0, 1.6], [-1.6, -0.3, 0.2, 1.15], [1.6, -0.25, -0.1, 1.25], [-0.7, 0.7, -0.2, 1.1], [0.8, 0.6, 0.3, 1.0], [0, -0.5, 0.8, 1.0]];
  for (const [x, y, z, r] of puffs) {
    const p = part(new THREE.IcosahedronGeometry(r, 1), rand() < 0.5 ? PALETTE.cloud : PALETTE.cloudShade, { cast: false, roughness: 1 });
    p.position.set(x, y, z); g.add(p);
  }
  return g;
}

export function buildToyTown({ houses = true, trees = true, lamp = true, mailbox = true, cloud: withCloud = true, skyClouds = 0, seed = 7 } = {}) {
  const rand = rng(seed);
  const group = new THREE.Group();
  // base slab: grass back strip, road, sidewalk front, soil sides
  const W = 12, D = 9;
  const soil = part(new THREE.BoxGeometry(W, 1.4, D), PALETTE.soil); soil.position.y = -0.72; group.add(soil);
  const under = part(new THREE.CylinderGeometry(W * 0.42, W * 0.2, 2.4, 7), PALETTE.soilDark); under.position.y = -2.6; under.scale.z = 0.7; group.add(under);
  const strips = [[PALETTE.grass, -2.6, 3.8], [PALETTE.road, 0.55, 2.5], [PALETTE.walk, 2.9, 2.2], [PALETTE.grass, 4.2, 0.6]];
  for (const [c, z, d] of strips) {
    const s = part(new THREE.BoxGeometry(W, 0.12, d), c); s.position.set(0, -0.05, z); group.add(s);
  }
  for (let x = -5; x <= 5; x += 2) { // road dashes
    const dash = part(new THREE.BoxGeometry(0.9, 0.02, 0.14), '#f6f2ff', { cast: false }); dash.position.set(x, 0.02, 0.55); group.add(dash);
  }
  const parts = {}, anchors = {};
  anchors.hero = new THREE.Vector3(0, 0, 2.9);
  anchors.dog = new THREE.Vector3(-1.5, 0, 3.1);

  if (houses) {
    parts.houseA = house(PALETTE.wallA, PALETTE.roofA, 2.6, 2.4, 2.4); parts.houseA.position.set(-3.1, 0, -2.6);
    parts.houseB = house(PALETTE.wallB, PALETTE.roofB, 2.3, 2.2, 3.0); parts.houseB.position.set(2.7, 0, -2.9);
    group.add(parts.houseA, parts.houseB);
    anchors.roofA = new THREE.Vector3(-3.1, parts.houseA.userData.roofTop, -2.6);
    anchors.roofB = new THREE.Vector3(2.7, parts.houseB.userData.roofTop, -2.9);
  }
  if (trees) {
    for (const [x, z, s] of [[-5.2, -3.3, 1], [-0.4, -3.6, 1.15], [0.6, -2.4, 0.8], [5.1, -1.6, 0.9], [-5.3, -1.3, 0.75], [5.2, -3.8, 1.1]]) {
      const tr = tree(rand, s); tr.position.set(x, 0, z); tr.rotation.y = rand() * 6; group.add(tr);
    }
  }
  if (lamp) {
    const g = new THREE.Group();
    const pole = part(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 6), PALETTE.lamp); pole.position.y = 1.6; g.add(pole);
    const head = part(new THREE.ConeGeometry(0.42, 0.4, 6), PALETTE.lamp); head.position.y = 3.35; g.add(head);
    parts.bulb = part(new THREE.IcosahedronGeometry(0.2, 0), PALETTE.bulb, { emissive: '#ffd066', emissiveIntensity: 0.6 }); parts.bulb.position.y = 3.1; g.add(parts.bulb);
    g.position.set(-3.6, 0, 3.3); group.add(g); parts.lamp = g;
    anchors.lampTop = new THREE.Vector3(-3.6, 3.55, 3.3);
  }
  if (mailbox) {
    const g = new THREE.Group();
    const leg = part(new THREE.BoxGeometry(0.14, 0.9, 0.14), '#8a7bb8'); leg.position.y = 0.45; g.add(leg);
    const box = part(new THREE.CylinderGeometry(0.32, 0.32, 0.9, 6, 1, false, 0, Math.PI), PALETTE.mail);
    box.rotation.z = Math.PI / 2; box.rotation.y = Math.PI / 2; box.position.y = 0.95; g.add(box);
    const bottom = part(new THREE.BoxGeometry(0.64, 0.12, 0.9), PALETTE.mail); bottom.position.y = 0.95; g.add(bottom);
    g.position.set(3.4, 0, 3.2); group.add(g); parts.mailbox = g;
    anchors.mailboxTop = new THREE.Vector3(3.4, 1.3, 3.2);
  }
  if (withCloud) {
    parts.cloud = cloud(rand); parts.cloud.position.set(0, 12, 1); group.add(parts.cloud);
    anchors.cloudBottom = new THREE.Vector3(0, 10.6, 1.6);
  }
  const far = [];
  for (let i = 0; i < skyClouds; i++) { // distant clouds on an arc behind the tile, drifting sideways
    const c = cloud(rand), a = -0.9 + (1.8 * i) / Math.max(1, skyClouds - 1) + (rand() - 0.5) * 0.25;
    c.scale.setScalar(0.45 + rand() * 0.35);
    c.traverse(o => { o.castShadow = o.receiveShadow = false; });
    c.userData = { x: Math.sin(a) * 30, y: 1.5 + rand() * 15, z: -Math.cos(a) * 30, speed: 0.12 + rand() * 0.15 };
    group.add(c); far.push(c);
  }
  parts.skyClouds = far;
  const update = t => {
    if (parts.cloud) parts.cloud.position.y = 12 + Math.sin(t * 1.3) * 0.15;
    for (const c of far) c.position.set(c.userData.x + t * c.userData.speed, c.userData.y + Math.sin(t * 0.4 + c.userData.z) * 0.2, c.userData.z);
  };
  return { group, parts, anchors, update, size: { W, D } };
}

/** Small low-poly dog. dog.pose({ wag, coverEyes, hop, run }) — all 0..1 except wag/run (time). */
export function buildDog({ fur = '#f5c98a', ears = '#b77b52' } = {}) {
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const torso = part(new THREE.BoxGeometry(0.75, 0.42, 0.42), fur); torso.position.y = 0.45; body.add(torso);
  const head = new THREE.Group(); head.position.set(0.42, 0.78, 0); body.add(head);
  head.add(part(new THREE.BoxGeometry(0.42, 0.38, 0.4), fur));
  const snout = part(new THREE.BoxGeometry(0.18, 0.15, 0.22), '#fff1dc'); snout.position.set(0.25, -0.06, 0); head.add(snout);
  const nose = part(new THREE.BoxGeometry(0.06, 0.06, 0.08), '#3d3560'); nose.position.set(0.35, -0.02, 0); head.add(nose);
  for (const z of [-0.11, 0.11]) {
    const eye = part(new THREE.BoxGeometry(0.04, 0.07, 0.05), '#2e2850'); eye.position.set(0.215, 0.07, z); head.add(eye);
  }
  const earL = part(new THREE.BoxGeometry(0.1, 0.26, 0.14), ears), earR = earL.clone();
  earL.position.set(-0.02, 0.12, 0.25); earR.position.set(-0.02, 0.12, -0.25); head.add(earL, earR);
  const legs = [];
  for (const [x, z] of [[0.25, 0.14], [0.25, -0.14], [-0.25, 0.14], [-0.25, -0.14]]) {
    const l = part(new THREE.BoxGeometry(0.12, 0.3, 0.12), fur); l.geometry.translate(0, -0.15, 0); l.position.set(x, 0.3, z); body.add(l); legs.push(l);
  }
  const tail = part(new THREE.BoxGeometry(0.08, 0.3, 0.08), ears); tail.geometry.translate(0, 0.15, 0); tail.position.set(-0.38, 0.6, 0); tail.rotation.z = 0.6; body.add(tail);

  function pose({ wag = 0, coverEyes = 0, hop = 0, run = null } = {}) {
    tail.rotation.x = Math.sin(wag * 20) * 0.6;
    // front legs (indices 0,1) lift up over the eyes
    for (const i of [0, 1]) { legs[i].rotation.z = coverEyes * 2.6; legs[i].position.y = 0.3 + coverEyes * 0.3; }
    head.rotation.z = -coverEyes * 0.35;
    body.position.y = hop;
    if (run != null) legs.forEach((l, i) => { if (coverEyes < 0.01) l.rotation.z = Math.sin(run * 18 + (i % 2) * Math.PI) * 0.6; });
  }
  pose();
  return { group, pose, anchors: { head } };
}

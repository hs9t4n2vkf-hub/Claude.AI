// Shared character rig: a small low-poly kid who can squash flat, stretch tall and wobble like rubber.
//
//   const kid = buildRubberKid({ shirt: '#ff9a4a' });
//   scene.add(kid.group); kid.group.position.copy(spot);
//   kid.pose({ squash: 1, lookUp: 0, lick: 0, mouth: 'smile', spin: 0, jiggle: 0 });
//
// Height ~1.9 units, feet at the group origin, facing +z.
// Flags: iceCream (holds a cone in the right hand), skin/shirt/shorts/hair colours.
// Anchors: kid.anchors.headTop (Object3D), kid.anchors.coneSeat (Object3D where the scoop sits),
//   kid.scoop (the scoop mesh; detach it with scene.attach(kid.scoop) and put it back with kid.anchors.coneSeat.attach()).
import * as THREE from 'three';
import { part } from './stage-diorama.js';

export function buildRubberKid({
  skin = '#ffd2b0', shirt = '#ff9a4a', shorts = '#5b7fd6', hair = '#8a5a3c', shoes = '#fdf7ee',
  iceCream = true, scoopColor = '#ff9fc4', coneColor = '#e8b26a',
} = {}) {
  const group = new THREE.Group();
  const spin = new THREE.Group(); spin.position.y = 0.95; group.add(spin);   // rotates about the belly
  const off = new THREE.Group(); off.position.y = -0.95; spin.add(off);
  const squashG = new THREE.Group(); off.add(squashG);                         // scales about the feet
  const add = (m, x, y, z, p = squashG) => { m.position.set(x, y, z); p.add(m); return m; };

  for (const x of [-0.16, 0.16]) {
    add(part(new THREE.CylinderGeometry(0.1, 0.11, 0.5, 6), skin), x, 0.33, 0);
    add(part(new THREE.BoxGeometry(0.22, 0.14, 0.32), shoes), x, 0.07, 0.04);
  }
  add(part(new THREE.CylinderGeometry(0.3, 0.32, 0.28, 7), shorts), 0, 0.64, 0);
  const torso = add(part(new THREE.CylinderGeometry(0.27, 0.33, 0.5, 7), shirt), 0, 0.98, 0);

  const head = new THREE.Group(); add(head, 0, 1.24, 0);
  const skull = part(new THREE.IcosahedronGeometry(0.44, 1), skin); skull.position.y = 0.3; head.add(skull);
  const hairCap = part(new THREE.IcosahedronGeometry(0.46, 1), hair); hairCap.position.set(0, 0.42, -0.07); hairCap.scale.set(1, 0.72, 0.95); head.add(hairCap);
  const tuft = part(new THREE.ConeGeometry(0.1, 0.24, 4), hair); tuft.position.set(0.05, 0.8, 0.05); tuft.rotation.z = -0.4; head.add(tuft);
  const eyes = [];
  for (const x of [-0.15, 0.15]) {
    const e = part(new THREE.IcosahedronGeometry(0.065, 1), '#2e2850', { cast: false }); e.scale.set(0.8, 1.15, 0.5);
    e.position.set(x, 0.34, 0.4); head.add(e); eyes.push(e);
    const cheek = part(new THREE.IcosahedronGeometry(0.07, 0), '#ff9f9f', { cast: false }); cheek.scale.set(1, 0.6, 0.3);
    cheek.position.set(x * 1.65, 0.19, 0.37); head.add(cheek);
  }
  const smile = part(new THREE.TorusGeometry(0.11, 0.025, 4, 10, Math.PI), '#7a2e3a', { cast: false });
  smile.rotation.z = Math.PI; smile.position.set(0, 0.2, 0.42); head.add(smile);
  const ohMouth = part(new THREE.CircleGeometry(0.075, 8), '#7a2e3a', { cast: false }); ohMouth.position.set(0, 0.15, 0.435); head.add(ohMouth);
  const headTop = new THREE.Object3D(); headTop.position.y = 0.76; head.add(headTop);

  // arms: pivot at the shoulder, hang along -y
  const arm = (x) => {
    const p = new THREE.Group(); add(p, x, 1.14, 0);
    const a = part(new THREE.CapsuleGeometry(0.075, 0.42, 2, 6), shirt); a.position.y = -0.26; p.add(a);
    const hand = part(new THREE.IcosahedronGeometry(0.09, 0), skin); hand.position.y = -0.55; p.add(hand);
    return p;
  };
  const armL = arm(-0.36), armR = arm(0.36);
  let coneHolder = null, scoop = null, coneSeat = null;
  if (iceCream) {
    coneHolder = new THREE.Group(); coneHolder.position.y = -0.6; armR.add(coneHolder);
    const cone = part(new THREE.ConeGeometry(0.11, 0.34, 6), coneColor); cone.rotation.x = Math.PI; cone.position.y = 0.12; coneHolder.add(cone);
    coneSeat = new THREE.Object3D(); coneSeat.position.y = 0.36; coneHolder.add(coneSeat);
    scoop = part(new THREE.IcosahedronGeometry(0.14, 1), scoopColor); coneSeat.add(scoop);
  }

  function pose({ squash = 1, lookUp = 0, lick = 0, armUp = 0, mouth = 'smile', spin: sp = 0, lean = 0, jiggle = 0, blink = 0 } = {}) {
    const s = Math.max(0.05, squash), side = 1 / Math.sqrt(s);
    squashG.scale.set(side * (1 + jiggle * 0.12), s, side * (1 - jiggle * 0.12));
    spin.rotation.set(0, 0, sp);
    group.rotation.z = lean;
    head.rotation.x = -lookUp * 0.55;
    head.scale.setScalar(1 + jiggle * 0.05);
    armR.rotation.x = -lick * 2.1 - lookUp * 0.2; armR.rotation.z = 0.25 + lick * 0.35;
    if (coneHolder) coneHolder.rotation.x = lick * 2.1 + lookUp * 0.2;
    armL.rotation.z = -0.25 - armUp * 2.4; armL.rotation.x = -armUp * 0.3;
    smile.visible = mouth !== 'o'; ohMouth.visible = mouth === 'o';
    smile.scale.set(mouth === 'grin' ? 1.5 : 1, mouth === 'grin' ? 1.4 : 1, 1);
    for (const e of eyes) { e.scale.y = 1.15 * (1 - blink * 0.85); e.position.y = 0.34 + lookUp * 0.07; }
  }
  pose();
  return { group, pose, scoop, anchors: { headTop, coneSeat, head } };
}

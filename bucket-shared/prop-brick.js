// Shared prop: a chunky low-poly cartoon brick with a frog (the dent on top), slightly chipped.
//   const brick = buildBrick({ scale: 1, seed: 3 }); scene.add(brick.group);
// Size at scale 1: 1.3 x 0.55 x 0.65, centred on its origin. Anchors: brick.size (Vector3).
import * as THREE from 'three';
import { part } from './stage-diorama.js';
import { rng } from './motion.js';

export function buildBrick({ scale = 1, color = '#dc6a45', dent = '#b9502f', seed = 3, chips = true } = {}) {
  const rand = rng(seed);
  const size = new THREE.Vector3(1.3, 0.55, 0.65).multiplyScalar(scale);
  const geo = new THREE.BoxGeometry(size.x, size.y, size.z, 3, 1, 2);
  if (chips) { // nudge vertices for a hand-made feel
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (rand() - 0.5) * 0.03 * scale, p.getY(i) + (rand() - 0.5) * 0.03 * scale, p.getZ(i) + (rand() - 0.5) * 0.03 * scale);
    geo.computeVertexNormals();
  }
  const group = new THREE.Group();
  group.add(part(geo, color, { roughness: 0.95 }));
  const frog = part(new THREE.BoxGeometry(size.x * 0.5, 0.02, size.z * 0.42), dent, { cast: false });
  frog.position.y = size.y / 2 + 0.005; group.add(frog);
  return { group, size };
}

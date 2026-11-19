// Test reel: a spinning cartoon cube. Everything is a pure function of t.
import * as THREE from 'three';

export const duration = 2;

const { width, height } = window.REEL;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(width, height);
renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#ffd6e8');

const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
camera.position.set(0, 1.5, 14);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight('#ffffff', '#b38cff', 1.2));
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.set(3, 5, 4);
scene.add(sun);

// Toon-shaded cube with a black outline
const gradient = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
gradient.needsUpdate = true;
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(2, 2, 2),
  new THREE.MeshToonMaterial({ color: '#3fa9f5', gradientMap: gradient })
);
const outline = new THREE.Mesh(
  cube.geometry,
  new THREE.MeshBasicMaterial({ color: '#111', side: THREE.BackSide })
);
outline.scale.setScalar(1.06);
cube.add(outline);
scene.add(cube);

export function renderFrame(t) {
  cube.rotation.set(t * Math.PI * 0.5, t * Math.PI, 0);   // half turn per second on Y
  cube.position.y = Math.abs(Math.sin(t * Math.PI * 2)) * 0.6;
  renderer.render(scene, camera);
}

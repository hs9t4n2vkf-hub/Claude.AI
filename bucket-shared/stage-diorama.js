// Shared stage for soft low-poly toy dioramas (look: lemo-opuscar "lowpoly-island", adapted to vertical).
// Orthographic camera, pastel screen-space sky gradient, flat-shaded materials, soft sun shadows.
//
//   const stage = createStage({ sky: ['#9fd3f2', '#ffe1cf'] });
//   stage.view({ target: [0, 1, 0], height: 8, azimuth: 20, elevation: 12, roll: 0 });
//   stage.render();
//
// Flags: shadows (default true), shadowSize (half-extent of the sun's shadow box), pixelRatio.
// Anchors: stage.scene, stage.camera, stage.sun, stage.hemi.
import * as THREE from 'three';

export function flat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, metalness: 0, ...opts });
}

/** Mesh helper: geometry + color (or material) with shadows on. */
export function part(geo, color, { cast = true, receive = true, ...matOpts } = {}) {
  const m = new THREE.Mesh(geo, color instanceof THREE.Material ? color : flat(color, matOpts));
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}

/** Soft blob shadow decal lying on y=0 (square or round). Set .material.opacity and .scale per frame. */
export function blobShadow({ square = false, color = '#4b3f72' } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  if (square) {
    g.filter = 'blur(10px)'; g.fillStyle = color; g.fillRect(24, 24, 80, 80);
  } else {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, color); r.addColorStop(0.55, color + 'aa'); r.addColorStop(1, color + '00');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  }
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.5 })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  return mesh;
}

export function createStage({
  width = window.REEL?.width ?? 1080, height = window.REEL?.height ?? 1920,
  sky = ['#9fd3f2', '#ffe1cf'], shadows = true, shadowSize = 12, pixelRatio = 1,
} = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const setSky = (top, bottom) => {
    const c = document.createElement('canvas'); c.width = 2; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, top); gr.addColorStop(1, bottom);
    g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  };
  setSky(...sky);

  const hemi = new THREE.HemisphereLight('#fff6ee', '#b9a6e0', 1.6);
  const sun = new THREE.DirectionalLight('#fff1dc', 2.4);
  sun.position.set(-6, 14, 9);
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -shadowSize, right: shadowSize, top: shadowSize, bottom: -shadowSize, near: 1, far: 60 });
  sun.shadow.radius = 4; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
  scene.add(hemi, sun, sun.target);

  const aspect = width / height;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);

  /** Orthographic view: frustum height is the zoom. Angles in degrees; azimuth 0 looks from +z. */
  function view({ target = [0, 0, 0], height: h = 10, azimuth = 0, elevation = 20, roll = 0, offset = [0, 0] }) {
    const az = THREE.MathUtils.degToRad(azimuth), el = THREE.MathUtils.degToRad(elevation);
    const dist = Math.max(40, h * 3);
    const tgt = new THREE.Vector3(...target);
    camera.position.set(tgt.x + dist * Math.cos(el) * Math.sin(az), tgt.y + dist * Math.sin(el), tgt.z + dist * Math.cos(el) * Math.cos(az));
    camera.up.set(0, 1, 0);
    camera.lookAt(tgt);
    camera.rotateZ(THREE.MathUtils.degToRad(roll));
    const w = h * aspect;
    camera.left = -w / 2 + offset[0]; camera.right = w / 2 + offset[0];
    camera.top = h / 2 + offset[1]; camera.bottom = -h / 2 + offset[1];
    camera.far = dist * 2 + 100;
    camera.updateProjectionMatrix();
  }

  return { renderer, scene, camera, sun, hemi, view, setSky, render: () => renderer.render(scene, camera) };
}

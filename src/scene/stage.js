import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#5a3924';
  x.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 260; i++) {
    const y = Math.random() * c.height;
    const dark = Math.random() < 0.6;
    x.strokeStyle = dark ? `rgba(30,16,8,${0.05 + Math.random() * 0.16})` : `rgba(190,130,80,${0.04 + Math.random() * 0.1})`;
    x.lineWidth = 0.6 + Math.random() * 2.4;
    x.beginPath();
    x.moveTo(0, y);
    const wobble = (Math.random() - 0.5) * 14;
    x.bezierCurveTo(c.width * 0.3, y + wobble, c.width * 0.7, y - wobble, c.width, y + wobble * 0.4);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14110f);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;

  // Room: wall, sideboard, a few out-of-focus warm lights.
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 30),
    new THREE.MeshStandardMaterial({ color: 0x1b2a25, roughness: 0.95 }),
  );
  wall.position.set(0, 4, -3.2);
  scene.add(wall);

  const sideboard = new THREE.Mesh(
    new THREE.BoxGeometry(15, 0.5, 5.6),
    new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.55 }),
  );
  sideboard.position.set(0, -0.89, -0.2);
  sideboard.receiveShadow = true;
  scene.add(sideboard);

  const glow = glowTexture();
  const bokehColors = [0xffc680, 0xffa860, 0xffe0b0, 0xff8f6a];
  for (let i = 0; i < 16; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow,
      color: bokehColors[i % bokehColors.length],
      transparent: true,
      opacity: 0.35 + Math.random() * 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    const size = 0.5 + Math.random() * 0.9;
    sprite.scale.set(size, size, 1);
    sprite.position.set(-10 + (i / 15) * 20 + (Math.random() - 0.5), 1.3 + Math.random() * 2.6 + Math.sin(i * 0.9) * 0.4, -3.0);
    scene.add(sprite);
  }
  const wash = new THREE.PointLight(0xffb070, 30, 14, 2);
  wash.position.set(2.5, 3.2, -1.6);
  scene.add(wash);

  // Lights.
  scene.add(new THREE.HemisphereLight(0xffe9d0, 0x1a1410, 0.35));
  const key = new THREE.SpotLight(0xffdfba, 260, 30, 0.42, 0.7, 2);
  key.position.set(-5, 8.5, 6);
  key.target.position.set(0, 0.3, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.radius = 6;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x9fb6ff, 0.5);
  rim.position.set(6, 4, -3);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minPolarAngle = 0.7;
  controls.maxPolarAngle = 1.42;
  controls.minAzimuthAngle = -1.0;
  controls.maxAzimuthAngle = 0.7;
  if (window.matchMedia('(pointer: coarse)').matches) {
    // On touch screens the hero fills the viewport, so leave the gesture for scrolling.
    controls.enabled = false;
    canvas.style.touchAction = 'pan-y';
  }

  // Framing: "base" shows the whole player; "close" pushes in once the topper is seated.
  const base = { target: new THREE.Vector3(), radius: 10 };
  const close = { target: new THREE.Vector3(), radius: 8 };
  const offset = new THREE.Vector3();
  let focus = 0;
  function applyFocus() {
    offset.copy(camera.position).sub(controls.target);
    controls.target.lerpVectors(base.target, close.target, focus);
    offset.setLength(THREE.MathUtils.lerp(base.radius, close.radius, focus));
    camera.position.copy(controls.target).add(offset);
  }

  let mode = null;
  function layout() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    const next = aspect < 1.25 ? 'tall' : 'wide';
    if (next === 'tall') {
      // Player sits in the lower half, below the copy. Re-frame on every resize.
      const radius = THREE.MathUtils.clamp(3.3 / (Math.tan(THREE.MathUtils.degToRad(20)) * aspect), 11.5, 19);
      camera.fov = 40;
      base.radius = radius;
      base.target.set(0, 0.5 + radius * 0.085, 0);
      close.radius = radius * 0.86;
      close.target.copy(base.target);
      camera.position.setFromSphericalCoords(radius, 1.12, -0.25).add(base.target);
    } else {
      // Player fills the right-hand ~60% of the frame, beside the copy.
      const halfWidth = 5.3;
      const radius = THREE.MathUtils.clamp(halfWidth / (Math.tan(THREE.MathUtils.degToRad(16)) * aspect), 9.5, 15);
      camera.fov = 32;
      base.radius = radius;
      base.target.set(-2.2, 0.75, 0);
      close.radius = radius * 0.8;
      close.target.set(-1.75, 0.9, 0);
      camera.position.setFromSphericalCoords(radius, 1.13, -0.36).add(base.target);
    }
    mode = next;
    controls.target.copy(base.target);
    applyFocus();
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(layout).observe(canvas);
  layout();

  return {
    scene,
    camera,
    // 0 = whole player in frame, 1 = pushed in on the topper.
    setFocus(k) {
      focus = k;
    },
    render() {
      applyFocus();
      controls.update();
      renderer.render(scene, camera);
    },
  };
}

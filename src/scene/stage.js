import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Units are metres. The spindle is the origin and the top of the player is y = 0.
export const TABLE_Y = -0.123;

// The room panorama was rendered in Blender facing the back wall; this turns it to match.
const ROOM_TURN = Math.PI / 2;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,170,80,0.9)');
  g.addColorStop(0.45, 'rgba(255,140,50,0.35)');
  g.addColorStop(1, 'rgba(255,120,40,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14110f);

  // The room: a rendered panorama for the backdrop, and its HDR twin for light and reflections.
  const textures = new THREE.TextureLoader();
  textures.load('assets/room.jpg', (room) => {
    room.mapping = THREE.EquirectangularReflectionMapping;
    room.colorSpace = THREE.SRGBColorSpace;
    scene.background = room;
    scene.backgroundBlurriness = 0.035;
    scene.backgroundRotation.y = ROOM_TURN;
  });
  new RGBELoader().load('assets/room.hdr', (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdr;
    scene.environmentIntensity = 1.0;
    scene.environmentRotation.y = ROOM_TURN;
  });

  // Table, with the warm glow that spills from under the player.
  const wood = textures.load('assets/table.jpg');
  wood.colorSpace = THREE.SRGBColorSpace;
  const woodRough = textures.load('assets/table_rough.jpg');
  for (const t of [wood, woodRough]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3.6, 1.8);
    t.anisotropy = 8;
  }
  const table = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.05, 1.7),
    new THREE.MeshPhysicalMaterial({ map: wood, roughnessMap: woodRough, roughness: 0.9, clearcoat: 0.25, clearcoatRoughness: 0.2 }),
  );
  table.position.set(0, TABLE_Y - 0.025, -0.15);
  table.receiveShadow = true;
  scene.add(table);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.86, 0.72),
    new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(0, TABLE_Y + 0.001, 0);
  scene.add(glow);

  // Lights: a warm key with shadows, a low amber kicker from behind.
  const key = new THREE.DirectionalLight(0xffd7a8, 1.5);
  key.position.set(-0.85, 0.95, 0.75);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -0.6;
  key.shadow.camera.right = 0.6;
  key.shadow.camera.top = 0.6;
  key.shadow.camera.bottom = -0.6;
  key.shadow.camera.near = 0.2;
  key.shadow.camera.far = 3;
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.002;
  key.shadow.radius = 5;
  scene.add(key);
  const kicker = new THREE.DirectionalLight(0xffa860, 0.6);
  kicker.position.set(0.5, 0.5, -0.8);
  scene.add(kicker);
  scene.add(new THREE.HemisphereLight(0xffe2c4, 0x1a120c, 0.25));

  const camera = new THREE.PerspectiveCamera(32, 1, 0.02, 60);
  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minPolarAngle = 0.75;
  controls.maxPolarAngle = 1.4;
  controls.minAzimuthAngle = -0.95;
  controls.maxAzimuthAngle = 0.55;
  if (window.matchMedia('(pointer: coarse)').matches) {
    // On touch screens the hero fills the viewport, so leave the gesture for scrolling.
    controls.enabled = false;
    canvas.style.touchAction = 'pan-y';
  }

  // Bloom makes the lamps, flames and screen glow.
  const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.6, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Framing: "base" shows the whole player; "close" pushes in once the topper is seated.
  const base = { target: new THREE.Vector3(), radius: 1 };
  const close = { target: new THREE.Vector3(), radius: 0.8 };
  const offset = new THREE.Vector3();
  let focus = 0;
  function applyFocus() {
    offset.copy(camera.position).sub(controls.target);
    controls.target.lerpVectors(base.target, close.target, focus);
    offset.setLength(THREE.MathUtils.lerp(base.radius, close.radius, focus));
    camera.position.copy(controls.target).add(offset);
  }

  function layout() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    const aspect = w / h;
    camera.aspect = aspect;
    if (aspect < 1.25) {
      // Player sits in the lower half, below the copy.
      const radius = THREE.MathUtils.clamp(0.36 / (Math.tan(THREE.MathUtils.degToRad(20)) * aspect), 1.2, 2.0);
      camera.fov = 40;
      base.radius = radius;
      base.target.set(0, 0.02 + radius * 0.09, 0);
      close.radius = radius * 0.86;
      close.target.copy(base.target);
      camera.position.setFromSphericalCoords(radius, 1.1, -0.3).add(base.target);
    } else {
      // Player fills the right-hand ~60% of the frame, beside the copy.
      const radius = THREE.MathUtils.clamp(0.56 / (Math.tan(THREE.MathUtils.degToRad(16)) * aspect), 1.0, 1.6);
      camera.fov = 32;
      base.radius = radius;
      base.target.set(-0.24, 0.0, 0.02);
      close.radius = radius * 0.78;
      close.target.set(-0.17, 0.04, 0.0);
      camera.position.setFromSphericalCoords(radius, 1.1, -0.42).add(base.target);
    }
    controls.target.copy(base.target);
    applyFocus();
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(layout).observe(canvas);
  layout();

  return {
    scene,
    camera,
    renderer,
    // 0 = whole player in frame, 1 = pushed in on the topper.
    setFocus(k) {
      focus = k;
    },
    render() {
      applyFocus();
      controls.update();
      composer.render();
    },
  };
}

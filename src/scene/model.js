import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TABLE_Y } from './stage.js';

// The player, the carousel topper and the props are built in Blender (blender/build_scene.py)
// and exported as glTF. This module loads them and exposes the few parts that move.

const PIVOT = { x: 0.185, z: -0.125 };
const ARM_LENGTH = 0.225;
const PIVOT_DIST = Math.hypot(PIVOT.x, PIVOT.z);
const TOWARD_SPINDLE = Math.atan2(-PIVOT.x, -PIVOT.z);

// Yaw of the arm that puts the stylus at a given radius from the spindle.
function yawForRadius(r) {
  const cos = (PIVOT_DIST ** 2 + ARM_LENGTH ** 2 - r ** 2) / (2 * PIVOT_DIST * ARM_LENGTH);
  return TOWARD_SPINDLE + Math.acos(cos);
}

export const ARM = {
  rest: TOWARD_SPINDLE + THREE.MathUtils.degToRad(50),
  start: yawForRadius(0.142),
  end: yawForRadius(0.066),
};

const SUN_TEETH = 32;
const PLANET_TEETH = 10;
const UP = new THREE.Vector3(0, 1, 0);
const TILT_AXIS = new THREE.Vector3(0, 0, -1);

// The streak of light on a spinning record stays put while the record turns.
function sheenTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  const g = x.createConicGradient(-0.7, 256, 256);
  const stops = [[0, 0], [0.04, 0.5], [0.08, 0], [0.3, 0], [0.33, 0.28], [0.36, 0], [0.5, 0], [0.55, 0.42], [0.6, 0], [0.82, 0], [0.85, 0.25], [0.88, 0], [1, 0]];
  for (const [at, a] of stops) g.addColorStop(at, `rgba(255,214,160,${a})`);
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);
  return new THREE.CanvasTexture(c);
}

// Fine concentric lines, mostly transparent, laid over the record so the grooves read.
function grooveTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const x = c.getContext('2d');
  for (let r = 176; r < 508; r += 2.2) {
    const gap = [0.5, 0.66, 0.8].some((g) => Math.abs(r / 512 - g) < 0.006);
    x.strokeStyle = gap ? 'rgba(0,0,0,0.55)' : `rgba(255,225,190,${0.03 + Math.random() * 0.07})`;
    x.lineWidth = gap ? 2.4 : 0.9;
    x.beginPath();
    x.arc(512, 512, r, 0, Math.PI * 2);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

// Snow settles on whatever faces up.
function addSnow(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec3 upNormal = inverseTransformDirection(normalize(vNormal), viewMatrix);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.97), smoothstep(0.25, 0.6, upNormal.y));`,
    );
  };
  material.needsUpdate = true;
}

function restyle(root) {
  const acrylic = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.03, metalness: 0, envMapIntensity: 1.8, side: THREE.DoubleSide, depthWrite: false,
  });
  // Kept nearly matte to the room's light, or the bright table reflects in it and it turns gold.
  const vinyl = new THREE.MeshPhysicalMaterial({ color: 0x040405, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.35, envMapIntensity: 0.18 });
  const snowy = new Set();
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    const name = node.material.name || '';
    // Brushed-metal direction needs data these meshes do not carry; without this it renders as black holes.
    if ('anisotropy' in node.material) node.material.anisotropy = 0;
    if (name.startsWith('Acrylic')) {
      node.material = acrylic;
      node.castShadow = false;
      node.renderOrder = 4;
    } else if (name.startsWith('Vinyl')) {
      node.material = vinyl;
    } else if (name.startsWith('FirSnowy')) {
      if (!snowy.has(node.material)) {
        node.material.color.set(0x0d3a1c);
        addSnow(node.material);
        snowy.add(node.material);
      }
    } else if (/^(Flame|Window|Screen|Bulb|TreeBulb|Underglow)/.test(name)) {
      node.castShadow = false;
    }
    if (name.startsWith('Underglow')) node.visible = false;
  });
}

const named = (root, prefix) => {
  const found = [];
  root.traverse((node) => {
    if (node.name === prefix || new RegExp(`^${prefix}\\d{3}$`).test(node.name)) found.push(node);
  });
  return found;
};

export async function loadModels(scene) {
  const loader = new GLTFLoader();
  const [playerFile, propsFile] = await Promise.all([loader.loadAsync('assets/player.glb'), loader.loadAsync('assets/props.glb')]);
  const root = playerFile.scene;
  const props = propsFile.scene;
  restyle(root);
  restyle(props);
  scene.add(root, props);

  // Gifts sit where the topper waits at the start, so leave them out.
  for (const gift of named(props, 'Gift')) gift.visible = false;

  // A few of the candles cast real light.
  const flames = [];
  props.traverse((node) => {
    if (node.isMesh && /flame/i.test(node.material.name || node.name)) flames.push(node);
  });
  const flameLights = flames.slice(0, 5).map((flame) => {
    const at = new THREE.Box3().setFromObject(flame).getCenter(new THREE.Vector3());
    const light = new THREE.PointLight(0xff9a45, 0.05, 1.6, 2);
    light.position.copy(at);
    scene.add(light);
    return light;
  });

  const spin = root.getObjectByName('RecordSpin');
  const arm = root.getObjectByName('Arm');
  const armTilt = root.getObjectByName('ArmTilt');
  const topper = root.getObjectByName('Topper');
  const turning = root.getObjectByName('TopperTurning');

  // Record dressing: static sheen and groove overlays just above the vinyl.
  const recordTop = 0.0166;
  for (const [texture, opacity, blending, lift] of [[grooveTexture(), 1, THREE.NormalBlending, 0.00012], [sheenTexture(), 0.26, THREE.AdditiveBlending, 0.0002]]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.0535, 0.1492, 128),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity, blending, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = recordTop + lift;
    scene.add(ring);
  }

  // Clockwork: planets roll round the fixed sun gear and crank the rods.
  const planets = named(turning, 'Planet');
  const rods = named(turning, 'Rod');
  const pins = named(turning, 'RodPin');
  const mech = planets.map((planet, i) => {
    const rod = rods[i];
    const pin = pins[i];
    rod.geometry.computeBoundingBox();
    const length = rod.geometry.boundingBox.max.y;
    const centre = new THREE.Vector3(planet.position.x, pin.position.y, planet.position.z);
    return {
      planet,
      rod,
      pin,
      length,
      centre,
      planetStart: planet.quaternion.clone(),
      offset: pin.position.clone().sub(centre),
      top: pin.position.clone().add(UP.clone().applyQuaternion(rod.quaternion).multiplyScalar(length)),
    };
  });
  const riders = named(turning, 'Rider').map((node, i) => ({ node, y: node.position.y, start: node.quaternion.clone(), phase: i * 2.1 }));

  const seat = topper.position.clone();
  const waiting = new THREE.Vector3(-0.21, TABLE_Y, 0.335);
  topper.position.copy(waiting);
  const turn = new THREE.Quaternion();
  const reach = new THREE.Vector3();

  const api = {
    armAngle: ARM.rest,
    seat,
    waiting,
    topper,
    setRecordAngle(angle) {
      spin.rotation.y = angle;
    },
    // lift: 0 = down, 1 = raised clear of the record.
    setArm(angle, lift) {
      api.armAngle = angle;
      arm.rotation.set(0, angle, 0);
      armTilt.rotation.set(-0.06 * lift, 0, 0);
    },
    // angle: how far the base has turned (negative = clockwise, like the record).
    setCarousel(angle) {
      turning.rotation.y = angle;
      for (const m of mech) {
        m.planet.quaternion.copy(m.planetStart).multiply(turn.setFromAxisAngle(UP, (angle * SUN_TEETH) / PLANET_TEETH));
        m.pin.position.copy(m.offset).applyAxisAngle(UP, angle * 3).add(m.centre);
        m.rod.position.copy(m.pin.position);
        reach.copy(m.top).sub(m.pin.position);
        m.rod.scale.y = reach.length() / m.length;
        m.rod.quaternion.setFromUnitVectors(UP, reach.normalize());
      }
      for (const r of riders) {
        const gallop = -3 * angle + r.phase;
        r.node.position.y = r.y + 0.0022 * Math.sin(gallop);
        r.node.quaternion.copy(r.start).multiply(turn.setFromAxisAngle(TILT_AXIS, 0.1 * Math.cos(gallop)));
      }
    },
    // Candles flicker.
    flicker(time) {
      flameLights.forEach((light, i) => {
        light.intensity = 0.05 * (1 + 0.16 * Math.sin(time * 7.3 + i * 1.7) + 0.08 * Math.sin(time * 15.1 + i * 0.9));
      });
    },
  };
  api.setArm(ARM.rest, 0);
  api.setCarousel(0);
  return api;
}

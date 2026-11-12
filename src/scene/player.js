import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Units: 1 = 10 cm. Plinth top is y = 0. The spindle is the origin.

const PIVOT = { x: 1.85, z: -1.25 };
const ARM_LENGTH = 2.25;
const PIVOT_DIST = Math.hypot(PIVOT.x, PIVOT.z);
const TOWARD_SPINDLE = Math.atan2(-PIVOT.x, -PIVOT.z);

// Yaw of the arm that puts the stylus at a given radius from the spindle.
function yawForRadius(r) {
  const cos = (PIVOT_DIST ** 2 + ARM_LENGTH ** 2 - r ** 2) / (2 * PIVOT_DIST * ARM_LENGTH);
  return TOWARD_SPINDLE + Math.acos(cos);
}

export const ARM = {
  rest: TOWARD_SPINDLE + THREE.MathUtils.degToRad(50),
  start: yawForRadius(1.42),
  end: yawForRadius(0.66),
};

export const RECORD_TOP = 0.165;
export const DOCK = new THREE.Vector3(-1.98, 0, 1.48);

function labelTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#8f2b2a';
  x.fillRect(0, 0, 512, 512);
  x.strokeStyle = 'rgba(243,236,223,0.75)';
  x.lineWidth = 3;
  x.beginPath();
  x.arc(256, 256, 236, 0, Math.PI * 2);
  x.stroke();
  x.lineWidth = 1.5;
  x.beginPath();
  x.arc(256, 256, 226, 0, Math.PI * 2);
  x.stroke();
  x.fillStyle = '#f3ecdf';
  x.textAlign = 'center';
  x.font = 'italic 46px Georgia, serif';
  x.fillText('A Winter', 256, 128);
  x.fillText('Evening', 256, 178);
  x.font = '24px Georgia, serif';
  x.fillText('SIDE A', 256, 372);
  x.font = '20px Georgia, serif';
  x.fillText('33⅓ rpm', 256, 404);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function grooveTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const x = c.getContext('2d');
  x.fillStyle = '#09090a';
  x.fillRect(0, 0, 1024, 1024);
  const gaps = [0.52, 0.68, 0.82];
  for (let r = 180; r < 500; r += 1.6) {
    const frac = r / 512;
    const inGap = gaps.some((g) => Math.abs(frac - g) < 0.006);
    x.strokeStyle = inGap ? 'rgba(0,0,0,0.9)' : `rgba(255,255,255,${0.03 + Math.random() * 0.07})`;
    x.lineWidth = inGap ? 2.2 : 0.8;
    x.beginPath();
    x.arc(512, 512, r, 0, Math.PI * 2);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// The streak of light on a spinning record stays put while the record turns.
function sheenTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  const g = x.createConicGradient(-0.5, 256, 256);
  const stops = [[0, 0], [0.05, 0.55], [0.1, 0], [0.5, 0], [0.55, 0.38], [0.6, 0], [1, 0]];
  for (const [at, a] of stops) g.addColorStop(at, `rgba(255,236,210,${a})`);
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);
  return new THREE.CanvasTexture(c);
}

export function createPlayer() {
  const group = new THREE.Group();

  const enamel = new THREE.MeshPhysicalMaterial({ color: 0xe9e1d0, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc79a4f, roughness: 0.28, metalness: 1 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xcfd2d6, roughness: 0.3, metalness: 1 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x3b332b, roughness: 1 });

  const add = (mesh, x, y, z, parent = group) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Plinth, speaker cloth, feet.
  add(new THREE.Mesh(new RoundedBoxGeometry(5.0, 0.5, 4.0, 6, 0.13), enamel), 0, -0.25, 0);
  add(new THREE.Mesh(new RoundedBoxGeometry(4.4, 0.27, 0.06, 3, 0.03), fabric), 0, -0.25, 1.99);
  for (const [fx, fz] of [[-2.1, -1.6], [2.1, -1.6], [-2.1, 1.6], [2.1, 1.6]]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.14, 24), brass), fx, -0.57, fz);
  }

  // Platter and mat.
  add(new THREE.Mesh(new THREE.CylinderGeometry(1.57, 1.57, 0.12, 96), steel), 0, 0.07, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(1.53, 1.53, 0.016, 96), rubber), 0, 0.137, 0);

  // Record: turns. Spindle: stays still.
  const spin = new THREE.Group();
  group.add(spin);
  const vinyl = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: grooveTexture(), roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.02, 128), [rubber, vinyl, rubber]), 0, RECORD_TOP - 0.01, 0, spin);
  const label = new THREE.Mesh(new THREE.CircleGeometry(0.5, 64), new THREE.MeshStandardMaterial({ map: labelTexture(), roughness: 0.7 }));
  label.rotation.x = -Math.PI / 2;
  label.position.y = RECORD_TOP + 0.001;
  label.receiveShadow = true;
  spin.add(label);

  const sheen = new THREE.Mesh(
    new THREE.RingGeometry(0.53, 1.49, 96),
    new THREE.MeshBasicMaterial({ map: sheenTexture(), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  sheen.rotation.x = -Math.PI / 2;
  sheen.position.y = RECORD_TOP + 0.002;
  group.add(sheen);

  add(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.16, 24), brass), 0, RECORD_TOP + 0.04, 0);

  // Topper dock, speed knob, station light.
  const dockRing = new THREE.Mesh(new THREE.RingGeometry(0.43, 0.48, 64), brass);
  dockRing.rotation.x = -Math.PI / 2;
  dockRing.position.set(DOCK.x, 0.003, DOCK.z);
  group.add(dockRing);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 32), brass), 2.12, 0.05, 1.62);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a211a, emissive: 0xffb04a, emissiveIntensity: 0 }),
  );
  lamp.position.set(2.12, 0.02, 1.25);
  group.add(lamp);

  // Tonearm.
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.05, 32), brass), PIVOT.x, 0.025, PIVOT.z);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.3, 24), steel), PIVOT.x, 0.15, PIVOT.z);
  const yaw = new THREE.Group();
  yaw.position.set(PIVOT.x, 0, PIVOT.z);
  group.add(yaw);
  const tilt = new THREE.Group();
  tilt.position.y = 0.28;
  yaw.add(tilt);
  const lying = (geometry, material, z, y = 0) => {
    const mesh = add(new THREE.Mesh(geometry, material), 0, y, z, tilt);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  };
  add(new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 16), brass), 0, 0, 0, tilt);
  lying(new THREE.CylinderGeometry(0.022, 0.022, ARM_LENGTH + 0.5, 16), steel, (ARM_LENGTH - 0.5) / 2);
  lying(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 24), brass, -0.42);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.28), steel), 0, 0, ARM_LENGTH - 0.03, tilt);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.09, 0.17), new THREE.MeshStandardMaterial({ color: 0x8f2b2a, roughness: 0.5 })), 0, -0.055, ARM_LENGTH, tilt);
  add(new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 8), steel), 0, -0.1, ARM_LENGTH + 0.03, tilt).rotation.x = Math.PI;

  // Arm rest.
  const restAt = 0.72 * ARM_LENGTH;
  add(
    new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.25, 16), brass),
    PIVOT.x + Math.sin(ARM.rest) * restAt,
    0.125,
    PIVOT.z + Math.cos(ARM.rest) * restAt,
  );

  const api = {
    group,
    armAngle: ARM.rest,
    setRecordAngle(angle) {
      spin.rotation.y = angle;
    },
    // lift: 0 = down, 1 = raised clear of the record.
    setArm(angle, lift) {
      api.armAngle = angle;
      yaw.rotation.y = angle;
      tilt.rotation.x = -0.055 * lift;
    },
    setStationLight(level) {
      lamp.material.emissiveIntensity = level * 3;
    },
  };
  api.setArm(ARM.rest, 0);
  return api;
}

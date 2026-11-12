import * as THREE from 'three';

// A snow-globe topper. Origin is the underside of its foot.
// "turning" rides on the record; "still" is held by the fixed spindle.

const STAGE_Y = 0.62;
const DOME_R = 0.82;
const DOME_Y = STAGE_Y + 0.2;
const SKATER_RING = 0.56;
const COATS = [0xa8322f, 0xd9a441, 0x2f7f86, 0xf0e6d2, 0x6d3f7a];

function skater(color, skin) {
  const g = new THREE.Group();
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.062, 0.14, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  coat.position.y = 0.075;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.036, 16, 12), new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 }));
  head.position.y = 0.178;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.07, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  hat.position.y = 0.235;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.011, 8, 16), new THREE.MeshStandardMaterial({ color: 0xf3ecdf, roughness: 0.8 }));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.148;
  for (const m of [coat, head, hat, scarf]) {
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

export function createTopper() {
  const group = new THREE.Group();
  const turning = new THREE.Group();
  const still = new THREE.Group();
  group.add(turning, still);

  const brass = new THREE.MeshStandardMaterial({ color: 0xc79a4f, roughness: 0.28, metalness: 1 });
  const lacquer = new THREE.MeshPhysicalMaterial({ color: 0x7a1d22, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15, side: THREE.DoubleSide });
  const snow = new THREE.MeshStandardMaterial({ color: 0xf6f8fb, roughness: 0.95 });
  const ice = new THREE.MeshPhysicalMaterial({ color: 0xcfe3ee, roughness: 0.12, clearcoat: 1 });
  const pine = new THREE.MeshStandardMaterial({ color: 0x1e5a3d, roughness: 0.85 });

  const shadowed = (mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  // Foot (label-sized), flared stem, stage.
  const foot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.46, 0.07, 64), brass));
  foot.position.y = 0.035;
  const profile = [[0.4, 0.07], [0.26, 0.1], [0.16, 0.19], [0.14, 0.3], [0.2, 0.4], [0.4, 0.48], [0.7, 0.54], [0.85, 0.57], [0.86, STAGE_Y]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const stem = shadowed(new THREE.Mesh(new THREE.LatheGeometry(profile, 96), lacquer));
  const rim = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.022, 12, 96), brass));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = STAGE_Y - 0.01;
  const pond = new THREE.Mesh(new THREE.CircleGeometry(0.84, 96), ice);
  pond.rotation.x = -Math.PI / 2;
  pond.position.y = STAGE_Y + 0.001;
  pond.receiveShadow = true;
  const bank = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 12, 96), snow);
  bank.rotation.x = Math.PI / 2;
  bank.scale.z = 0.6;
  bank.position.y = STAGE_Y + 0.01;
  turning.add(foot, stem, rim, pond, bank);

  // Skaters ride the turning stage.
  const skaters = COATS.map((color, i) => {
    const s = skater(color, i % 2 ? 0xe8c9a8 : 0xb98863);
    const a = (i / COATS.length) * Math.PI * 2;
    s.position.set(Math.cos(a) * SKATER_RING, STAGE_Y, Math.sin(a) * SKATER_RING);
    s.rotation.y = -a;
    s.rotation.z = 0.14;
    s.userData.angle = a;
    turning.add(s);
    return s;
  });

  // Glass dome.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(DOME_R, 64, 40, 0, Math.PI * 2, 0, Math.PI - Math.acos(0.2 / DOME_R)),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.02, clearcoat: 1, envMapIntensity: 2.2, depthWrite: false }),
  );
  dome.position.y = DOME_Y;
  dome.renderOrder = 3;
  turning.add(dome);

  // The still centre: snow mound, tree, star, lights.
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 16), snow);
  mound.scale.y = 0.22;
  mound.position.y = STAGE_Y + 0.01;
  still.add(mound);
  const tiers = [[0.3, 0.36, 0.84], [0.24, 0.32, 1.04], [0.18, 0.28, 1.21], [0.115, 0.24, 1.37]];
  for (const [r, h, y] of tiers) {
    const tier = shadowed(new THREE.Mesh(new THREE.ConeGeometry(r, h, 28), pine));
    tier.position.y = y;
    still.add(tier);
  }
  const starMat = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffc35a, emissiveIntensity: 0.4 });
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.055), starMat);
  star.position.y = 1.53;
  still.add(star);

  const bulbMats = [0xff5a4a, 0xffc35a, 0x7fd0ff, 0xfff1d0].map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.3 }));
  const bulbGeo = new THREE.SphereGeometry(0.02, 10, 8);
  for (let i = 0; i < 22; i++) {
    const t = i / 21;
    const y = 0.72 + t * 0.7;
    const r = 0.29 * (1 - t) + 0.035;
    const a = i * 2.4;
    const bulb = new THREE.Mesh(bulbGeo, bulbMats[i % bulbMats.length]);
    bulb.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    still.add(bulb);
  }
  const lamp = new THREE.PointLight(0xffc27a, 0, 4, 2);
  lamp.position.set(0, 1.0, 0.45);
  still.add(lamp);

  // Snow drifting inside the dome.
  const FLAKES = 110;
  const flakes = new Float32Array(FLAKES * 3);
  const place = (i, top) => {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.68;
    const ceiling = DOME_Y + Math.sqrt(Math.max(0, 0.74 ** 2 - r ** 2));
    flakes[i * 3] = Math.cos(a) * r;
    flakes[i * 3 + 1] = top ? ceiling : STAGE_Y + 0.03 + Math.random() * (ceiling - STAGE_Y - 0.03);
    flakes[i * 3 + 2] = Math.sin(a) * r;
  };
  for (let i = 0; i < FLAKES; i++) place(i, false);
  const flakeGeo = new THREE.BufferGeometry();
  flakeGeo.setAttribute('position', new THREE.BufferAttribute(flakes, 3));
  const points = new THREE.Points(flakeGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.022, transparent: true, opacity: 0.9, depthWrite: false }));
  points.renderOrder = 2;
  still.add(points);

  return {
    group,
    // angle: rotation of the turning part; speed: 0..1 platter speed; glow: 0..1 lights.
    update(dt, angle, speed, glow) {
      turning.rotation.y = angle;
      for (const s of skaters) {
        // Ramps on the still centre lift each skater twice per turn.
        s.position.y = STAGE_Y + Math.max(0, Math.sin(2 * (angle + s.userData.angle))) * 0.035;
      }
      const swirl = -dt * 0.9 * speed;
      const cos = Math.cos(swirl);
      const sin = Math.sin(swirl);
      for (let i = 0; i < FLAKES; i++) {
        const x = flakes[i * 3];
        const z = flakes[i * 3 + 2];
        flakes[i * 3] = x * cos + z * sin;
        flakes[i * 3 + 2] = -x * sin + z * cos;
        flakes[i * 3 + 1] -= dt * (0.03 + 0.05 * speed);
        if (flakes[i * 3 + 1] < STAGE_Y + 0.03) place(i, true);
      }
      flakeGeo.attributes.position.needsUpdate = true;
      lamp.intensity = glow * 1.6;
      starMat.emissiveIntensity = 0.4 + glow * 2.2;
      for (const m of bulbMats) m.emissiveIntensity = 0.3 + glow * 2.4;
    },
  };
}

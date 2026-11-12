import * as THREE from 'three';
import { createStage } from './scene/stage.js';
import { createPlayer, ARM, DOCK, RECORD_TOP } from './scene/player.js';
import { createTopper } from './scene/topper.js';
import { MusicBox } from './audio.js';

const stage = createStage(document.getElementById('stage'));
const player = createPlayer();
const topper = createTopper();
stage.scene.add(player.group, topper.group);
topper.group.position.copy(DOCK);

const SEAT = new THREE.Vector3(0, RECORD_TOP + 0.001, 0);
const RAD_PER_SEC = ((100 / 3) / 60) * Math.PI * 2;
const audio = new MusicBox();

const el = (id) => document.getElementById(id);
const ui = { cta: el('cta'), now: el('now'), title: el('now-title'), sub: el('now-sub'), action: el('now-action'), mute: el('mute') };

// phase: idle, placing, cueing, side, returning, station
const s = { phase: 'idle', speed: 0, angle: 0, glow: 0, seated: false, sideT: 0, sideDur: 0 };

const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const easeOut = (k) => 1 - (1 - k) ** 3;

const tweens = new Set();
function tween(seconds, fn, ease = easeInOut) {
  return new Promise((resolve) => tweens.add({ t: 0, seconds, fn, ease, resolve }));
}

const COPY = {
  placing: ['Placing the topper', ''],
  cueing: ['Starting side A', 'A Winter Evening'],
  side: ['Playing side A from the record', 'A Winter Evening'],
  returning: ['Side A has finished', 'The arm lifts and returns by itself.'],
  station: ['The side is over. The topper keeps playing.', 'Winter station, stored on the topper. No subscription.'],
};

function setPhase(phase) {
  s.phase = phase;
  ui.cta.hidden = phase !== 'idle';
  ui.now.hidden = phase === 'idle';
  ui.now.dataset.phase = phase;
  if (phase === 'idle') return;
  [ui.title.textContent, ui.sub.textContent] = COPY[phase];
  ui.action.hidden = !(phase === 'side' || phase === 'station');
  ui.action.textContent = phase === 'side' ? 'End the side now' : 'Play side A again';
}

async function placeTopper() {
  audio.ensure();
  setPhase('placing');
  const from = topper.group.position.clone();
  await tween(1.9, (k) => {
    topper.group.position.lerpVectors(from, SEAT, k);
    topper.group.position.y += Math.sin(Math.PI * k) * 1.15;
  });
  s.seated = true;
  tween(1.4, (k) => { s.glow = k; });
  tween(3.2, (k) => stage.setFocus(k));
  await tween(1.8, (k) => { s.speed = k; }, easeOut);
  await playSide();
}

async function playSide() {
  setPhase('cueing');
  await tween(0.5, (k) => player.setArm(ARM.rest, k));
  await tween(1.4, (k) => player.setArm(lerp(ARM.rest, ARM.start, k), 1));
  await tween(0.6, (k) => player.setArm(ARM.start, 1 - k));
  s.sideDur = audio.startSide();
  s.sideT = 0;
  setPhase('side');
}

async function endSide() {
  if (s.phase !== 'side') return;
  setPhase('returning');
  audio.stopSide();
  const at = player.armAngle;
  await tween(0.6, (k) => player.setArm(at, k));
  await tween(1.6, (k) => player.setArm(lerp(at, ARM.rest, k), 1));
  await tween(0.5, (k) => player.setArm(ARM.rest, 1 - k));
  audio.startStation();
  tween(0.8, (k) => player.setStationLight(k));
  setPhase('station');
}

async function replaySide() {
  if (s.phase !== 'station') return;
  audio.stopStation();
  tween(0.5, (k) => player.setStationLight(1 - k));
  await playSide();
}

ui.cta.addEventListener('click', () => { if (s.phase === 'idle') placeTopper(); });
ui.action.addEventListener('click', () => (s.phase === 'side' ? endSide() : replaySide()));
ui.mute.addEventListener('click', () => {
  const muted = !audio.muted;
  audio.setMuted(muted);
  ui.mute.textContent = muted ? 'Sound off' : 'Sound on';
  ui.mute.setAttribute('aria-pressed', String(muted));
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  for (const tw of tweens) {
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.seconds);
    tw.fn(tw.ease(k));
    if (k >= 1) {
      tweens.delete(tw);
      tw.resolve();
    }
  }

  // Records turn clockwise seen from above.
  s.angle -= s.speed * RAD_PER_SEC * dt;
  player.setRecordAngle(s.angle);
  topper.update(dt, s.seated ? s.angle : 0, s.speed, s.glow);

  if (s.phase === 'side') {
    s.sideT += dt;
    player.setArm(lerp(ARM.start, ARM.end, Math.min(1, s.sideT / s.sideDur)), 0);
    if (s.sideT >= s.sideDur) endSide();
  }

  stage.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy when checking the scene by hand.
window.__roundabout = { state: s, endSide };

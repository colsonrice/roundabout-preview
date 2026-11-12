import { createStage } from './scene/stage.js';
import { loadModels, ARM } from './scene/model.js';
import { MusicBox } from './audio.js';

const stage = createStage(document.getElementById('stage'));
const RAD_PER_SEC = ((100 / 3) / 60) * Math.PI * 2;
const audio = new MusicBox();

const el = (id) => document.getElementById(id);
const ui = { cta: el('cta'), now: el('now'), title: el('now-title'), sub: el('now-sub'), action: el('now-action'), mute: el('mute') };

// phase: loading, idle, placing, cueing, side, returning, station
const s = { phase: 'loading', speed: 0, angle: 0, seated: false, sideT: 0, sideDur: 0 };
let model = null;

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
  const waiting = phase === 'idle' || phase === 'loading';
  ui.cta.hidden = !waiting;
  ui.cta.disabled = phase === 'loading';
  ui.now.hidden = waiting;
  ui.now.dataset.phase = phase;
  if (waiting) return;
  [ui.title.textContent, ui.sub.textContent] = COPY[phase];
  ui.action.hidden = !(phase === 'side' || phase === 'station');
  ui.action.textContent = phase === 'side' ? 'End the side now' : 'Play side A again';
}

async function placeTopper() {
  audio.ensure();
  setPhase('placing');
  const from = model.waiting;
  await tween(2.0, (k) => {
    model.topper.position.lerpVectors(from, model.seat, k);
    model.topper.position.y += Math.sin(Math.PI * k) * 0.16;
  });
  s.seated = true;
  tween(3.2, (k) => stage.setFocus(k));
  await tween(1.8, (k) => { s.speed = k; }, easeOut);
  await playSide();
}

async function playSide() {
  setPhase('cueing');
  await tween(0.5, (k) => model.setArm(ARM.rest, k));
  await tween(1.4, (k) => model.setArm(lerp(ARM.rest, ARM.start, k), 1));
  await tween(0.6, (k) => model.setArm(ARM.start, 1 - k));
  s.sideDur = audio.startSide();
  s.sideT = 0;
  setPhase('side');
}

async function endSide() {
  if (s.phase !== 'side') return;
  setPhase('returning');
  audio.stopSide();
  const at = model.armAngle;
  await tween(0.6, (k) => model.setArm(at, k));
  await tween(1.6, (k) => model.setArm(lerp(at, ARM.rest, k), 1));
  await tween(0.5, (k) => model.setArm(ARM.rest, 1 - k));
  audio.startStation();
  setPhase('station');
}

async function replaySide() {
  if (s.phase !== 'station') return;
  audio.stopStation();
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

// Moves everything forward by dt seconds.
function advance(dt, time) {
  for (const tw of tweens) {
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.seconds);
    tw.fn(tw.ease(k));
    if (k >= 1) {
      tweens.delete(tw);
      tw.resolve();
    }
  }

  if (model) {
    // Records turn clockwise seen from above.
    s.angle -= s.speed * RAD_PER_SEC * dt;
    model.setRecordAngle(s.angle);
    if (s.seated) model.setCarousel(s.angle);
    model.flicker(time);

    if (s.phase === 'side') {
      s.sideT += dt;
      model.setArm(lerp(ARM.start, ARM.end, Math.min(1, s.sideT / s.sideDur)), 0);
      if (s.sideT >= s.sideDur) endSide();
    }
  }
}

let last = performance.now();
function frame(now) {
  // Follow real time even when frames are slow, but do not leap after a long pause.
  advance(Math.min(0.25, (now - last) / 1000), now / 1000);
  last = now;
  stage.render();
  requestAnimationFrame(frame);
}

setPhase('loading');
requestAnimationFrame(frame);
loadModels(stage.scene)
  .then((loaded) => {
    model = loaded;
    setPhase('idle');
  })
  .catch((err) => {
    console.error('Could not load the 3D models', err);
    ui.cta.textContent = 'The 3D scene could not load';
  });

// Handy when checking the scene by hand.
window.__roundabout = { state: s, endSide, stage, advance };

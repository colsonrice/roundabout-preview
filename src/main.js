import { MusicBox } from './audio.js';

// The hero plays pre-rendered clips: one full turn of each topper on the record, looping.
const TOPPERS = {
  reindeer: { name: 'Reindeer Carousel', line: 'The tree stands still while reindeer and a sleigh gallop round it.' },
  cabin: { name: 'Mill Cabin', line: 'The cabin turns with the record. Gears spin the mill wheel and twist smoke from the chimney.' },
  nativity: { name: 'Nativity', line: 'The stable stays facing you while three kings circle it on camels.' },
};

const audio = new MusicBox();
const el = (id) => document.getElementById(id);
const ui = {
  video: el('stage-video'), label: el('chooser-label'), line: el('chooser-line'),
  now: el('now'), title: el('now-title'), sub: el('now-sub'), action: el('now-action'), mute: el('mute'),
};
const picks = Array.from(document.querySelectorAll('.pick'));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const stacked = window.matchMedia('(max-aspect-ratio: 5/4)'); // narrow screens: the picture sits above the words

// phase: idle, placing, side, returning, station
const s = { phase: 'idle', topper: null };

const COPY = {
  placing: () => [`Placing the ${TOPPERS[s.topper].name}`, 'Starting side A'],
  side: () => ['Playing side A from the record', 'A Winter Evening'],
  returning: () => ['Side A has finished', 'The arm lifts and returns by itself.'],
  station: () => ['The side is over. The topper keeps playing.', 'Winter station, stored on the topper. No subscription.'],
};

function setPhase(phase) {
  s.phase = phase;
  ui.now.hidden = phase === 'idle';
  ui.now.dataset.phase = phase;
  if (phase === 'idle') return;
  [ui.title.textContent, ui.sub.textContent] = COPY[phase]();
  ui.action.hidden = !(phase === 'side' || phase === 'station');
  ui.action.textContent = phase === 'side' ? 'End the side now' : 'Play side A again';
}

// Each step of the story waits, then carries on only if nothing newer has started since.
let step = 0;
async function pause(seconds) {
  const mine = step;
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  return mine === step;
}

function showTopper(id) {
  const topper = TOPPERS[id];
  picks.forEach((pick) => pick.setAttribute('aria-pressed', String(pick.dataset.topper === id)));
  ui.label.textContent = `On the record: ${topper.name}`;
  ui.line.textContent = topper.line;

  const video = ui.video;
  const reveal = () => { if (s.topper === id) video.classList.add('is-on'); };
  video.classList.remove('is-on');
  video.hidden = false;
  video.poster = `assets/topper-${id}.jpg`;
  video.src = `assets/topper-${id}.mp4`;
  video.setAttribute('aria-label', `${topper.name} topper turning on the record`);
  video.addEventListener('loadeddata', reveal, { once: true });
  setTimeout(reveal, 1200); // show the still frame even if the clip is slow to arrive
  if (reduceMotion) video.load();
  else video.play().catch(() => { /* the still frame stays */ });
}

async function playSide() {
  step++;
  audio.ensure();
  setPhase('placing');
  if (!(await pause(1.4))) return;
  setPhase('side');
  if (!(await pause(audio.startSide()))) return;
  endSide();
}

async function endSide() {
  if (s.phase !== 'side') return;
  step++;
  setPhase('returning');
  audio.stopSide();
  if (!(await pause(2.2))) return;
  audio.startStation();
  setPhase('station');
}

function replaySide() {
  if (s.phase !== 'station') return;
  audio.stopStation();
  playSide();
}

function choose(id) {
  if (id === s.topper) return;
  s.topper = id;
  showTopper(id);
  if (s.phase === 'idle') playSide();
  // On a narrow screen the picture is at the top of the page: go back up to it if it has been scrolled away.
  if (stacked.matches && ui.video.getBoundingClientRect().top < 0) {
    el('top').scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  }
}

picks.forEach((pick) => pick.addEventListener('click', () => choose(pick.dataset.topper)));
ui.action.addEventListener('click', () => (s.phase === 'side' ? endSide() : replaySide()));
ui.mute.addEventListener('click', () => {
  const muted = !audio.muted;
  audio.setMuted(muted);
  ui.mute.textContent = muted ? 'Sound off' : 'Sound on';
  ui.mute.setAttribute('aria-pressed', String(muted));
});

// Handy when checking the page by hand.
window.__roundabout = { state: s, choose, endSide };

import { MusicBox } from './audio.js';
import { STATIONS } from './songs.js';
import { Stage } from './stage.js';

const TOPPERS = {
  reindeer: { name: 'Reindeer Carousel', line: 'The tree stands still while reindeer and a sleigh gallop round it.' },
  cabin: { name: 'Mill Cabin', line: 'The cabin stays still while the record turns beneath it. Gears spin the mill wheel and twist smoke from the chimney.' },
  nativity: { name: 'Nativity', line: 'The stable stays facing you while three kings circle it on camels.' },
  nutcracker: { name: 'Nutcracker', line: 'The soldier stands still while three dancers pirouette round him on the gears.' },
  swan: { name: 'Swan Lake', line: 'A castle and a crescent moon stand still while swans glide round the lake.' },
  jazz: { name: 'Jazz Trio', line: 'Piano, bass and drums turn under one still lamp, swaying in time.' },
  city: { name: 'City at Night', line: 'The skyline stands still while a train, taxis and a biplane circle it.' },
  hotel: { name: 'Desert Hotel', line: 'The hotel stays still while a car drives the desert highway round it.' },
  orrery: { name: 'Orrery', line: 'The sun stays still while gears carry the planets and the moon round it.' },
};
// Toppers whose clips are rendered and on the site. The rest show in the chooser as coming soon.
const READY = new Set(['reindeer', 'cabin', 'nativity']);

const audio = new MusicBox();
const el = (id) => document.getElementById(id);
const ui = {
  label: el('chooser-label'), line: el('chooser-line'), tools: el('stage-tools'), view: el('view'),
  now: el('now'), title: el('now-title'), sub: el('now-sub'), action: el('now-action'), mute: el('mute'),
};
const picks = Array.from(document.querySelectorAll('.pick'));
picks.forEach((pick) => { pick.disabled = !READY.has(pick.dataset.topper); });
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const stacked = window.matchMedia('(max-aspect-ratio: 5/4)'); // narrow screens: the picture sits above the words
const stage = new Stage(el('stage'), { reduceMotion });

// phase: idle, placing, side, returning, station
const s = { phase: 'idle', topper: null };

const COPY = {
  placing: () => [`Placing the ${TOPPERS[s.topper].name}`, 'Starting side A'],
  side: () => ['Playing side A from the record', 'A Winter Evening'],
  returning: () => ['Side A has finished', 'The arm lifts off and parks itself.'],
  station: () => ['The side is over. The topper keeps playing.', `${STATIONS[s.topper].name}, stored on the topper. No subscription.`],
};

function setPhase(phase) {
  s.phase = phase;
  ui.now.hidden = phase === 'idle';
  ui.now.dataset.phase = phase;
  if (phase === 'idle') return;
  [ui.title.textContent, ui.sub.textContent] = COPY[phase]();
  ui.action.hidden = !(phase === 'side' || phase === 'station');
  ui.action.textContent = phase === 'side' ? 'End the side now' : 'Start again';
}

// Each step of the story waits, then carries on only if nothing newer has started since.
let step = 0;
async function pause(seconds) {
  const mine = step;
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  return mine === step;
}

function showView() {
  ui.view.textContent = stage.view === 'close' ? 'Show the whole player' : 'Show the close-up';
}
stage.onLive = (live) => {
  ui.tools.hidden = !live;
  showView();
};

async function playSide() {
  step++;
  setPhase('side');
  if (await pause(audio.startSide())) endSide();
}

// The side ends: the picture shows the arm lifting off and the display changing over, and the
// topper's own music starts at the moment the display changes.
async function endSide() {
  if (s.phase !== 'side') return;
  const mine = ++step;
  setPhase('returning');
  audio.stopSide();
  await stage.finish(s.topper, () => {
    if (mine !== step) return;
    audio.startStation(STATIONS[s.topper].songs);
    setPhase('station');
  });
  showView();
}

// Starting again places the same topper afresh and plays the side from the top.
function startAgain() {
  if (s.phase !== 'station') return;
  const id = s.topper;
  s.topper = null;
  choose(id);
}

// Putting a topper on the record always starts the side again, whichever topper was there before.
async function choose(id) {
  if (id === s.topper || !READY.has(id)) return;
  const mine = ++step;
  s.topper = id;
  const topper = TOPPERS[id];
  picks.forEach((pick) => pick.setAttribute('aria-pressed', String(pick.dataset.topper === id)));
  ui.label.textContent = `On the record: ${topper.name}`;
  ui.line.textContent = topper.line;

  audio.ensure();
  audio.stopSide();
  audio.stopStation();
  setPhase('placing');
  // On a narrow screen the picture is at the top of the page: go back up to it if it has been scrolled away.
  if (stacked.matches && el('stage').getBoundingClientRect().top < 0) {
    el('top').scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  await stage.place(id);
  if (mine === step) playSide();
}

picks.forEach((pick) => pick.addEventListener('click', () => choose(pick.dataset.topper)));
ui.view.addEventListener('click', async () => {
  await stage.setView(s.topper, stage.view === 'close' ? 'wide' : 'close');
  showView();
});
ui.action.addEventListener('click', () => (s.phase === 'side' ? endSide() : startAgain()));
ui.mute.addEventListener('click', () => {
  const muted = !audio.muted;
  audio.setMuted(muted);
  ui.mute.textContent = muted ? 'Sound off' : 'Sound on';
  ui.mute.setAttribute('aria-pressed', String(muted));
});

// Handy when checking the page by hand.
window.__roundabout = { state: s, stage, choose, endSide };

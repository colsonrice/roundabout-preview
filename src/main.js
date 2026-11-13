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
const READY = new Set(['reindeer', 'cabin', 'nativity', 'jazz', 'hotel', 'orrery', 'city', 'nutcracker']);

const audio = new MusicBox();
const el = (id) => document.getElementById(id);
const ui = {
  label: el('chooser-label'), line: el('chooser-line'), hint: el('stage-hint'), view: el('view'),
  now: el('now'), title: el('now-title'), sub: el('now-sub'), mute: el('mute'), cta: el('cta'),
};
const picks = Array.from(document.querySelectorAll('.pick'));
picks.forEach((pick) => { pick.disabled = !READY.has(pick.dataset.topper); });
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const stacked = window.matchMedia('(max-aspect-ratio: 5/4)'); // narrow screens: the picture sits above the words
const stage = new Stage(el('stage'), { reduceMotion });

// phase: idle, placing, side, returning, station
const s = { phase: 'idle', topper: null };

// What the story strip says at each step: a headline and a smaller line under it.
const COPY = {
  idle: () => ['Place a topper to start the record', 'About 15 seconds, with sound.'],
  placing: () => [`Placing the ${TOPPERS[s.topper].name}`, 'The record starts turning.'],
  side: () => ['Playing side A from the record', 'A Winter Evening'],
  returning: () => ['Side A is over', 'The arm lifts off and parks itself.'],
  station: () => ['The side is over. The topper plays on.', `${STATIONS[s.topper].name}, stored on the topper.`],
};
const LABEL = {
  idle: () => 'Choose a topper to place it. Plays with sound.',
  station: () => 'Try another topper',
};

function setPhase(phase) {
  s.phase = phase;
  ui.now.dataset.phase = phase;
  [ui.title.textContent, ui.sub.textContent] = COPY[phase]();
  ui.label.textContent = (LABEL[phase] || (() => `On the record: ${TOPPERS[s.topper].name}`))();
  picks.forEach((pick) => {
    pick.setAttribute('aria-pressed', String(pick.dataset.topper === s.topper));
    pick.classList.toggle('is-placing', phase === 'placing' && pick.dataset.topper === s.topper);
  });
  // Once the topper has taken over, joining the waitlist becomes the main thing to do, and stays so.
  if (phase === 'station') ui.cta.classList.replace('btn-ghost', 'btn-primary');
  // The tiles hold still while the story runs, so the eye stays on the picture.
  tiles.run(phase === 'idle' || phase === 'station');
}

// The chooser tiles: each ready topper turns in a small silent loop laid over its still picture.
// A tile keeps its still if the loop is missing, or if the phone will not play it unasked.
const tiles = {
  clips: [],
  running: true,
  start() {
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    const seen = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        target.dataset.seen = isIntersecting ? '1' : '';
        this.sync(target);
      });
    }, { threshold: 0.25 });
    picks.filter((pick) => READY.has(pick.dataset.topper)).forEach((pick) => {
      const clip = document.createElement('video');
      clip.className = 'pick-clip';
      clip.muted = true;
      clip.loop = true;
      clip.playsInline = true;
      clip.preload = 'none';
      clip.tabIndex = -1;
      clip.setAttribute('aria-hidden', 'true');
      clip.src = `assets/tile-${pick.dataset.topper}.mp4`;
      clip.addEventListener('playing', () => clip.classList.add('is-on'), { once: true });
      clip.addEventListener('error', () => {
        seen.unobserve(clip);
        this.clips.splice(this.clips.indexOf(clip), 1);
        clip.remove();
      });
      pick.prepend(clip);
      this.clips.push(clip);
      seen.observe(clip);
    });
  },
  sync(clip) {
    if (this.running && clip.dataset.seen) clip.play().catch(() => {});
    else clip.pause();
  },
  run(running) {
    this.running = running;
    this.clips.forEach((clip) => this.sync(clip));
  },
};

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
  ui.hint.hidden = !live;
  ui.view.hidden = !live;
  showView();
};

// The side is short, and ends by itself.
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
  const handover = () => {
    if (mine !== step || s.phase === 'station') return;
    audio.startStation(STATIONS[s.topper].songs);
    setPhase('station');
  };
  try {
    await stage.finish(s.topper, handover);
  } catch {
    handover(); // the ending clip did not load: the music still hands over
  }
  showView();
}

// Under the tiles: a word about the chosen topper, or, before one is chosen, about those still to come.
const IDLE_LINE = READY.size < picks.length ? 'The toppers marked “soon” are still being made.' : '';
ui.line.textContent = IDLE_LINE;

// Back to the start, when a topper's clip cannot be fetched.
function giveUp() {
  stage.reset();
  s.topper = null;
  setPhase('idle');
  ui.line.textContent = IDLE_LINE;
  ui.title.textContent = 'That topper did not load. Choose it again.';
  ui.sub.textContent = 'If it keeps happening, check your connection.';
}

// Putting a topper on the record always starts the side again, whichever topper was there before.
// Once the story has finished, choosing the same topper plays it again.
async function choose(id) {
  if (!READY.has(id) || (id === s.topper && s.phase !== 'station')) return;
  const mine = ++step;
  s.topper = id;
  ui.line.textContent = TOPPERS[id].line;

  audio.ensure();
  audio.stopSide();
  audio.stopStation();
  setPhase('placing');
  // On a narrow screen the picture is at the top of the page: go back up to it if it has been scrolled away.
  if (stacked.matches && el('stage').getBoundingClientRect().top < 0) {
    el('top').scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  try {
    await stage.place(id);
  } catch {
    if (mine === step) giveUp();
    return;
  }
  if (mine === step) playSide();
}

picks.forEach((pick) => {
  pick.addEventListener('click', () => choose(pick.dataset.topper));
  // Start fetching a topper's placing clip as soon as the pointer or the keyboard reaches its tile.
  const warm = () => { if (READY.has(pick.dataset.topper) && pick.dataset.topper !== s.topper) stage.warm(pick.dataset.topper); };
  pick.addEventListener('pointerenter', warm);
  pick.addEventListener('focus', warm);
});
ui.view.addEventListener('click', async () => {
  await stage.setView(s.topper, stage.view === 'close' ? 'wide' : 'close');
  showView();
});
ui.mute.addEventListener('click', () => {
  const muted = !audio.muted;
  audio.setMuted(muted);
  ui.mute.setAttribute('aria-pressed', String(muted));
  ui.mute.title = muted ? 'Sound is off' : 'Sound is on';
});
tiles.start();

// Handy when checking the page by hand.
window.__roundabout = { state: s, stage, choose, endSide };

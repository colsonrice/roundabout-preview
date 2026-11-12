// The picture in the hero: pre-rendered clips, layered so one can take over from another
// without a flash, and a looping clip that can be turned by hand.
//
// Each topper has these clips, all rendered from the same scene:
//   place-<id>.mp4       the topper arrives, the record spins up, the arm goes on, the camera pushes in
//   close-<id>.mp4       one turn of the record seen close up, looping, while the side plays
//   wide-<id>.mp4        the same turn seen with the whole player in view
//   end-<id>.mp4         the side ends: the arm lifts off and parks, the display changes to the topper
//   close-rest-<id>.mp4  the loops again, with the arm parked and the display on the topper
//   wide-rest-<id>.mp4
// Every clip starts and ends at the same point in the record's turn, so they join without a seam
// and the view can change mid-turn.

const TURN_SECONDS = 1.8; // one turn of the record
// How far a drag turns the record: dragging this share of the picture's width is 1/pi of a turn.
// Half the width the topper's base really spans, so a short drag turns it a good way.
const BASE_SPAN = { close: 0.25, wide: 0.15 };
const HANDOVER_SECONDS = 2.0; // how far into the end clip the display changes over to the topper

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ended = (video) => new Promise((resolve) => video.addEventListener('ended', resolve, { once: true }));

const LOAD_SECONDS = 20; // how long to wait for a clip before giving up on it

// Resolves once a clip has a frame to show; fails if it cannot be fetched or takes too long.
const ready = (video) =>
  new Promise((resolve, reject) => {
    if (video.readyState >= 2) return resolve();
    if (video.error) return reject(new Error('clip failed to load'));
    const done = (act) => () => {
      clearTimeout(timer);
      video.removeEventListener('loadeddata', loaded);
      video.removeEventListener('error', failed);
      act();
    };
    const loaded = done(resolve);
    const failed = done(() => reject(new Error('clip failed to load')));
    const timer = setTimeout(failed, LOAD_SECONDS * 1000);
    video.addEventListener('loadeddata', loaded);
    video.addEventListener('error', failed);
  });

export class Stage {
  constructor(root, { reduceMotion = false } = {}) {
    this.root = root;
    this.reduceMotion = reduceMotion;
    this.clips = Array.from(root.querySelectorAll('.stage-clip'));
    this.front = null;   // the clip on show
    this.job = 0;        // goes up whenever something new is asked for, so stale steps can stop
    this.view = 'close';
    this.live = false;   // true while a loop is on show and can be turned by hand
    this.parked = false; // true once the side has ended and the arm is back on its rest
    this.onLive = () => {};
    this.cache = new Map(); // loop clips already fetched, by address
    this._drag();
  }

  _back() {
    return this.clips.find((clip) => clip !== this.front);
  }

  // Loops are fetched whole and played from memory. That makes every frame reachable at once when
  // the record is turned by hand, whether or not the server can send parts of a file on request.
  _whole(src) {
    if (!this.cache.has(src)) {
      this.cache.set(src, fetch(src).then((reply) => {
        if (!reply.ok) throw new Error(`${src}: ${reply.status}`);
        return reply.blob();
      }).then((blob) => URL.createObjectURL(blob)).catch((error) => {
        this.cache.delete(src); // so that asking again tries again
        throw error;
      }));
    }
    return this.cache.get(src);
  }

  async _load(video, src, loop) {
    video.loop = loop;
    try {
      if (video.dataset.src !== src) {
        video.dataset.src = src;
        const from = loop ? await this._whole(src) : src;
        if (video.dataset.src !== src) return; // something newer was asked for meanwhile
        video.preload = 'auto';
        video.src = from;
        video.load();
      }
      await ready(video);
    } catch (error) {
      if (video.dataset.src === src) delete video.dataset.src; // so that asking again tries again
      throw error;
    }
  }

  // Start fetching a topper's placing clip before it is asked for, into the clip that is not on show.
  warm(id) {
    if (this.reduceMotion || (this.front && !this.live)) return;
    const clip = this._back() || this.clips[0];
    if (clip.classList.contains('is-on')) return; // still fading out from the last change
    this._load(clip, `assets/place-${id}.mp4`, false).catch(() => {});
  }

  // Back to the still picture of the player on its own.
  reset() {
    this.job++;
    this.clips.forEach((clip) => {
      clip.pause();
      clip.classList.remove('is-on', 'fade');
    });
    this.front = null;
    this.parked = false;
    this.view = 'close';
    this._setLive(false);
  }

  _bring(video, fade) {
    const old = this.front;
    video.classList.toggle('fade', fade);
    video.style.zIndex = 2;
    video.classList.add('is-on');
    if (old && old !== video) {
      old.style.zIndex = 1;
      // Leave the old clip under the new one until the new one is fully opaque.
      setTimeout(() => {
        if (this.front !== old) {
          old.classList.remove('is-on', 'fade');
          old.pause();
        }
      }, fade ? 400 : 0);
    }
    this.front = video;
  }

  _setLive(live) {
    this.live = live;
    this.root.classList.toggle('is-live', live);
    this.onLive(live);
  }

  _loopFile(id, view) {
    return `assets/${view}${this.parked ? '-rest' : ''}-${id}.mp4`;
  }

  // Resolves when a looping clip comes round to the start of its turn.
  _comesRound(video) {
    return new Promise((resolve) => {
      let last = video.currentTime;
      const tick = () => {
        const now = video.currentTime;
        if (now < last) resolve();
        else {
          last = now;
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
      setTimeout(resolve, (TURN_SECONDS + 0.4) * 1000); // in case the page is not being drawn
    });
  }

  // Play a topper's placing clip, then hand over to its close loop.
  async place(id) {
    const job = ++this.job;
    this._setLive(false);
    this.parked = false;
    this.view = 'close';
    if (this.reduceMotion) return this._loop(id, 'close', 0, job, true);

    const clip = this._back() || this.clips[0];
    await this._load(clip, `assets/place-${id}.mp4`, false);
    if (job !== this.job) return false;
    clip.currentTime = 0;
    this._bring(clip, true);
    clip.play().catch(() => {});

    // Get the loop ready underneath while the placing clip plays.
    const next = this._back();
    const loaded = this._load(next, this._loopFile(id, 'close'), true).then(() => { next.currentTime = 0; });
    await ended(clip);
    await loaded;
    if (job !== this.job) return false;
    this._bring(next, false);
    next.play().catch(() => {});
    this._setLive(true);
    return true;
  }

  async _loop(id, view, time, job, fade) {
    const clip = this._back() || this.clips[0];
    await this._load(clip, this._loopFile(id, view), true);
    if (job !== this.job) return false;
    clip.currentTime = time;
    this._bring(clip, fade);
    if (!this.reduceMotion) clip.play().catch(() => {});
    this.view = view;
    this._setLive(true);
    return true;
  }

  // The side ends. With the whole player in view, the arm lifts off and parks and the display
  // changes to the topper, while the record keeps turning. `onHandover` is called at the moment
  // the display changes.
  async finish(id, onHandover = () => {}) {
    const job = ++this.job;
    if (this.reduceMotion) {
      this.parked = true;
      onHandover();
      return this._loop(id, 'wide', this.front ? this.front.currentTime % TURN_SECONDS : 0, job, true);
    }
    if (this.view !== 'wide') {
      if (!(await this._loop(id, 'wide', this.front.currentTime % TURN_SECONDS, job, true))) return false;
      await wait(450); // let the change of view finish before the other clip is reused
      if (job !== this.job) return false;
    }
    this._setLive(false);
    const loop = this.front;
    loop.play().catch(() => {}); // in case it was being held still by a drag
    const clip = this._back();
    await this._load(clip, `assets/end-${id}.mp4`, false);
    if (job !== this.job) return false;
    await this._comesRound(loop);
    if (job !== this.job) return false;
    clip.currentTime = loop.currentTime % TURN_SECONDS; // both are at the start of a turn, give or take a frame
    this._bring(clip, false);
    clip.play().catch(() => {});

    const done = ended(clip);
    const handover = new Promise((resolve) => {
      const check = () => {
        if (clip.currentTime >= HANDOVER_SECONDS || clip.ended) {
          clip.removeEventListener('timeupdate', check);
          resolve();
        }
      };
      clip.addEventListener('timeupdate', check);
      done.then(resolve);
    });
    await handover;
    if (job !== this.job) return false;
    this.parked = true;
    onHandover();

    // Get the parked-arm loop ready underneath while the rest of the clip plays.
    const next = this._back();
    const loaded = this._load(next, this._loopFile(id, 'wide'), true).then(() => { next.currentTime = 0; });
    await done;
    await loaded;
    if (job !== this.job) return false;
    this._bring(next, false);
    next.play().catch(() => {});
    this.view = 'wide';
    this._setLive(true);
    return true;
  }

  // Change between the close-up and the whole player, keeping the record where it is in its turn.
  setView(id, view) {
    if (!this.live || view === this.view) return Promise.resolve(false);
    return this._loop(id, view, this.front.currentTime % TURN_SECONDS, ++this.job, true);
  }

  // Drag sideways to turn the record by hand; let go and it carries on turning.
  _drag() {
    const root = this.root;
    let from = null;
    const secondsPerPixel = () => {
      const box = root.getBoundingClientRect();
      const pictureWidth = Math.max(box.width, (box.height * 16) / 9); // the clip is scaled to cover the stage
      return TURN_SECONDS / (Math.PI * BASE_SPAN[this.view] * pictureWidth);
    };
    root.addEventListener('pointerdown', (event) => {
      if (!this.live || event.button > 0 || event.target.closest('button')) return;
      from = { x: event.clientX, time: this.front.currentTime, rate: secondsPerPixel(), id: event.pointerId };
      this.front.pause();
      root.setPointerCapture(event.pointerId);
      root.classList.add('is-turning');
    });
    root.addEventListener('pointermove', (event) => {
      if (!from || event.pointerId !== from.id) return;
      // The record turns clockwise, so its near side moves right to left as time runs forward.
      const time = from.time - (event.clientX - from.x) * from.rate;
      this.front.currentTime = ((time % TURN_SECONDS) + TURN_SECONDS) % TURN_SECONDS;
    });
    const release = (event) => {
      if (!from || event.pointerId !== from.id) return;
      from = null;
      root.classList.remove('is-turning');
      if (this.live && !this.reduceMotion) this.front.play().catch(() => {});
    };
    root.addEventListener('pointerup', release);
    root.addEventListener('pointercancel', release);
    // A mouse would otherwise pick the still picture up as an image to drag away, which ends the turn.
    root.addEventListener('dragstart', (event) => event.preventDefault());
  }
}

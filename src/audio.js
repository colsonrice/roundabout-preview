import { SIDE, STATION } from './songs.js';

// A music box built from sine partials. The "record" path adds crackle and rolls off the
// highs; the "station" path is clean with a light echo, so the handover is audible.

function makeCrackle(ctx) {
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    d[i] += (Math.random() * 2 - 1) * 0.012;
    if (Math.random() < 0.0006) {
      const a = (Math.random() * 0.6 + 0.15) * (Math.random() < 0.5 ? -1 : 1);
      for (let k = 0; k < 30 && i + k < len; k++) d[i + k] += a * Math.exp(-k / 5);
    }
  }
  return buf;
}

const PARTIALS = [[1, 1], [2, 0.35], [4.1, 0.1]];

export class MusicBox {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.side = null;
    this.station = null;
    this.stationTimer = null;
    this.stationIndex = 0;
    this.crackle = null;
  }

  ensure() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    this.recordBus = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3600;
    this.recordBus.connect(lp).connect(this.master);

    this.crackleGain = ctx.createGain();
    this.crackleGain.gain.value = 0;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    this.crackleGain.connect(hp).connect(this.master);
    this.crackleBuffer = makeCrackle(ctx);

    this.stationBus = ctx.createGain();
    this.stationBus.connect(this.master);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.27;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.3;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    this.stationBus.connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(wet).connect(this.master);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  _play(song, bus, lead) {
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.connect(bus);
    const t0 = ctx.currentTime + lead;
    const oscs = [];
    for (const n of song.notes) {
      const f = 440 * 2 ** ((n.midi - 69) / 12);
      const t = t0 + n.time;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(n.vel * 0.24, t + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, t + n.dur);
      env.connect(out);
      for (const [mult, amp] of PARTIALS) {
        const osc = ctx.createOscillator();
        osc.frequency.value = f * mult;
        const g = ctx.createGain();
        g.gain.value = amp;
        osc.connect(g).connect(env);
        osc.start(t);
        osc.stop(t + n.dur + 0.05);
        oscs.push(osc);
      }
    }
    return {
      stop(fade = 0.5) {
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.linearRampToValueAtTime(0, t + fade);
        for (const o of oscs) {
          try { o.stop(t + fade + 0.05); } catch { /* already ended */ }
        }
      },
    };
  }

  // Starts the record side and returns how long it lasts, in seconds.
  startSide() {
    this.ensure();
    const ctx = this.ctx;
    const lead = 1.0;
    this.crackle = ctx.createBufferSource();
    this.crackle.buffer = this.crackleBuffer;
    this.crackle.loop = true;
    this.crackle.connect(this.crackleGain);
    this.crackle.start();
    this.crackleGain.gain.setTargetAtTime(0.5, ctx.currentTime, 0.1);
    this.side = this._play(SIDE, this.recordBus, lead);
    return SIDE.duration + lead;
  }

  stopSide() {
    if (!this.ctx) return;
    this.side?.stop(0.25);
    this.side = null;
    this.crackleGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    const src = this.crackle;
    this.crackle = null;
    if (src) setTimeout(() => { try { src.stop(); } catch { /* already stopped */ } }, 600);
  }

  startStation() {
    this.ensure();
    const next = () => {
      const song = STATION[this.stationIndex % STATION.length];
      this.stationIndex++;
      this.station = this._play(song, this.stationBus, 0.3);
      this.stationTimer = setTimeout(next, (song.duration + 1.2) * 1000);
    };
    next();
  }

  stopStation() {
    clearTimeout(this.stationTimer);
    this.stationTimer = null;
    this.station?.stop(0.5);
    this.station = null;
  }
}

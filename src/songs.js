// Public-domain melodies, written out by hand as "Note:beats" and turned into timed notes.

const SEMITONE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const CHORD = { C: [60, 64, 67], F: [53, 57, 60], G: [55, 59, 62], D: [50, 54, 57] };

function toMidi(name) {
  const m = name.match(/^([A-G]#?)(\d)$/);
  return 12 * (Number(m[2]) + 1) + SEMITONE[m[1]];
}

function build({ title, melody, chords, beatsPerBar, bpm, transpose = 12 }) {
  const spb = 60 / bpm;
  const notes = [];
  let beat = 0;
  for (const token of melody.trim().split(/\s+/)) {
    const [name, len] = token.split(':');
    const beats = Number(len);
    if (name !== '-') {
      notes.push({ midi: toMidi(name) + transpose, time: beat * spb, vel: 0.9, dur: Math.max(1.3, beats * spb * 1.6) });
    }
    beat += beats;
  }
  chords.forEach((name, bar) => {
    const tones = CHORD[name];
    for (let b = 0; b < beatsPerBar; b++) {
      const tone = b === 0 ? tones[0] : tones[1 + ((b - 1) % 2)];
      notes.push({ midi: tone, time: (bar * beatsPerBar + b) * spb, vel: b === 0 ? 0.5 : 0.26, dur: 1.6 });
    }
  });
  return { title, notes, duration: chords.length * beatsPerBar * spb };
}

export const SIDE = build({
  title: 'Silent Night',
  bpm: 108,
  beatsPerBar: 3,
  melody: `
    G4:1.5 A4:.5 G4:1  E4:3  G4:1.5 A4:.5 G4:1  E4:3
    D5:2 D5:1  B4:3  C5:2 C5:1  G4:3
    A4:2 A4:1  C5:1.5 B4:.5 A4:1  G4:1.5 A4:.5 G4:1  E4:3
    A4:2 A4:1  C5:1.5 B4:.5 A4:1  G4:1.5 A4:.5 G4:1  E4:3
    D5:2 D5:1  F5:1.5 D5:.5 B4:1  C5:3  E5:3
    C5:1 G4:1 E4:1  G4:1.5 F4:.5 D4:1  C4:3  -:3`,
  chords: ['C', 'C', 'C', 'C', 'G', 'G', 'C', 'C', 'F', 'F', 'C', 'C', 'F', 'F', 'C', 'C', 'G', 'G', 'C', 'C', 'C', 'G', 'C', 'C'],
});

const DECK = build({
  title: 'Deck the Halls',
  bpm: 132,
  beatsPerBar: 4,
  melody: `
    G4:1.5 F4:.5 E4:1 D4:1  C4:1 D4:1 E4:1 C4:1  D4:.5 E4:.5 F4:.5 D4:.5 E4:1.5 D4:.5  C4:1 B3:1 C4:2
    G4:1.5 F4:.5 E4:1 D4:1  C4:1 D4:1 E4:1 C4:1  D4:.5 E4:.5 F4:.5 D4:.5 E4:1.5 D4:.5  C4:1 B3:1 C4:2
    D4:1.5 E4:.5 F4:1 D4:1  E4:1.5 F4:.5 G4:1 D4:1  E4:.5 F#4:.5 G4:1 A4:.5 B4:.5 C5:1  B4:1 A4:1 G4:2
    G4:1.5 F4:.5 E4:1 D4:1  C4:1 D4:1 E4:1 C4:1  A4:.5 A4:.5 A4:.5 A4:.5 G4:1.5 F4:.5  E4:1 D4:1 C4:2`,
  chords: ['C', 'C', 'G', 'C', 'C', 'C', 'G', 'C', 'G', 'C', 'D', 'G', 'C', 'C', 'F', 'C'],
});

const JINGLE = build({
  title: 'Jingle Bells',
  bpm: 150,
  beatsPerBar: 4,
  melody: `
    E4:1 E4:1 E4:2  E4:1 E4:1 E4:2  E4:1 G4:1 C4:1.5 D4:.5  E4:4
    F4:1 F4:1 F4:1.5 F4:.5  F4:1 E4:1 E4:1 E4:.5 E4:.5  E4:1 D4:1 D4:1 E4:1  D4:2 G4:2
    E4:1 E4:1 E4:2  E4:1 E4:1 E4:2  E4:1 G4:1 C4:1.5 D4:.5  E4:4
    F4:1 F4:1 F4:1.5 F4:.5  F4:1 E4:1 E4:1 E4:.5 E4:.5  G4:1 G4:1 F4:1 D4:1  C4:4`,
  chords: ['C', 'C', 'C', 'C', 'F', 'C', 'D', 'G', 'C', 'C', 'C', 'C', 'F', 'C', 'G', 'C'],
});

export const STATION = [DECK, JINGLE];

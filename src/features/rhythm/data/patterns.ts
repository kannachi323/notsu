/** Beat positions: one beat is a quarter note. Fractions stay exact until conversion to ms. */
export type Phrase = { taps: number[]; holds: [number, number][] };

// Short authored cells, not random generation. Each resolves on the following beat.
const triplets = (at: number) => [at, at + 1 / 3, at + 2 / 3];
const sixteenths = (at: number) => [at, at + .25, at + .5, at + .75];

// Preserve the original gentle ten-second introduction independently of the song.
export const basicPhrases: Phrase[] = [
  { taps: [4, 5, 6, 7, 8, 9, 10, 11, 14, 15], holds: [[12, 13.5]] },
  { taps: [0, 1, 2, 2.5, 3, 4, 5, 6, 7, 10, 11, 12, 12.5, 13, 14, 15], holds: [[8, 9.5]] },
];

// Eight 16-beat phrases. Fast cells land during stable poses (beats 0–12);
// simpler dotted/quarter responses leave room to read the four-beat lane glide.
// These are an original beat-grid challenge, not a transcription of the recording.
export const songPhrases: Phrase[] = [
  // Establish the pulse, then introduce alternating eighths.
  { taps: [4, 5, 6, 7, 8, 8.5, 9, 9.5, 10, 11, 14, 15], holds: [[12, 13.5]] },
  // Dotted quarters, a four-note roll, then independent hold/tap input.
  { taps: [0, 1.5, 3, ...sixteenths(4), 5, 5.5, 6, 7, 8.5, 9, 9.5, 11, 12, 13.5, 15], holds: [[8, 10]] },
  // Triplet call, straight-sixteenth answer; rests separate the two feels.
  { taps: [...triplets(0), ...triplets(1), 2, 3, ...sixteenths(4), ...sixteenths(5), 6, 8.5, 9, 9.5, 10, 12, 13, 14.5, 15.5], holds: [[8, 11]] },
  // Dotted-eighth syncopation and a triplet pickup.
  { taps: [0, .75, 1.5, 2.25, 3, 3.5, ...triplets(4), 5, 6, 7, 8.5, 9, 10, 11.5, 13, 14.5], holds: [[8, 9.5]] },
  // Breathing room: long/short answers, not a continuous stream.
  { taps: [0, 1.5, 3, 4.5, 6, 7, 9, 10.5, 11.25, 13, 14, 15], holds: [[8, 12]] },
  // Return to the opening roll and triplet motif with hold independence.
  { taps: [...sixteenths(0), 1, 2, 3, ...triplets(4), ...triplets(5), 6, 8.5, 9, 9.5, 10, 12, 13.5, 15], holds: [[8, 11]] },
  // Eight-note alternating burst, recovery, then syncopated dotted eighths.
  { taps: [...sixteenths(0), ...sixteenths(1), 2.5, 3, 4, 4.75, 5.5, 6.25, 7, 8.5, 9, 9.5, 11, 12, 13, 14, 15], holds: [[8, 10]] },
  // Recap both subdivisions, with triplets against a held key and a clear finish.
  { taps: [...triplets(0), ...triplets(1), 2, 3, ...sixteenths(4), ...sixteenths(5), 6, ...triplets(9), 10, 12, 13.5, 15], holds: [[8, 11]] },
];

// Four phrases at a gentler 144 BPM. Synthesized note cues make every authored
// rhythm audible, without claiming tuplets occur in the licensed song itself.
export const drillPhrases: Phrase[] = [
  // Count 1, 2, 3, 4, then feel the 1.5-beat dotted-quarter spacing.
  { taps: [4, 5, 6, 7, 8, 9.5, 11, 12.5, 14, 15], holds: [] },
  // Three evenly spaced attacks per beat, then a straight-eighth response.
  { taps: [...triplets(0), ...triplets(1), 2, 4, 4.5, 5, 5.5, 6, ...triplets(8), ...triplets(9), 10, 12, 13.5, 15], holds: [] },
  // Four then eight sixteenths. Alternate hands; recover between bursts.
  { taps: [...sixteenths(0), 1, 3, ...sixteenths(4), ...sixteenths(5), 6, 8, 8.75, 9.5, 10.25, 11, 12, 13.5, 15], holds: [] },
  // Keep one key down while the other hand plays a simple response, then triplets.
  { taps: [1, 1.5, 2, 2.5, 3, 4.5, 6, ...triplets(9), 10, 10.5, 11, 12, 13.5, 15], holds: [[0, 4], [8, 11.5]] },
];

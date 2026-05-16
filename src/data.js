export const defaultPlayers = ['Joel', 'Zach'];

export const initialHoles = [
  { hole: 1, par: 4, tee: 'fairway', gir: false, approachMiss: 'left bunker', upAndDown: false, putts: 2, firstPuttFt: 12, score: 5 },
  { hole: 2, par: 5, tee: 'rough_right', gir: true, approachMiss: 'none', upAndDown: false, putts: 2, firstPuttFt: 28, score: 5 },
  { hole: 3, par: 3, tee: 'n/a', gir: false, approachMiss: 'short', upAndDown: true, putts: 1, firstPuttFt: 4, score: 3 },
  { hole: 4, par: 4, tee: 'fairway', gir: true, approachMiss: 'none', upAndDown: false, putts: 2, firstPuttFt: 18, score: 4 },
  { hole: 5, par: 4, tee: 'unknown_miss', gir: false, approachMiss: 'right', upAndDown: false, putts: 2, firstPuttFt: 20, score: 5 },
  { hole: 6, par: 5, tee: 'fairway', gir: false, approachMiss: 'short', upAndDown: true, putts: 1, firstPuttFt: 6, score: 4 },
  { hole: 7, par: 4, tee: 'rough_left', gir: false, approachMiss: 'left bunker', upAndDown: false, putts: 2, firstPuttFt: 10, score: 5 },
  { hole: 8, par: 3, tee: 'n/a', gir: true, approachMiss: 'none', upAndDown: false, putts: 2, firstPuttFt: 22, score: 3 },
  { hole: 9, par: 4, tee: 'fairway', gir: false, approachMiss: 'short', upAndDown: true, putts: 1, firstPuttFt: 5, score: 4 },
  { hole: 10, par: 4, tee: 'rough_right', gir: false, approachMiss: 'long', upAndDown: false, putts: 2, firstPuttFt: 15, score: 5 },
  { hole: 11, par: 5, tee: 'fairway', gir: true, approachMiss: 'none', upAndDown: false, putts: 2, firstPuttFt: 30, score: 5 },
  { hole: 12, par: 4, tee: 'fairway', gir: false, approachMiss: 'short', upAndDown: false, putts: 3, firstPuttFt: null, score: 6 },
  { hole: 13, par: 4, tee: 'rough_left', gir: false, approachMiss: 'right', upAndDown: true, putts: 1, firstPuttFt: 3, score: 4 },
  { hole: 14, par: 3, tee: 'n/a', gir: false, approachMiss: 'long', upAndDown: false, putts: 2, firstPuttFt: 14, score: 4 },
  { hole: 15, par: 5, tee: 'fairway', gir: true, approachMiss: 'none', upAndDown: false, putts: 2, firstPuttFt: 25, score: 5 },
  { hole: 16, par: 4, tee: 'hazard', gir: false, approachMiss: 'short', upAndDown: false, putts: 2, firstPuttFt: 11, score: 6 },
  { hole: 17, par: 4, tee: 'fairway', gir: true, approachMiss: 'none', upAndDown: false, putts: 2, firstPuttFt: 16, score: 4 },
  { hole: 18, par: 4, tee: 'rough_right', gir: false, approachMiss: 'left', upAndDown: false, putts: 2, firstPuttFt: 18, score: 5 }
];

export const initialClarifications = [
  {
    id: 1,
    hole: 5,
    field: 'tee',
    question: 'Hole 5: you missed the fairway. Which side did you miss on?',
    value: '',
    options: ['rough_left', 'rough_right', 'bunker', 'hazard']
  },
  {
    id: 2,
    hole: 12,
    field: 'firstPuttFt',
    question: 'Hole 12: how long was your first putt?',
    value: '',
    options: ['6', '10', '15', '20', '25']
  }
];

export const historicalRounds = [
  {
    id: 1,
    date: '2026-04-10',
    course: 'Rondebosch',
    tees: 'Yellow',
    player: 'Joel',
    fairwaysPct: 57,
    girPct: 39,
    putts: 32,
    penalties: 1,
    toPar: 7,
    upAndDownPct: 33
  },
  {
    id: 2,
    date: '2026-04-03',
    course: 'Rondebosch',
    tees: 'Yellow',
    player: 'Joel',
    fairwaysPct: 43,
    girPct: 28,
    putts: 34,
    penalties: 2,
    toPar: 11,
    upAndDownPct: 22
  },
  {
    id: 3,
    date: '2026-03-29',
    course: 'Westlake',
    tees: 'White',
    player: 'Zach',
    fairwaysPct: 50,
    girPct: 33,
    putts: 31,
    penalties: 0,
    toPar: 5,
    upAndDownPct: 40
  }
];

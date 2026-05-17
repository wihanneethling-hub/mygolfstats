import React, { useEffect, useMemo, useRef, useState } from 'react';
import VoiceRecorder from './components/VoiceRecorder';
import { starterCourseLayouts } from './courseData';
import { initialClarifications, initialHoles } from './data';
import { clearState, loadState, saveState } from './storage';
import { average, buildSavedRound, calcStatsFromHoles, formatToPar } from './utils';
import HoleEditor from './components/HoleEditor';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, MiniBar, StatCard, TabButton, Textarea } from './components/UI';

const TEE_OPTIONS = ['Yellow', 'White', 'Red'];

function mergeCourseLayouts(customCourseLayouts = {}) {
  return {
    ...starterCourseLayouts,
    ...Object.fromEntries(
      Object.entries(customCourseLayouts).map(([courseName, tees]) => [
        courseName,
        {
          ...(starterCourseLayouts[courseName] || {}),
          ...tees
        }
      ])
    )
  };
}

function normalizeLookupValue(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveCourseName(courseLayouts, course) {
  const normalizedCourse = normalizeLookupValue(course);
  if (!normalizedCourse) return '';

  const courseNames = Object.keys(courseLayouts || {});
  const exactMatch = courseNames.find((courseName) => normalizeLookupValue(courseName) === normalizedCourse);
  if (exactMatch) return exactMatch;

  const partialMatches = courseNames.filter((courseName) => normalizeLookupValue(courseName).includes(normalizedCourse));
  return partialMatches.length === 1 ? partialMatches[0] : course;
}

function getCourseLayoutEntry(courseLayouts, course) {
  const resolvedCourse = resolveCourseName(courseLayouts, course);
  const courseEntry = courseLayouts?.[resolvedCourse];
  if (!courseEntry) return null;

  if (courseEntry.parByHole) return courseEntry;

  const firstTeeLayout = Object.values(courseEntry).find((layout) => layout?.parByHole);
  return firstTeeLayout || null;
}

function getCourseLayout(courseLayouts, course, tees) {
  return getCourseLayoutEntry(courseLayouts, course);
}

function getCourseParByHole(courseLayouts, course, tees, holeNumber) {
  return getCourseLayout(courseLayouts, course, tees)?.parByHole?.[holeNumber - 1] || null;
}

function isDevelopmentMode() {
  return typeof import.meta !== 'undefined' && import.meta.env?.DEV;
}

function createDefaultParByHole() {
  return Array.from({ length: 18 }, (_, index) => initialHoles[index]?.par || 4);
}

function getPlayedCourseSuggestions(rounds = []) {
  return Array.from(new Set(rounds.map((round) => round.course).filter(Boolean))).sort();
}

function getPlayedTeeSuggestions(rounds = [], course) {
  return Array.from(
    new Set(rounds
      .filter((round) => !course || round.course === course)
      .map((round) => round.tees)
      .filter(Boolean))
  ).sort();
}

function downloadTextFile(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildRoundsCsv(rounds) {
  const headers = [
    'roundId',
    'date',
    'player',
    'course',
    'tees',
    'roundScore',
    'toPar',
    'fairwaysPct',
    'girPct',
    'roundPutts',
    'upAndDownPct',
    'hole',
    'par',
    'tee',
    'gir',
    'approachMiss',
    'upAndDown',
    'holePutts',
    'firstPuttFt',
    'holeScore'
  ];

  const rows = rounds.flatMap((round) => {
    const holes = round.holes?.length ? round.holes : [null];

    return holes.map((hole) => [
      round.id,
      round.date,
      round.player,
      round.course,
      round.tees,
      round.score,
      round.toPar,
      round.fairwaysPct,
      round.girPct,
      round.putts,
      round.upAndDownPct,
      hole?.hole,
      hole?.par,
      hole?.tee,
      hole?.gir,
      hole?.approachMiss,
      hole?.upAndDown,
      hole?.putts,
      hole?.firstPuttFt,
      hole?.score
    ]);
  });

  return [headers, ...rows].map((row) => row.map(csvValue).join(',')).join('\n');
}

function parseBoolean(value) {
  const normalized = String(value).trim().toLowerCase();
  return ['true', 'yes', 'y', '1'].includes(normalized);
}

function parseStructuredRound(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const holes = [];
  const errors = [];

  lines.forEach((line, index) => {
    const parts = line.split(',').map((part) => part.trim());
    if (parts.length !== 8) {
      errors.push(`Line ${index + 1}: expected 8 comma-separated values, got ${parts.length}.`);
      return;
    }

    const [
      holeRaw,
      parRaw,
      teeRaw,
      approachMissRaw,
      upAndDownRaw,
      puttsRaw,
      firstPuttFtRaw,
      scoreRaw
    ] = parts;

    const hole = Number(holeRaw);
    const par = Number(parRaw);
    const putts = Number(puttsRaw);
    const score = Number(scoreRaw);
    const firstPuttFt = firstPuttFtRaw === '' || firstPuttFtRaw.toLowerCase() === 'missing' || firstPuttFtRaw.toLowerCase() === 'null'
      ? null
      : Number(firstPuttFtRaw);

    if (!Number.isInteger(hole) || hole < 1 || hole > 18) {
      errors.push(`Line ${index + 1}: hole must be a number from 1 to 18.`);
      return;
    }
    if (![3, 4, 5].includes(par)) {
      errors.push(`Line ${index + 1}: par must be 3, 4, or 5.`);
      return;
    }
    if (!Number.isInteger(putts) || putts < 0 || putts > 6) {
      errors.push(`Line ${index + 1}: putts must be a whole number between 0 and 6.`);
      return;
    }
    if (!Number.isInteger(score) || score < 1 || score > 15) {
      errors.push(`Line ${index + 1}: score must be a whole number between 1 and 15.`);
      return;
    }
    if (firstPuttFt !== null && (!Number.isFinite(firstPuttFt) || firstPuttFt < 0 || firstPuttFt > 200)) {
      errors.push(`Line ${index + 1}: first putt feet must be blank or a number between 0 and 200.`);
      return;
    }

    const tee = teeRaw || 'n/a';
    const approachMiss = approachMissRaw || 'none';
    const upAndDown = parseBoolean(upAndDownRaw);
    const gir = approachMiss.toLowerCase() === 'none';

    holes.push({
      hole,
      par,
      tee,
      gir,
      approachMiss,
      upAndDown,
      putts,
      firstPuttFt,
      score
    });
  });

  const sortedHoles = [...holes].sort((a, b) => a.hole - b.hole);
  const uniqueHoleNumbers = new Set(sortedHoles.map((h) => h.hole));

  if (sortedHoles.length > 0 && sortedHoles.length !== uniqueHoleNumbers.size) {
    errors.push('Duplicate hole numbers found. Each hole should appear only once.');
  }

  return {
    holes: sortedHoles,
    errors
  };
}

function sampleStructuredRound() {
  return [
    '1,4,fairway,left bunker,false,2,12,5',
    '2,5,rough_right,none,false,2,28,5',
    '3,3,n/a,short,true,1,4,3',
    '4,4,fairway,none,false,2,18,4',
    '5,4,rough_left,right,false,2,20,5',
    '6,5,fairway,short,true,1,6,4',
    '7,4,rough_left,left bunker,false,2,10,5',
    '8,3,n/a,none,false,2,22,3',
    '9,4,fairway,short,true,1,5,4',
    '10,4,rough_right,long,false,2,15,5',
    '11,5,fairway,none,false,2,30,5',
    '12,4,fairway,short,false,3,18,6',
    '13,4,rough_left,right,true,1,3,4',
    '14,3,n/a,long,false,2,14,4',
    '15,5,fairway,none,false,2,25,5',
    '16,4,hazard,short,false,2,11,6',
    '17,4,fairway,none,false,2,16,4',
    '18,4,rough_right,left,false,2,18,5'
  ].join('\n');
}
function normalizeRecapText(text) {
  return text
    .toLowerCase()

    // hole numbers
    .replace(/\bfirst hole\b/g, 'hole 1')
    .replace(/\bsecond hole\b/g, 'hole 2')
    .replace(/\bthird hole\b/g, 'hole 3')
    .replace(/\bfourth hole\b/g, 'hole 4')
    .replace(/\bfifth hole\b/g, 'hole 5')
    .replace(/\bsixth hole\b/g, 'hole 6')
    .replace(/\bseventh hole\b/g, 'hole 7')
    .replace(/\beighth hole\b/g, 'hole 8')
    .replace(/\bninth hole\b/g, 'hole 9')
    .replace(/\btenth hole\b/g, 'hole 10')
    .replace(/\beleventh hole\b/g, 'hole 11')
    .replace(/\btwelfth hole\b/g, 'hole 12')
    .replace(/\bthirteenth hole\b/g, 'hole 13')
    .replace(/\bfourteenth hole\b/g, 'hole 14')
    .replace(/\bfifteenth hole\b/g, 'hole 15')
    .replace(/\bsixteenth hole\b/g, 'hole 16')
    .replace(/\bseventeenth hole\b/g, 'hole 17')
    .replace(/\beighteenth hole\b/g, 'hole 18')
    .replace(/\b1st hole\b/g, 'hole 1')
.replace(/\b2nd hole\b/g, 'hole 2')
.replace(/\b3rd hole\b/g, 'hole 3')
.replace(/\b4th hole\b/g, 'hole 4')
.replace(/\b5th hole\b/g, 'hole 5')
.replace(/\b6th hole\b/g, 'hole 6')
.replace(/\b7th hole\b/g, 'hole 7')
.replace(/\b8th hole\b/g, 'hole 8')
.replace(/\b9th hole\b/g, 'hole 9')
.replace(/\b10th hole\b/g, 'hole 10')
.replace(/\b11th hole\b/g, 'hole 11')
.replace(/\b12th hole\b/g, 'hole 12')
.replace(/\b13th hole\b/g, 'hole 13')
.replace(/\b14th hole\b/g, 'hole 14')
.replace(/\b15th hole\b/g, 'hole 15')
.replace(/\b16th hole\b/g, 'hole 16')
.replace(/\b17th hole\b/g, 'hole 17')
.replace(/\b18th hole\b/g, 'hole 18')

    // speech mistakes / common wording
    .replace(/\bwhole one\b/g, 'hole 1')
    .replace(/\bwhole two\b/g, 'hole 2')
    .replace(/\bwhole three\b/g, 'hole 3')
    .replace(/\bwhole four\b/g, 'hole 4')
    .replace(/\bwhole five\b/g, 'hole 5')
    .replace(/\bwhole six\b/g, 'hole 6')
    .replace(/\bwhole seven\b/g, 'hole 7')
    .replace(/\bwhole eight\b/g, 'hole 8')
    .replace(/\bwhole nine\b/g, 'hole 9')

    .replace(/\bpart three\b/g, 'par 3')
    .replace(/\bpart four\b/g, 'par 4')
    .replace(/\bpart five\b/g, 'par 5')
    .replace(/\bpar three\b/g, 'par 3')
    .replace(/\bpar four\b/g, 'par 4')
    .replace(/\bpar five\b/g, 'par 5')

    .replace(/\bone putt\b/g, '1 putt')
    .replace(/\btwo putts?\b/g, '2 putt')
    .replace(/\bthree putts?\b/g, '3 putt')
    .replace(/\bone-putted\b/g, '1 putt')
    .replace(/\btwo-putted\b/g, '2 putt')
    .replace(/\bthree-putted\b/g, '3 putt')
    .replace(/\beight feet\b/g, '8 feet')
    .replace(/\beight foot\b/g, '8 foot')
    .replace(/\beight ft\b/g, '8 ft')
    .replace(/\bten feet\b/g, '10 feet')
    .replace(/\bten foot\b/g, '10 foot')
    .replace(/\bten ft\b/g, '10 ft')
    .replace(/\bfifteen feet\b/g, '15 feet')
    .replace(/\bfifteen foot\b/g, '15 foot')
    .replace(/\bfifteen ft\b/g, '15 ft')
    .replace(/\bthirty feet\b/g, '30 feet')
    .replace(/\bthirty foot\b/g, '30 foot')
    .replace(/\bthirty ft\b/g, '30 ft')
    .replace(/\bone butt\b/g, '1 putt')
    .replace(/\btwo butt\b/g, '2 putt')
    .replace(/\bthree butt\b/g, '3 putt')
    .replace(/\bhold the putt\b/g, 'holed the putt')
    .replace(/\bhold putt\b/g, 'holed the putt')
    .replace(/\bheld the putt\b/g, 'holed the putt')
    .replace(/\bholed putt\b/g, 'holed the putt')
    .replace(/\bpot\b/g, 'putt')
    .replace(/\bbutt\b/g, 'putt')
    .replace(/\bsandwich\b/g, 'sand wedge')
    .replace(/\bleft-hand side rough\b/g, 'left rough')
    .replace(/\bright-hand side rough\b/g, 'right rough')
    .replace(/\bleft hand side rough\b/g, 'left rough')
    .replace(/\bright hand side rough\b/g, 'right rough')

    .replace(/\bdown the middle\b/g, 'fairway')
    .replace(/\bmiddle of the fairway\b/g, 'fairway')

    .replace(/\bmiddle green\b/g, 'middle of the green')
    .replace(/\bmiddle green\b/g, 'middle of the green')
    .replace(/\bmiddle of green\b/g, 'middle of the green')
    .replace(/\bon the green\b/g, 'middle of the green')
    .replace(/\bhit the green\b/g, 'middle of the green')

   .replace(/\b(\d+)t\b/g, '$1 ft')

    .replace(/\s+/g, ' ')
    .trim();
}

function splitRecapIntoHoleLines(text) {
  const normalized = normalizeRecapText(text);

  const lines = normalized
    .replace(/(^|\s)(hole\s*\d{1,2})\b/g, '$1|||$2')
    .split('|||')
    .map((line) => line.trim())
    .filter(Boolean);

  const mergedLines = [];
  const holeIndexes = new Map();
  const hasHoleLines = lines.some((line) => /\bhole\s*(\d{1,2})\b/.test(line));

  lines.forEach((line) => {
    const holeMatch = line.match(/\bhole\s*(\d{1,2})\b/);
    const currentHole = holeMatch ? Number(holeMatch[1]) : null;

    if (!currentHole && hasHoleLines) {
      return;
    }

    if (currentHole && holeIndexes.has(currentHole)) {
      const existingIndex = holeIndexes.get(currentHole);
      mergedLines[existingIndex] = `${mergedLines[existingIndex]} ${line}`;
      return;
    }

    if (currentHole) {
      holeIndexes.set(currentHole, mergedLines.length);
    }
    mergedLines.push(line);
  });

  return mergedLines;
}

function getApproachText(line) {
  const approachStart = line.search(/seven iron|7 iron|three wood|3 wood|wedge|pitching wedge|sand wedge|bunker shot|duffed|approach|chip|chipped|hit to|hit it|to \d+\s*(?:ft|feet|foot)/);
  return approachStart >= 0 ? line.slice(approachStart) : line;
}

function inferApproachMiss(line) {
  const approachText = getApproachText(line);

  if (
    approachText.includes('middle of the green') ||
    approachText.includes('to the green') ||
    approachText.includes('hit the green')
  ) return 'none';
  if (approachText.includes('short right')) return 'short_right';
  if (approachText.includes('short left')) return 'short_left';
  if (approachText.includes('long right')) return 'long_right';
  if (approachText.includes('long left')) return 'long_left';
  if (approachText.includes('left bunker')) return 'left bunker';
  if (approachText.includes('right bunker')) return 'right bunker';
  if (/\bmiss(?:ed)?\s+left\b/.test(approachText) || /\bleft of (?:the )?green\b/.test(approachText)) return 'left';
  if (/\bmiss(?:ed)?\s+right\b/.test(approachText) || /\bright of (?:the )?green\b/.test(approachText)) return 'right';
  if (/\bmiss(?:ed)?\s+short\b/.test(approachText) || /\bcame up short\b/.test(approachText) || /\bstill short of (?:the )?green\b/.test(approachText) || /\bduffed\b/.test(approachText)) return 'short';
  if (/\bmiss(?:ed)?\s+long\b/.test(approachText) || /\bwent long\b/.test(approachText)) return 'long';

  return 'none';
}

function extractFirstPuttFt(line) {
  const patterns = [
    /\b(?:putted|putt|2 putt|two-putted)\s+from\s+(\d+)\s*(?:ft|feet|foot)\b/,
    /\b(?:chipped|chip|pitched|pitch)\s+(?:it\s+)?to\s+(\d+)\s*(?:ft|feet|foot)\b(?!\s+past)/,
    /\b(?:hit|hit it|7 iron|seven iron|wedge|sand wedge|pitching wedge)\s+(?:it\s+)?(?:to|from)\s+(\d+)\s*(?:ft|feet|foot)\b(?!\s+past)/,
    /\bto\s+(\d+)\s*(?:ft|feet|foot)\b(?!\s+past)/
  ];

  const match = patterns.map((pattern) => line.match(pattern)).find(Boolean);
  return match ? Number(match[1]) : 'missing';
}

function getMissingParClarifications(text, course, tees, courseLayouts = {}) {
  return splitRecapIntoHoleLines(text).flatMap((line, index) => {
    const holeMatch = line.match(/\bhole\s*(\d{1,2})\b/) || line.match(/^(\d{1,2})\b/);
    const hole = holeMatch ? Number(holeMatch[1]) : index + 1;
    const hasPar = Boolean(line.match(/\bpar\s*([345])\b/));
    const coursePar = getCourseParByHole(courseLayouts, course, tees, hole);

    if (hasPar || coursePar) return [];

    return [{
      id: `par-${hole}`,
      hole,
      field: 'par',
      question: `Hole ${hole}: what par was this hole?`,
      value: '',
      options: ['3', '4', '5']
    }];
  });
}

function convertRecapToStructured(text, course, tees, courseLayouts = {}) {
  const mergedLines = splitRecapIntoHoleLines(text);
  const activeParByHole = getCourseLayout(courseLayouts, course, tees)?.parByHole || null;

  if (isDevelopmentMode()) {
    console.log('Converting recap with course layout', {
      course,
      tees,
      activeParByHole
    });
  }

  const convertedLines = mergedLines.map((line, index) => {
    const holeMatch =
      line.match(/\bhole\s*(\d{1,2})\b/) ||
      line.match(/^(\d{1,2})\b/);

    const parMatch = line.match(/\bpar\s*([345])\b/);
    const puttsMatch =
      line.match(/\b([1234])\s*putt\b/) ||
      line.match(/\b([1234])\s*putted\b/);

    const hole = holeMatch ? Number(holeMatch[1]) : index + 1;
    const coursePar = getCourseParByHole(courseLayouts, course, tees, hole);
    const explicitPar = parMatch ? Number(parMatch[1]) : null;
    const par = coursePar || explicitPar || 4;

    if (isDevelopmentMode()) {
      console.log('Converted hole par', {
        hole,
        coursePar,
        explicitPar,
        selectedPar: par
      });
    }

    let putts = puttsMatch ? Number(puttsMatch[1]) : 2;

    if (
      line.includes('holed the putt') ||
      line.includes('made the putt') ||
      line.includes('sank the putt') ||
      line.includes('rolled it in')
    ) {
      putts = 1;
    }

    const firstPuttFt = extractFirstPuttFt(line);

    let tee = 'n/a';
    const driveText = line.split(/seven iron|7 iron|three wood|3 wood|wedge|pitching wedge|sand wedge|bunker shot|chip|chipped/)[0];

    if (par === 4 || par === 5) {
      if (driveText.includes('fairway')) tee = 'fairway';
      else if (driveText.includes('rough left') || driveText.includes('left rough')) tee = 'rough_left';
      else if (driveText.includes('rough right') || driveText.includes('right rough')) tee = 'rough_right';
      else tee = 'unknown_miss';
    }

    const approachMiss = inferApproachMiss(line);

    // up & down
    let upAndDown = false;

    if (approachMiss !== 'none') {
      if (
        line.includes('up and down') ||
        line.includes('holed the putt') ||
        line.includes('made the putt')
      ) {
        upAndDown = true;
      }
    }

    // score
    let score = approachMiss === 'none'
      ? par - 2 + putts
      : par - 2 + 1 + putts;

    return `${hole},${par},${tee},${approachMiss},${upAndDown},${putts},${firstPuttFt},${score}`;
  });

  return convertedLines.join('\n');
}

function FairwayAccuracy({ holes }) {
  const counts = {
    fairway: 0,
    left: 0,
    right: 0
  };

  const fairwayHoles = holes.filter((hole) => hole.par === 4 || hole.par === 5);
  const total = fairwayHoles.length || 1;

  fairwayHoles.forEach((hole) => {
    const tee = hole.tee || '';

    if (tee === 'fairway') counts.fairway += 1;
    else if (tee === 'rough_left') counts.left += 1;
    else if (tee === 'rough_right') counts.right += 1;
    else if (tee === 'bunker') counts.left += 1;
    else if (tee === 'hazard') counts.right += 1;
  });

  const pct = (value) => Math.round((value / total) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Driving accuracy</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="fairway-grid">
          <div className="fairway-cell">
            <div className="fairway-label">Miss left</div>
            <div className="fairway-value">{pct(counts.left)}%</div>
            <div className="fairway-count">{counts.left}</div>
          </div>

          <div className="fairway-cell fairway-hit">
            <div className="fairway-label">Hit</div>
            <div className="fairway-value">{pct(counts.fairway)}%</div>
            <div className="fairway-count">{counts.fairway}</div>
          </div>

          <div className="fairway-cell">
            <div className="fairway-label">Miss right</div>
            <div className="fairway-value">{pct(counts.right)}%</div>
            <div className="fairway-count">{counts.right}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ApproachAccuracyGrid({ holes }) {
  const total = holes.length || 1;

  const counts = {
    long_left: 0,
    long: 0,
    long_right: 0,
    left: 0,
    none: 0,
    right: 0,
    short_left: 0,
    short: 0,
    short_right: 0
  };

  holes.forEach((hole) => {
    let key = hole.approachMiss || 'none';

    if (key === 'left bunker') key = 'left';
    if (key === 'right bunker') key = 'right';

    if (counts[key] !== undefined) {
      counts[key] += 1;
    }
  });

  const pct = (key) => Math.round((counts[key] / total) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Approach accuracy</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="target-wrap">
          <div className="target">
            <div className="target-zone target-long-left">Long left<span>{pct('long_left')}%</span></div>
            <div className="target-zone target-long">Long<span>{pct('long')}%</span></div>
            <div className="target-zone target-long-right">Long right<span>{pct('long_right')}%</span></div>

            <div className="target-zone target-left">Left<span>{pct('left')}%</span></div>
            <div className="target-zone target-center">Green<span>{pct('none')}%</span></div>
            <div className="target-zone target-right">Right<span>{pct('right')}%</span></div>

            <div className="target-zone target-short-left">Short left<span>{pct('short_left')}%</span></div>
            <div className="target-zone target-short">Short<span>{pct('short')}%</span></div>
            <div className="target-zone target-short-right">Short right<span>{pct('short_right')}%</span></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RoundDetail({ round, onClose }) {
  return (
    <div className="stack" style={{ marginTop: 24 }}>
      <Button variant="secondary" onClick={onClose}>
        Close round detail
      </Button>

      <div className="grid-stats">
        <StatCard label="Round score" value={round.score} sub={`${round.course} • ${round.tees}`} />
        <StatCard label="To par" value={formatToPar(round.toPar)} />
        <StatCard label="Fairways hit" value={`${round.fairwaysPct}%`} />
        <StatCard label="GIR" value={`${round.girPct}%`} />
        <StatCard label="Putts" value={round.putts} />
        <StatCard label="Up-and-down" value={`${round.upAndDownPct}%`} />
      </div>

      <FairwayAccuracy holes={round.holes || []} />
      <ApproachAccuracyGrid holes={round.holes || []} />

      <Card>
        <CardHeader><CardTitle>Hole cards</CardTitle></CardHeader>
        <CardContent className="stack">
          {(round.holes || []).map((hole) => (
            <HoleEditor
              key={hole.hole}
              hole={hole}
              isEditing={false}
              onEdit={() => {}}
              onSave={() => {}}
              onChange={() => {}}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function UserSetup({ onContinue }) {
  const [name, setName] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onContinue(trimmedName);
  }

  return (
    <div className="app-shell">
      <div className="container">
        <Card className="round-shell">
          <CardHeader><CardTitle>What's your name?</CardTitle></CardHeader>
          <CardContent>
            <form className="stack" onSubmit={handleSubmit}>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
                className="input-lg"
                placeholder="Your name"
              />
              <Button className="btn-lg" type="submit" disabled={!name.trim()}>
                Continue
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CourseLayoutCard({
  course,
  tees,
  courseLayouts,
  onSaveCourseLayout,
  onResetCourseLayout,
  onRenameCourseLayout
}) {
  const hasCourse = Boolean(course.trim());
  const resolvedCourse = resolveCourseName(courseLayouts, course);
  const hasLayout = Boolean(getCourseLayout(courseLayouts, course, tees));
  const currentParByHole = getCourseLayout(courseLayouts, course)?.parByHole || createDefaultParByHole();
  const [isOpen, setIsOpen] = useState(!hasLayout);
  const [draftPars, setDraftPars] = useState(currentParByHole);
  const [saveMessage, setSaveMessage] = useState('');
  const totalPar = draftPars.reduce((sum, par) => sum + Number(par || 0), 0);

  useEffect(() => {
    setDraftPars(currentParByHole);
    setIsOpen(!hasLayout);
    setSaveMessage('');
  }, [course, tees, hasLayout, currentParByHole.join('-')]);

  function updatePar(holeIndex, par) {
    setDraftPars((current) => current.map((value, index) => (index === holeIndex ? par : value)));
    setSaveMessage('');
  }

  async function saveLayout() {
    const result = await onSaveCourseLayout(resolvedCourse || course, tees, draftPars);
    setSaveMessage(result?.message || 'Course layout saved.');
  }

  async function resetLayout() {
    const result = await onResetCourseLayout(resolvedCourse || course, tees);
    setSaveMessage(result?.message || 'Course layout reset.');
  }

  return (
    <Card>
      <CardContent className="stack">
        <div className="row-between">
          <div>
            <div className="title-sm">Course layout</div>
            <div className="muted small">
              {hasCourse
                ? `${hasLayout ? 'Layout loaded' : 'No saved layout yet'} for ${resolvedCourse || course}.`
                : 'Enter a course to add hole pars.'}
            </div>
          </div>
          <Button variant="secondary" onClick={() => setIsOpen((current) => !current)}>
            {isOpen ? 'Hide layout' : 'Show layout'}
          </Button>
        </div>

        <div className="info-box">
          <div><strong>Course:</strong> {resolvedCourse || course || 'Not selected'}</div>
          <div><strong>Tees:</strong> {tees || 'Not selected'}</div>
          <div><strong>Total par:</strong> {totalPar}</div>
          <div className="muted tiny">
            Active pars: {currentParByHole.map((par, index) => `H${index + 1}:${par}`).join(' ')}
          </div>
        </div>

        {isOpen && (
          <div className="stack">
            <div className="course-par-grid">
              {draftPars.map((par, index) => (
                <div key={index} className="course-par-cell">
                  <div className="muted tiny">Hole {index + 1}</div>
                  <select
                    className="input"
                    value={par}
                    onChange={(event) => updatePar(index, Number(event.target.value))}
                  >
                    {[3, 4, 5].map((option) => (
                      <option
                        key={option}
                        value={option}
                      >
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="row wrap">
              <Button className="btn-lg" onClick={saveLayout} disabled={!hasCourse}>
                Save layout
              </Button>
              <Button variant="secondary" className="btn-lg" onClick={resetLayout} disabled={!hasCourse}>
                Reset layout
              </Button>
            </div>
            <CourseLayoutCorrection
              course={course}
              courseLayouts={courseLayouts}
              onRenameCourseLayout={onRenameCourseLayout}
            />
            {saveMessage && <div className="success-box">{saveMessage}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CourseLayoutCorrection({ course, courseLayouts, onRenameCourseLayout }) {
  const resolvedCourse = resolveCourseName(courseLayouts, course);
  const hasLayout = Boolean(getCourseLayout(courseLayouts, course));
  const [isOpen, setIsOpen] = useState(false);
  const [newName, setNewName] = useState(resolvedCourse);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setNewName(resolvedCourse);
    setIsOpen(false);
    setMessage('');
  }, [resolvedCourse]);

  if (!hasLayout) {
    return null;
  }

  async function renameCourse() {
    const result = await onRenameCourseLayout(resolvedCourse, newName);
    setMessage(result?.message || 'Course renamed.');
    if (result?.ok) {
      setIsOpen(false);
    }
  }

  return (
    <div className="course-correction">
      {!isOpen ? (
        <Button variant="secondary" className="btn-small" onClick={() => setIsOpen(true)}>
          Rename saved course
        </Button>
      ) : (
        <div className="stack">
          <div>
            <div className="field-label">Correct course name</div>
            <Input value={newName} onChange={(event) => setNewName(event.target.value)} />
          </div>
          <div className="row wrap">
            <Button variant="secondary" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button onClick={renameCourse}>Save name</Button>
          </div>
        </div>
      )}
      {message && <div className="muted small">{message}</div>}
    </div>
  );
}

function normalizeProcessedHole(hole, course, tees, courseLayouts) {
  const par = getCourseParByHole(courseLayouts, course, tees, hole.hole) ?? hole.par ?? 4;
  const approachMiss = hole.approachMiss ?? 'none';
  const gir = hole.gir ?? approachMiss === 'none';
  const putts = hole.putts ?? 2;
  const score = hole.score ?? par - (gir ? 2 : 1) + putts;

  return {
    hole: hole.hole,
    par,
    tee: par === 3 ? 'n/a' : hole.tee ?? 'unknown_miss',
    gir,
    approachMiss,
    upAndDown: hole.upAndDown ?? false,
    putts,
    firstPuttFt: hole.firstPuttFt ?? null,
    score
  };
}

function normalizeClarifications(clarifications = []) {
  return clarifications.map((item, index) => ({
    id: item.id ?? index + 1,
    hole: item.hole,
    field: item.field,
    question: item.question,
    value: item.value ?? '',
    options: item.options || []
  }));
}

function parseClarificationValue(field, value) {
  if (['par', 'putts', 'score'].includes(field)) {
    return Number(value) || 0;
  }

  if (field === 'firstPuttFt') {
    return value === '' ? null : Number(value);
  }

  if (field === 'gir' || field === 'upAndDown') {
    return value === true || value === 'true' || value === 'yes';
  }

  return value;
}

function LogRoundTab({
  selectedPlayer,
  course, setCourse, tees, setTees,
  voiceRecap, setVoiceRecap,
  transcript, setTranscript,
  hasParsed, setHasParsed,
  holes, setHoles,
  clarifications, setClarifications,
  editingHole, setEditingHole,
  courseLayouts,
  savedRounds,
  onSaveCourseLayout,
  onResetCourseLayout,
  onRenameCourseLayout,
  onSaveRound
}) {
  const [parseErrors, setParseErrors] = useState([]);
  const [pendingConverterClarifications, setPendingConverterClarifications] = useState([]);

  const currentStats = useMemo(() => calcStatsFromHoles(holes), [holes]);

  const missPattern = useMemo(() => {
    const counts = { left: 0, right: 0, short: 0, long: 0, bunker: 0 };
    holes.forEach((hole) => {
      const miss = hole.approachMiss;
      if (miss === 'left') counts.left += 1;
      if (miss === 'right') counts.right += 1;
      if (miss === 'short') counts.short += 1;
      if (miss === 'long') counts.long += 1;
      if (String(miss).includes('bunker')) counts.bunker += 1;
    });
    return counts;
  }, [holes]);

  const maxMissValue = Math.max(...Object.values(missPattern), 1);
  const courseSuggestions = useMemo(() => {
    return Array.from(new Set([
      ...Object.keys(courseLayouts),
      ...getPlayedCourseSuggestions(savedRounds)
    ])).sort();
  }, [courseLayouts, savedRounds]);
  useEffect(() => {
    const resolvedCourse = resolveCourseName(courseLayouts, course);

    if (resolvedCourse && resolvedCourse !== course && getCourseLayout(courseLayouts, resolvedCourse)) {
      setCourse(resolvedCourse);
    }
  }, [course, courseLayouts, setCourse]);

  function handleClarificationAnswer(id, value) {
    setClarifications((current) => current.map((item) => (item.id === id ? { ...item, value } : item)));
  }

  function applyClarifications() {
    setHoles((current) =>
      current.map((hole) => {
        const answers = clarifications.filter((item) => item.hole === hole.hole && item.value !== '');
        if (answers.length === 0) return hole;

        return answers.reduce((updated, item) => ({
          ...updated,
          [item.field]: parseClarificationValue(item.field, item.value)
        }), hole);
      })
    );
    setClarifications((current) => current.filter((item) => !item.value));
  }

  function updateHole(holeNumber, field, value) {
    setHoles((current) => current.map((hole) => (hole.hole === holeNumber ? { ...hole, [field]: value } : hole)));
  }

  function handleParseRound() {
    const result = parseStructuredRound(transcript);
    if (result.errors.length > 0) {
      setParseErrors(result.errors);
      setHasParsed(false);
      return;
    }
    if (result.holes.length === 0) {
      setParseErrors(['No valid hole lines found.']);
      setHasParsed(false);
      return;
    }

    setHoles(result.holes);
    setParseErrors([]);
    setHasParsed(true);
    setEditingHole(null);

    const needsClarification = [];
    result.holes.forEach((hole) => {
      const pendingParClarification = pendingConverterClarifications.find((item) => item.hole === hole.hole && item.field === 'par');
      if (pendingParClarification) {
        needsClarification.push({
          ...pendingParClarification,
          id: needsClarification.length + 1
        });
      }
      if (hole.tee === 'unknown_miss') {
        needsClarification.push({
          id: needsClarification.length + 1,
          hole: hole.hole,
          field: 'tee',
          question: `Hole ${hole.hole}: you missed the fairway. Which side did you miss on?`,
          value: '',
          options: ['rough_left', 'rough_right', 'bunker', 'hazard']
        });
      }
      if (hole.firstPuttFt === null) {
        needsClarification.push({
          id: needsClarification.length + 1,
          hole: hole.hole,
          field: 'firstPuttFt',
          question: `Hole ${hole.hole}: how long was your first putt?`,
          value: '',
          options: ['5', '10', '15', '20', '25']
        });
      }
    });
    setClarifications(needsClarification);
    setPendingConverterClarifications([]);
  }

  function handleRoundProcessed(data) {
    if (!data.holes?.length) {
      setParseErrors(['The recap was transcribed, but no hole data could be extracted. Try adding hole numbers and scores.']);
      setHasParsed(false);
      return;
    }

    const processedCourse = data.course || course;
    const processedTees = data.tees || tees;

    setTranscript(convertRecapToStructured(data.transcript || '', processedCourse, processedTees, courseLayouts));
    setHoles(data.holes.map((hole) => normalizeProcessedHole(hole, processedCourse, processedTees, courseLayouts)).sort((a, b) => a.hole - b.hole));
    setClarifications(normalizeClarifications(data.clarifications));
    setParseErrors([]);
    setHasParsed(true);
    setEditingHole(null);

    if (data.course) setCourse(processedCourse);
    if (data.tees) setTees(processedTees);
  }

  function resetDraft() {
    setHasParsed(false);
    setClarifications(initialClarifications);
    setPendingConverterClarifications([]);
    setHoles(initialHoles);
    setTranscript(sampleStructuredRound());
    setCourse('Devonvale Golf Club');
    setTees('Yellow');
    setEditingHole(null);
    setParseErrors([]);
  }

  function loadSample() {
    setTranscript(sampleStructuredRound());
    setParseErrors([]);
    setPendingConverterClarifications([]);
  }

  return (
    <div className="stack">
      <Card className="round-shell">
        <CardContent className="stack">
          <div className="stack">
            <div className="section-kicker">ROUND INFO</div>
            <div>
              <div className="field-label">Course name</div>
              <Input
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                className="input-lime input-lg"
                list="course-suggestions"
              />
              <datalist id="course-suggestions">
                {courseSuggestions.map((courseName) => (
                  <option key={courseName} value={courseName} />
                ))}
              </datalist>
            </div>
            <div>
              <div className="field-label">Tees</div>
              <div className="segmented-control" role="group" aria-label="Tees">
                {TEE_OPTIONS.map((teeName) => (
                  <button
                    key={teeName}
                    type="button"
                    className={`segment-button ${tees === teeName ? 'segment-active' : ''}`}
                    onClick={() => setTees(teeName)}
                  >
                    {teeName}
                  </button>
                ))}
              </div>
            </div>
            <CourseLayoutCard
              course={course}
              tees={tees}
              courseLayouts={courseLayouts}
              onSaveCourseLayout={onSaveCourseLayout}
              onResetCourseLayout={onResetCourseLayout}
              onRenameCourseLayout={onRenameCourseLayout}
            />
            <VoiceRecorder
              value={voiceRecap}
              onChange={setVoiceRecap}
              onRoundProcessed={handleRoundProcessed}
            />
            <details className="manual-tools">
              <summary>Manual transcript tools</summary>
              <div className="stack" style={{ marginTop: 12 }}>
                <div>
                  <div className="field-label">Structured round input</div>
                  <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} />

                  <div className="row wrap" style={{ marginTop: 8 }}>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const converted = convertRecapToStructured(voiceRecap.trim(), course, tees, courseLayouts);
                        setPendingConverterClarifications(getMissingParClarifications(voiceRecap.trim(), course, tees, courseLayouts));
                        setTranscript(converted);
                        setHasParsed(false);
                      }}
                      disabled={!voiceRecap.trim()}
                    >
                      Convert recap into structured box
                    </Button>
                  </div>

                  <div className="muted small" style={{ marginTop: 8 }}>
                    Format: hole,par,tee,approach_miss,up_and_down,putts,first_putt_ft,score
                  </div>
                </div>

                <div className="row wrap">
                  <Button className="grow btn-lg" onClick={handleParseRound}>Parse round</Button>
                  <Button variant="secondary" className="btn-lg" onClick={loadSample}>Load sample</Button>
                </div>
              </div>
            </details>
            <div className="row wrap">
              <Button variant="secondary" className="btn-lg" onClick={resetDraft}>Reset</Button>
            </div>

            {parseErrors.length > 0 && (
              <div className="error-box">
                <div className="title-sm" style={{ marginBottom: 8 }}>Parse errors</div>
                {parseErrors.map((error, index) => (
                  <div key={index} className="small">{error}</div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {hasParsed && (
        <>
          <div className="grid-stats">
            <StatCard label="Round score" value={currentStats.score} sub={`${course} • ${tees}`} />
            <StatCard label="To par" value={formatToPar(currentStats.toPar)} />
            <StatCard label="Fairways hit" value={`${currentStats.fairwaysPct}%`} />
            <StatCard label="GIR" value={`${currentStats.girPct}%`} />
            <StatCard label="Putts" value={currentStats.putts} />
            <StatCard label="Up-and-down" value={`${currentStats.upAndDownPct}%`} />
          </div>
          <FairwayAccuracy holes={holes} />
          <ApproachAccuracyGrid holes={holes} />
          <Card className="card-amber">
            <CardHeader><CardTitle>Clarifications</CardTitle></CardHeader>
            <CardContent className="stack">
              {clarifications.length === 0 ? (
                <div className="success-box">No missing fields. Round is ready to save.</div>
              ) : clarifications.map((item) => (
                <div key={item.id} className="question-box">
                  <div className="question-text">{item.question}</div>
                  <div className="row wrap">
                    {item.options.map((option) => (
                      <Button
                        key={option}
                        variant={item.value === option ? 'primary' : 'secondary'}
                        onClick={() => handleClarificationAnswer(item.id, option)}
                      >
                        {option}
                      </Button>
                    ))}
                    {['firstPuttFt', 'par', 'putts', 'score'].includes(item.field) && (
                      <input
                        className="input"
                        type="number"
                        placeholder="Custom value"
                        value={item.value && !item.options.includes(item.value) ? item.value : ''}
                        onChange={(e) => handleClarificationAnswer(item.id, e.target.value)}
                      />
                    )}
                  </div>
                </div>
              ))}
              <Button className="btn-lg" onClick={applyClarifications}>Apply clarification answers</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Approach miss pattern</CardTitle></CardHeader>
            <CardContent className="stack">
              <MiniBar label="Left" value={missPattern.left} max={maxMissValue} />
              <MiniBar label="Right" value={missPattern.right} max={maxMissValue} />
              <MiniBar label="Short" value={missPattern.short} max={maxMissValue} />
              <MiniBar label="Long" value={missPattern.long} max={maxMissValue} />
              <MiniBar label="Bunker" value={missPattern.bunker} max={maxMissValue} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Hole cards</CardTitle></CardHeader>
            <CardContent className="stack">
              {holes.map((hole) => (
                <HoleEditor
                  key={hole.hole}
                  hole={hole}
                  isEditing={editingHole === hole.hole}
                  onEdit={setEditingHole}
                  onSave={() => setEditingHole(null)}
                  onChange={updateHole}
                />
              ))}
              <Button className="btn-lg" onClick={() => onSaveRound({ player: selectedPlayer, course, tees, holes })}>
                Save round
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function HistoryTab({ rounds, selectedRoundId, setSelectedRoundId, onDeleteRound }) {
  const filtered = rounds;
  const selectedRound = filtered.find((round) => round.id === selectedRoundId);

  return (
    <Card>
      <CardHeader><CardTitle>Your history</CardTitle></CardHeader>
      <CardContent className="stack">
        {filtered.length === 0 ? (
          <div className="empty-box">No saved rounds yet.</div>
        ) : (
          filtered.map((round) => (
            <div
              key={round.id}
              className="history-card"
              onClick={() => setSelectedRoundId(round.id)}
              style={{ cursor: 'pointer' }}
            >
              <div>
                <div className="title-sm">{round.course} • {round.tees}</div>
                <div className="muted small">{round.date}</div>
              </div>
              <div className="badge-row">
                <Badge>To par {formatToPar(round.toPar)}</Badge>
                <Badge>FIR {round.fairwaysPct}%</Badge>
                <Badge>GIR {round.girPct}%</Badge>
                <Badge>Putts {round.putts}</Badge>
                <Badge>Up & down {round.upAndDownPct}%</Badge>
                <Button
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Delete this round?')) {
                      onDeleteRound(round.id);
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
        {selectedRound && (
          <RoundDetail round={selectedRound} onClose={() => setSelectedRoundId(null)} />
        )}
      </CardContent>
    </Card>
  );
}

function DataManagement({ appData, selectedPlayer, onChangePlayerName, onImportData, onResetData }) {
  const fileInputRef = useRef(null);
  const [isChangingName, setIsChangingName] = useState(false);
  const [draftName, setDraftName] = useState(selectedPlayer || '');

  useEffect(() => {
    setDraftName(selectedPlayer || '');
  }, [selectedPlayer]);

  function exportJson() {
    downloadTextFile(
      `golf-stats-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(appData, null, 2),
      'application/json'
    );
  }

  function exportCsv() {
    downloadTextFile(
      `golf-rounds-${new Date().toISOString().slice(0, 10)}.csv`,
      buildRoundsCsv(appData.savedRounds || []),
      'text/csv'
    );
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const imported = JSON.parse(await file.text());
      onImportData(imported);
    } catch {
      window.alert('Could not import this file. Please choose a valid JSON backup.');
    } finally {
      event.target.value = '';
    }
  }

  function savePlayerName(event) {
    event.preventDefault();
    const trimmedName = draftName.trim();
    if (!trimmedName) return;
    onChangePlayerName(trimmedName);
    setIsChangingName(false);
  }

  return (
    <Card>
      <CardHeader><CardTitle>Data management</CardTitle></CardHeader>
      <CardContent className="stack">
        <div className="muted small">Back up or restore this browser's local test data.</div>
        <div className="info-box">
          Beta note: your data is stored only on this device and browser. Export your data before clearing browser storage, switching devices, or reinstalling the app.
        </div>
        <div className="row wrap">
          <Button variant="secondary" onClick={exportJson}>Export JSON</Button>
          <Button variant="secondary" onClick={exportCsv}>Export CSV</Button>
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>Import JSON</Button>
          <Button variant="secondary" onClick={() => setIsChangingName((current) => !current)}>
            Change player name
          </Button>
          <Button variant="secondary" onClick={onResetData}>Reset app data</Button>
        </div>
        {isChangingName && (
          <form className="stack" onSubmit={savePlayerName}>
            <div>
              <div className="field-label">Player name</div>
              <Input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
            </div>
            <div className="row wrap">
              <Button variant="secondary" type="button" onClick={() => setIsChangingName(false)}>Cancel</Button>
              <Button type="submit" disabled={!draftName.trim()}>Save name</Button>
            </div>
          </form>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={handleImport}
        />
      </CardContent>
    </Card>
  );
}

function StatsTab({ rounds, selectedPlayer, appData, onChangePlayerName, onImportData, onResetData }) {
  const filtered = rounds;
  const hasRounds = filtered.length > 0;
  const dashboardStats = useMemo(() => {
    if (filtered.length === 0) {
      return { fairwaysPct: 0, girPct: 0, putts: '0.0', toPar: '0.0', upAndDownPct: 0 };
    }
    return {
      fairwaysPct: average(filtered, 'fairwaysPct'),
      girPct: average(filtered, 'girPct'),
      putts: (filtered.reduce((sum, r) => sum + r.putts, 0) / filtered.length).toFixed(1),
      toPar: (filtered.reduce((sum, r) => sum + r.toPar, 0) / filtered.length).toFixed(1),
      upAndDownPct: average(filtered, 'upAndDownPct')
    };
  }, [filtered]);

  const bestArea = dashboardStats.girPct >= dashboardStats.fairwaysPct ? 'Approach play' : 'Driving';
  const biggestLeak = Number(dashboardStats.toPar) > 6 ? 'Scoring vs par' : 'Round consistency';

  return (
    <div className="stack">
      <div className="grid-stats">
        <StatCard label="Rounds tracked" value={filtered.length} />
        <StatCard label="Average to par" value={dashboardStats.toPar} />
        <StatCard label="Overall FIR" value={`${dashboardStats.fairwaysPct}%`} />
        <StatCard label="Overall GIR" value={`${dashboardStats.girPct}%`} />
        <StatCard label="Avg Putts" value={dashboardStats.putts} />
        <StatCard label="Up-and-down" value={`${dashboardStats.upAndDownPct}%`} />
      </div>
      {hasRounds ? (
        <Card>
          <CardHeader><CardTitle>Profile snapshot</CardTitle></CardHeader>
          <CardContent className="stack">
            <div className="snapshot-box">
              <div className="muted small">Best area</div>
              <div className="title-md">{bestArea}</div>
            </div>
            <div className="snapshot-box">
              <div className="muted small">Biggest leak</div>
              <div className="title-md">{biggestLeak}</div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="empty-box">No saved rounds yet. Log and save a round to see your profile snapshot.</div>
      )}
      <DataManagement
        appData={appData}
        selectedPlayer={selectedPlayer}
        onChangePlayerName={onChangePlayerName}
        onImportData={onImportData}
        onResetData={onResetData}
      />
    </div>
  );
}

  export default function App() {
  const [activeTab, setActiveTab] = useState('log');
  const [selectedRoundId, setSelectedRoundId] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [hasLoadedState, setHasLoadedState] = useState(false);
  const [course, setCourse] = useState('Devonvale Golf Club');
  const [tees, setTees] = useState('Yellow');
  const [transcript, setTranscript] = useState('');
  const [hasParsed, setHasParsed] = useState(false);
  const [holes, setHoles] = useState(initialHoles);
  const [clarifications, setClarifications] = useState(initialClarifications);
  const [editingHole, setEditingHole] = useState(null);
  const [savedRounds, setSavedRounds] = useState([]);
  const [customCourseLayouts, setCustomCourseLayouts] = useState({});
  const [voiceRecap, setVoiceRecap] = useState('');
  const courseLayouts = useMemo(() => mergeCourseLayouts(customCourseLayouts), [customCourseLayouts]);
  const appData = useMemo(() => ({
    version: 1,
    exportedAt: new Date().toISOString(),
    savedRounds,
    selectedPlayer,
    customCourseLayouts
  }), [savedRounds, selectedPlayer, customCourseLayouts]);
  

  useEffect(() => {
    const state = loadState();
    if (state?.savedRounds) setSavedRounds(state.savedRounds);
    if (state?.selectedPlayer) setSelectedPlayer(state.selectedPlayer);
    if (state?.customCourseLayouts) setCustomCourseLayouts(state.customCourseLayouts);
    setHasLoadedState(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedState || !selectedPlayer) return;
    saveState({ savedRounds, selectedPlayer, customCourseLayouts });
  }, [hasLoadedState, savedRounds, selectedPlayer, customCourseLayouts]);

  function handleCompleteUserSetup(playerName) {
    setSelectedPlayer(playerName);
    setSavedRounds((current) => current.map((round) => ({ ...round, player: playerName })));
  }

  function handleChangePlayerName(playerName) {
    setSelectedPlayer(playerName);
  }

  function handleSaveRound(payload) {
    const round = buildSavedRound(payload);
    setSavedRounds((current) => [round, ...current]);
    setActiveTab('history');
  }
function handleDeleteRound(roundId) {
  setSavedRounds((current) => current.filter((round) => round.id !== roundId));
  setSelectedRoundId((current) => (current === roundId ? null : current));
}

async function handleSaveCourseLayout(courseName, teeName, parByHole) {
  const normalizedCourse = courseName.trim();
  const normalizedTees = teeName.trim();
  if (!normalizedCourse || !normalizedTees) {
    return { ok: false, message: 'Enter a course name and tees before saving.' };
  }

  setCustomCourseLayouts((current) => ({
    ...current,
    [normalizedCourse]: {
      parByHole
    }
  }));

  try {
    const res = await fetch('/.netlify/functions/save-course-layout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        course: normalizedCourse,
        tees: normalizedTees,
        parByHole
      })
    });

    const responseText = await res.text();
    const data = responseText ? JSON.parse(responseText) : {};

    if (!res.ok) {
      throw new Error(data.error || 'File save failed');
    }

    return {
      ok: true,
      message: 'Saved to this app and updated src/courseData.js.'
    };
  } catch (error) {
    return {
      ok: false,
      message: `Saved in this browser. Source file was not updated: ${error.message}`
    };
  }
}

async function handleResetCourseLayout(courseName, teeName) {
  const normalizedCourse = resolveCourseName(courseLayouts, courseName).trim();
  const normalizedTees = teeName.trim();

  if (!normalizedCourse || !normalizedTees) {
    return { ok: false, message: 'Enter a course name and tees before resetting.' };
  }

  const starterParByHole = getCourseLayout(starterCourseLayouts, normalizedCourse, normalizedTees)?.parByHole;

  if (starterParByHole) {
    setCustomCourseLayouts((current) => {
      if (!current[normalizedCourse]) return current;
      const next = { ...current };
      delete next[normalizedCourse];
      return next;
    });

    return {
      ok: true,
      message: 'Reset to the starter course layout.'
    };
  }

  const defaultParByHole = createDefaultParByHole();
  setCustomCourseLayouts((current) => ({
    ...current,
    [normalizedCourse]: {
      parByHole: defaultParByHole
    }
  }));

  return {
    ok: true,
    message: 'Reset to the default editable par layout.'
  };
}

async function handleRenameCourseLayout(fromCourse, toCourse) {
  const normalizedFrom = fromCourse.trim();
  const normalizedTo = toCourse.trim();

  if (!normalizedFrom || !normalizedTo) {
    return { ok: false, message: 'Enter a course name before saving.' };
  }

  if (normalizedFrom === normalizedTo) {
    return { ok: false, message: 'Choose a different course name.' };
  }

  setCustomCourseLayouts((current) => {
    if (!current[normalizedFrom]) return current;

    const next = { ...current };
    next[normalizedTo] = next[normalizedFrom];
    delete next[normalizedFrom];
    return next;
  });

  setSavedRounds((current) => current.map((round) => (
    round.course === normalizedFrom ? { ...round, course: normalizedTo } : round
  )));
  setCourse(normalizedTo);

  try {
    const res = await fetch('/.netlify/functions/rename-course-layout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fromCourse: normalizedFrom,
        toCourse: normalizedTo
      })
    });

    const responseText = await res.text();
    const data = responseText ? JSON.parse(responseText) : {};

    if (!res.ok) {
      throw new Error(data.error || 'File rename failed');
    }

    return {
      ok: true,
      message: `Renamed ${normalizedFrom} to ${normalizedTo}.`
    };
  } catch (error) {
    return {
      ok: false,
      message: `Renamed in this browser. Source file was not updated: ${error.message}`
    };
  }
}

function handleImportData(imported) {
  if (!imported || !Array.isArray(imported.savedRounds)) {
    window.alert('Import failed. JSON backup must include a savedRounds array.');
    return;
  }

  setSavedRounds(imported.savedRounds);
  setSelectedPlayer(imported.selectedPlayer || selectedPlayer);
  setCustomCourseLayouts(imported.customCourseLayouts || {});
  setSelectedRoundId(null);
  setActiveTab('stats');
  window.alert('Import complete.');
}

function handleResetData() {
  const confirmed = window.confirm('Reset all local app data in this browser? This removes imported rounds and custom course layouts.');
  if (!confirmed) return;

  const extraConfirmed = window.confirm('This cannot be undone unless you exported a backup. Reset now?');
  if (!extraConfirmed) return;

  clearState();
  setSavedRounds([]);
  setSelectedPlayer('');
  setCustomCourseLayouts({});
  setSelectedRoundId(null);
  setActiveTab('log');
}
  if (!hasLoadedState) {
    return null;
  }

  if (!selectedPlayer) {
    return <UserSetup onContinue={handleCompleteUserSetup} />;
  }

  return (
    <div className="app-shell">
      <div className="container">
        <div className="tab-row">
          <TabButton active={activeTab === 'log'} label="Log round" onClick={() => setActiveTab('log')} />
          <TabButton active={activeTab === 'history'} label="Your history" onClick={() => setActiveTab('history')} />
          <TabButton active={activeTab === 'stats'} label="Your stats" onClick={() => setActiveTab('stats')} />
        </div>

        {activeTab === 'log' && (
          <LogRoundTab
            selectedPlayer={selectedPlayer}
            course={course}
            setCourse={setCourse}
            tees={tees}
            setTees={setTees}
            voiceRecap={voiceRecap}
            setVoiceRecap={setVoiceRecap}
            transcript={transcript}
            setTranscript={setTranscript}
            hasParsed={hasParsed}
            setHasParsed={setHasParsed}
            holes={holes}
            setHoles={setHoles}
            clarifications={clarifications}
            setClarifications={setClarifications}
            editingHole={editingHole}
            setEditingHole={setEditingHole}
            courseLayouts={courseLayouts}
            savedRounds={savedRounds}
            onSaveCourseLayout={handleSaveCourseLayout}
            onResetCourseLayout={handleResetCourseLayout}
            onRenameCourseLayout={handleRenameCourseLayout}
            onSaveRound={handleSaveRound}
          />
        )}

{activeTab === 'history' && (
  <HistoryTab
    rounds={savedRounds}
    selectedRoundId={selectedRoundId}
    setSelectedRoundId={setSelectedRoundId}
    onDeleteRound={handleDeleteRound}
  />
)}
{activeTab === 'stats' && (
  <StatsTab
    rounds={savedRounds}
    selectedPlayer={selectedPlayer}
    appData={appData}
    onChangePlayerName={handleChangePlayerName}
    onImportData={handleImportData}
    onResetData={handleResetData}
  />
)}
      </div>
    </div>
  );
}

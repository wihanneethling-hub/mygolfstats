const TEE_VALUES = ['fairway', 'rough_left', 'rough_right', 'bunker', 'hazard', 'n/a', 'unknown_miss'];
const MISS_VALUES = [
  'none',
  'left',
  'right',
  'short',
  'long',
  'short_left',
  'short_right',
  'long_left',
  'long_right',
  'left bunker',
  'right bunker'
];

const roundSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['course', 'tees', 'holes', 'clarifications'],
  properties: {
    course: { type: ['string', 'null'] },
    tees: { type: ['string', 'null'] },
    holes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'hole',
          'par',
          'tee',
          'approachMiss',
          'gir',
          'upAndDown',
          'putts',
          'firstPuttFt',
          'score'
        ],
        properties: {
          hole: { type: 'integer', minimum: 1, maximum: 18 },
          par: { type: ['integer', 'null'], enum: [3, 4, 5, null] },
          tee: { type: ['string', 'null'], enum: [...TEE_VALUES, null] },
          approachMiss: { type: ['string', 'null'], enum: [...MISS_VALUES, null] },
          gir: { type: ['boolean', 'null'] },
          upAndDown: { type: ['boolean', 'null'] },
          putts: { type: ['integer', 'null'], minimum: 0, maximum: 6 },
          firstPuttFt: { type: ['number', 'null'], minimum: 0, maximum: 200 },
          score: { type: ['integer', 'null'], minimum: 1, maximum: 15 }
        }
      }
    },
    clarifications: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['hole', 'field', 'question', 'options'],
        properties: {
          hole: { type: 'integer', minimum: 1, maximum: 18 },
          field: {
            type: 'string',
            enum: ['par', 'tee', 'approachMiss', 'gir', 'upAndDown', 'putts', 'firstPuttFt', 'score']
          },
          question: { type: 'string' },
          options: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      }
    }
  }
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

async function transcribeAudio({ audioBase64, mimeType, fileName }) {
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  console.log('Round processing transcription upload:', {
    mimeType,
    fileName,
    audioSize: audioBuffer.length
  });

  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType });
  formData.append('file', blob, fileName);
  formData.append('model', 'gpt-4o-mini-transcribe');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: formData
  });

  const responseText = await response.text();
  let data = {};

  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { error: { message: responseText } };
    }
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || 'Transcription failed');
  }

  return data.text || '';
}

function extractOutputText(response) {
  if (response.output_text) return response.output_text;

  const message = response.output?.find((item) => item.type === 'message');
  const textItem = message?.content?.find((item) => item.type === 'output_text');
  return textItem?.text || '';
}

function buildClarification(hole, field, question, options) {
  return { hole, field, question, options };
}

function addFallbackClarifications(round) {
  const existing = new Set(round.clarifications.map((item) => `${item.hole}:${item.field}`));

  round.holes.forEach((hole) => {
    const missing = [];
    if (!hole.par) missing.push(buildClarification(hole.hole, 'par', `Hole ${hole.hole}: what was the par?`, ['3', '4', '5']));
    if (hole.par === 3) {
      hole.tee = 'n/a';
      if (!hole.approachMiss) {
        missing.push(buildClarification(hole.hole, 'approachMiss', `Hole ${hole.hole}: where did your tee shot finish?`, MISS_VALUES));
      }
    } else {
      if (!hole.tee) missing.push(buildClarification(hole.hole, 'tee', `Hole ${hole.hole}: where did the tee shot finish?`, TEE_VALUES));
      if (!hole.approachMiss) missing.push(buildClarification(hole.hole, 'approachMiss', `Hole ${hole.hole}: where did the approach finish?`, MISS_VALUES));
    }
    if (hole.gir === null) missing.push(buildClarification(hole.hole, 'gir', `Hole ${hole.hole}: did you hit the green in regulation?`, ['true', 'false']));
    if (hole.upAndDown === null) missing.push(buildClarification(hole.hole, 'upAndDown', `Hole ${hole.hole}: did you get up and down?`, ['true', 'false']));
    if (hole.putts === null) missing.push(buildClarification(hole.hole, 'putts', `Hole ${hole.hole}: how many putts?`, ['1', '2', '3']));
    if (hole.firstPuttFt === null) missing.push(buildClarification(hole.hole, 'firstPuttFt', `Hole ${hole.hole}: how long was your first putt?`, ['5', '10', '15', '20', '25']));
    if (hole.score === null) missing.push(buildClarification(hole.hole, 'score', `Hole ${hole.hole}: what did you score?`, []));

    missing.forEach((item) => {
      const key = `${item.hole}:${item.field}`;
      if (!existing.has(key)) {
        round.clarifications.push(item);
        existing.add(key);
      }
    });
  });

  round.clarifications = round.clarifications.map((item, index) => ({
    id: index + 1,
    value: '',
    ...item
  }));

  return round;
}

function applyCourseContext(round, { course, tees, parByHole } = {}) {
  const hasCourseLayout = Array.isArray(parByHole) && parByHole.length === 18;

  return {
    ...round,
    course: course || round.course,
    tees: tees || round.tees,
    holes: round.holes.map((hole) => {
      const par = hasCourseLayout ? parByHole[hole.hole - 1] : hole.par;

      return {
        ...hole,
        par,
        tee: par === 3 ? 'n/a' : hole.tee
      };
    })
  };
}

const ORDINAL_HOLES = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18
};

const SPOKEN_NUMBERS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12
};

function getHoleMentions(transcript) {
  const pattern = /\b(?:(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth)|(\d{1,2})(?:st|nd|rd|th)?)\s+hole\b|\bhole\s+(\d{1,2})\b/g;
  return [...String(transcript || '').toLowerCase().matchAll(pattern)]
    .map((match) => ({
      hole: ORDINAL_HOLES[match[1]] || Number(match[2] || match[3]),
      index: match.index
    }))
    .filter((mention) => Number.isInteger(mention.hole));
}

function getHoleTranscriptSegment(transcript, holeNumber) {
  const normalized = String(transcript || '').toLowerCase();
  const mentions = getHoleMentions(normalized);
  if (!mentions.length) return normalized;

  const current = mentions.find((mention) => mention.hole === holeNumber);
  if (!current) return '';

  const next = mentions.find((mention) => mention.index > current.index);
  return normalized.slice(current.index, next ? next.index : normalized.length);
}

function parseSpokenNumber(value) {
  const normalized = String(value || '').toLowerCase();
  return SPOKEN_NUMBERS[normalized] || Number(normalized) || null;
}

function hasExplicitGrossScore(segment) {
  const scorePattern = /\b(?:for|scored|shot|carded)\s+(?:a\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\b/;
  const match = segment.match(scorePattern);
  const score = match ? parseSpokenNumber(match[1]) : null;
  return Number.isInteger(score) && score >= 1 && score <= 15;
}

function segmentSaysMadePutt(segment) {
  return (
    /\b(?:made|holed|sank|drained)\s+(?:the\s+)?putt\b/.test(segment) ||
    /\brolled\s+it\s+in\b/.test(segment)
  );
}

function normalizeMadePuttHoles(round, transcript) {
  return {
    ...round,
    holes: round.holes.map((hole) => {
      const segment = getHoleTranscriptSegment(transcript, hole.hole);
      if (!segment || !segmentSaysMadePutt(segment)) return hole;

      const nextHole = {
        ...hole,
        putts: 1
      };

      if (hole.approachMiss && hole.approachMiss !== 'none') {
        nextHole.upAndDown = true;
      }

      if (hole.par && !hasExplicitGrossScore(segment)) {
        const missedGreenShot = hole.approachMiss && hole.approachMiss !== 'none' ? 1 : 0;
        nextHole.score = hole.par - 2 + missedGreenShot + nextHole.putts;
      }

      return nextHole;
    })
  };
}

async function extractRound(transcript, context = {}) {
  const activeLayoutText = Array.isArray(context.parByHole) && context.parByHole.length === 18
    ? `Active course layout pars by hole: ${context.parByHole.map((par, index) => `H${index + 1}:${par}`).join(' ')}. These pars are the source of truth.`
    : 'No active course layout was supplied. Use spoken pars where available and clarify missing pars.';

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      input: [
        {
          role: 'system',
          content: [
            'You extract golf round recaps into app data.',
            'Use only facts stated or strongly implied by the transcript.',
            'Return holes in ascending order and include any hole the user describes.',
            'Keep the drive, approach, recovery shots, putts, and gross score separate.',
            'A drive in the fairway followed by an approach short of the green means tee fairway and approachMiss short.',
            'A chip to 15 feet followed by two putts means firstPuttFt 15 and putts 2.',
            'A chip to 20 feet followed by made the putt means firstPuttFt 20, putts 1, and upAndDown true when the green was missed.',
            'A bad chip to 20 feet is still one chip, not two recovery shots.',
            'If the golfer says made the putt, holed the putt, sank the putt, drained the putt, or rolled it in, putts must be 1 unless they clearly said an earlier putt was missed.',
            'When no gross score is stated, calculate score from described shots: drive + approach + recovery shots + putts + penalties.',
            'When the golfer states a gross score, use that exact score instead of calculating a different score.',
            'For par 3 tee values use n/a unless the transcript says otherwise.',
            'If an approach was on the green, use approachMiss none and gir true.',
            'If a needed field is missing or ambiguous, set it to null and add one concise clarification.',
            'Use tee enum values exactly: fairway, rough_left, rough_right, bunker, hazard, n/a, unknown_miss.',
            'Use approachMiss enum values exactly: none, left, right, short, long, short_left, short_right, long_left, long_right, left bunker, right bunker.'
          ].join(' ')
        },
        {
          role: 'user',
          content: [
            `Selected course: ${context.course || 'not supplied'}`,
            `Selected tees: ${context.tees || 'not supplied'}`,
            activeLayoutText,
            `Transcript:\n${transcript}`
          ].join('\n')
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'golf_round',
          strict: true,
          schema: roundSchema
        }
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || 'Round extraction failed');
  }

  const outputText = extractOutputText(data);
  if (!outputText) {
    throw new Error('Round extraction returned no data');
  }

  const contextualRound = applyCourseContext(JSON.parse(outputText), context);
  return addFallbackClarifications(normalizeMadePuttHoles(contextualRound, transcript));
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return jsonResponse(500, { error: 'Missing OPENAI_API_KEY' });
    }

    const body = JSON.parse(event.body || '{}');
    const {
      audioBase64,
      mimeType = 'audio/webm',
      fileName = 'round-recap.webm',
      transcript: providedTranscript,
      course,
      tees,
      parByHole
    } = body;

    if (!providedTranscript && !audioBase64) {
      return jsonResponse(400, { error: 'Missing audioBase64 or transcript' });
    }

    const transcript = providedTranscript || await transcribeAudio({ audioBase64, mimeType, fileName });

    if (!transcript.trim()) {
      return jsonResponse(400, { error: 'No transcript available to process' });
    }

    const round = await extractRound(transcript, { course, tees, parByHole });

    return jsonResponse(200, {
      transcript,
      ...round
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error.message || 'Unexpected processing error'
    });
  }
}

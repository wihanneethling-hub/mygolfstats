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

async function transcribeAudio({ audioBase64, mimeType }) {
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType });
  formData.append('file', blob, 'round-recap.webm');
  formData.append('model', 'gpt-4o-mini-transcribe');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: formData
  });

  const data = await response.json();

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
    if (!hole.tee) missing.push(buildClarification(hole.hole, 'tee', `Hole ${hole.hole}: where did the tee shot finish?`, TEE_VALUES));
    if (!hole.approachMiss) missing.push(buildClarification(hole.hole, 'approachMiss', `Hole ${hole.hole}: where did the approach finish?`, MISS_VALUES));
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

async function extractRound(transcript) {
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
            'For par 3 tee values use n/a unless the transcript says otherwise.',
            'If an approach was on the green, use approachMiss none and gir true.',
            'If a needed field is missing or ambiguous, set it to null and add one concise clarification.',
            'Use tee enum values exactly: fairway, rough_left, rough_right, bunker, hazard, n/a, unknown_miss.',
            'Use approachMiss enum values exactly: none, left, right, short, long, short_left, short_right, long_left, long_right, left bunker, right bunker.'
          ].join(' ')
        },
        {
          role: 'user',
          content: `Transcript:\n${transcript}`
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

  return addFallbackClarifications(JSON.parse(outputText));
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
    const { audioBase64, mimeType = 'audio/webm', transcript: providedTranscript } = body;

    if (!providedTranscript && !audioBase64) {
      return jsonResponse(400, { error: 'Missing audioBase64 or transcript' });
    }

    const transcript = providedTranscript || await transcribeAudio({ audioBase64, mimeType });

    if (!transcript.trim()) {
      return jsonResponse(400, { error: 'No transcript available to process' });
    }

    const round = await extractRound(transcript);

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

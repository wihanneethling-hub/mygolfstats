import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function validateParByHole(parByHole) {
  return (
    Array.isArray(parByHole) &&
    parByHole.length === 18 &&
    parByHole.every((par) => [3, 4, 5].includes(Number(par)))
  );
}

function stringifyCourseLayouts(courseLayouts) {
  return `// Editable starter data only. These layouts can be updated from the local course editor.\nexport const starterCourseLayouts = ${JSON.stringify(courseLayouts, null, 2)};\n`;
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const course = String(body.course || '').trim();
    const tees = String(body.tees || '').trim();
    const parByHole = body.parByHole?.map(Number);

    if (!course || !tees) {
      return jsonResponse(400, { error: 'Course and tees are required' });
    }

    if (!validateParByHole(parByHole)) {
      return jsonResponse(400, { error: 'parByHole must contain 18 pars, each 3, 4, or 5' });
    }

    const courseDataPath = path.join(process.cwd(), 'src/courseData.js');
    await fs.access(courseDataPath);

    const moduleUrl = `${pathToFileURL(courseDataPath).href}?updated=${Date.now()}`;
    const { starterCourseLayouts = {} } = await import(moduleUrl);
    const nextCourseLayouts = {
      ...starterCourseLayouts,
      [course]: {
        parByHole
      }
    };

    await fs.writeFile(courseDataPath, stringifyCourseLayouts(nextCourseLayouts), 'utf8');

    return jsonResponse(200, {
      ok: true,
      course,
      tees,
      parByHole
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error.message || 'Unable to save course layout to file'
    });
  }
}

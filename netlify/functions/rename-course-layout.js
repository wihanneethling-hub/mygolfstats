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

function stringifyCourseLayouts(courseLayouts) {
  return `// Editable starter data only. These layouts can be updated from the local course editor.\nexport const starterCourseLayouts = ${JSON.stringify(courseLayouts, null, 2)};\n`;
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const fromCourse = String(body.fromCourse || '').trim();
    const toCourse = String(body.toCourse || '').trim();

    if (!fromCourse || !toCourse) {
      return jsonResponse(400, { error: 'fromCourse and toCourse are required' });
    }

    if (fromCourse === toCourse) {
      return jsonResponse(400, { error: 'Choose a different course name' });
    }

    const courseDataPath = path.join(process.cwd(), 'src/courseData.js');
    await fs.access(courseDataPath);

    const moduleUrl = `${pathToFileURL(courseDataPath).href}?updated=${Date.now()}`;
    const { starterCourseLayouts = {} } = await import(moduleUrl);

    if (!starterCourseLayouts[fromCourse]) {
      return jsonResponse(404, { error: `${fromCourse} was not found in courseData.js` });
    }

    const nextCourseLayouts = { ...starterCourseLayouts };
    const fromLayout = nextCourseLayouts[fromCourse];
    delete nextCourseLayouts[fromCourse];
    nextCourseLayouts[toCourse] = fromLayout;

    await fs.writeFile(courseDataPath, stringifyCourseLayouts(nextCourseLayouts), 'utf8');

    return jsonResponse(200, {
      ok: true,
      fromCourse,
      toCourse
    });
  } catch (error) {
    return jsonResponse(500, {
      error: error.message || 'Unable to rename course layout'
    });
  }
}

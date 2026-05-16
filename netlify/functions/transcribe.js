export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { audioBase64, mimeType = 'audio/webm' } = body;

    if (!audioBase64) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing audioBase64' }),
      };
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType });
    formData.append('file', blob, 'recording.webm');
    formData.append('model', 'gpt-4o-mini-transcribe');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: data?.error?.message || 'Transcription failed',
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ text: data.text || '' }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || 'Unexpected error',
      }),
    };
  }
}
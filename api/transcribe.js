export const config = {
  api: {
    bodyParser: false,
  },
};

import formidable from 'formidable';
import fs from 'fs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      return res.status(500).json({ error: 'File parsing error' });
    }

    try {
      const file = files.audio;

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: (() => {
          const formData = new FormData();
          formData.append('file', fs.createReadStream(file.filepath));
          formData.append('model', 'gpt-4o-mini-transcribe');
          return formData;
        })(),
      });

      const data = await response.json();

      res.status(200).json({ text: data.text });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Transcription failed' });
    }
  });
}
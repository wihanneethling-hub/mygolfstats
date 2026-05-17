import React, { useEffect, useRef, useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Textarea } from './UI';

const SILENCE_THRESHOLD = 0.018;
const SILENCE_MS = 2200;
const MIN_RECORDING_MS = 2500;
const PREFERRED_AUDIO_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav'
];

export function getAudioExtension(mimeType = '') {
  const normalized = mimeType.toLowerCase();

  if (normalized.includes('audio/webm')) return 'webm';
  if (normalized.includes('audio/mp4')) return 'm4a';
  if (normalized.includes('audio/mpeg')) return 'mp3';
  if (normalized.includes('audio/wav')) return 'wav';

  return 'webm';
}

function getSupportedAudioMimeType() {
  if (!window.MediaRecorder?.isTypeSupported) return '';

  return PREFERRED_AUDIO_MIME_TYPES.find((mimeType) => window.MediaRecorder.isTypeSupported(mimeType)) || '';
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const [, base64 = ''] = String(reader.result).split(',');
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function VoiceRecorder({ value, onChange, onRoundProcessed }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioBlob, setAudioBlob] = useState(null);
  const [status, setStatus] = useState('Ready to record a round recap.');
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const monitorFrameRef = useRef(null);
  const audioUrlRef = useRef('');
  const startedAtRef = useRef(0);
  const silentSinceRef = useRef(null);

  useEffect(() => {
    if (!supportsAudioRecording()) {
      setIsSupported(false);
    }

    return () => {
      stopMonitoring();
      revokeAudioUrl();
      stopStream();
    };
  }, []);

  function supportsAudioRecording() {
    return Boolean(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      window.MediaRecorder &&
      (window.AudioContext || window.webkitAudioContext)
    );
  }

  function revokeAudioUrl() {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = '';
    }
  }

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  function stopMonitoring() {
    if (monitorFrameRef.current) {
      cancelAnimationFrame(monitorFrameRef.current);
      monitorFrameRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    silentSinceRef.current = null;
  }

  function monitorSilence() {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);

    let sum = 0;
    samples.forEach((sample) => {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    });

    const volume = Math.sqrt(sum / samples.length);
    const now = Date.now();
    const recordingLongEnough = now - startedAtRef.current > MIN_RECORDING_MS;

    if (volume < SILENCE_THRESHOLD) {
      if (!silentSinceRef.current) {
        silentSinceRef.current = now;
      }

      if (recordingLongEnough && now - silentSinceRef.current > SILENCE_MS) {
        setStatus('Silence detected. Processing recap...');
        stopRecording();
        return;
      }
    } else {
      silentSinceRef.current = null;
    }

    monitorFrameRef.current = requestAnimationFrame(monitorSilence);
  }

  async function startRecording() {
    if (!isSupported || isRecording || isProcessing) return;

    try {
      setError('');
      setStatus('Listening. Stop talking and I will process the recap automatically.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextConstructor();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      startedAtRef.current = Date.now();

      const mimeType = getSupportedAudioMimeType();
      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const recordedMimeType = mediaRecorder.mimeType || mimeType || chunksRef.current[0]?.type || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: recordedMimeType });
        setAudioBlob(blob);
        revokeAudioUrl();
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        setAudioUrl(url);
        processRoundAudio(blob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      monitorSilence();
    } catch (recordingError) {
      console.error('Microphone access failed:', recordingError);
      if (!supportsAudioRecording()) {
        setIsSupported(false);
        setStatus('Recording is unavailable.');
      } else {
        setStatus('Microphone access failed.');
      }
      setError('Microphone access failed. Check browser permissions and try again.');
      stopMonitoring();
      stopStream();
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    setIsRecording(false);
    stopMonitoring();
    stopStream();
  }

  function clearRecording() {
    setAudioBlob(null);
    setError('');
    setStatus('Ready to record a round recap.');
    revokeAudioUrl();
    setAudioUrl('');
    onChange('');
  }

  async function sendAudio(blob, endpoint) {
    const audioBase64 = await blobToBase64(blob);
    const mimeType = blob.type || 'audio/webm';
    const fileName = `round-recap.${getAudioExtension(mimeType)}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        audioBase64,
        mimeType,
        fileName
      })
    });

    const responseText = await res.text();
    let data = {};

    if (responseText) {
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(`Server returned ${res.status}: ${responseText.slice(0, 160)}`);
      }
    }

    if (!res.ok) {
      throw new Error(data.error || 'Audio processing failed');
    }

    return data;
  }

  async function processRoundAudio(blob = audioBlob) {
    if (!blob || isProcessing) return;

    try {
      setIsProcessing(true);
      setError('');
      setStatus('Transcribing and understanding the round...');
      const data = await sendAudio(blob, '/.netlify/functions/process-round');
      onChange(data.transcript || '');
      onRoundProcessed?.(data);
      setStatus(data.clarifications?.length ? 'A few details need clarification.' : 'Round understood. Review and save when ready.');
    } catch (processingError) {
      console.error(processingError);
      setError(processingError.message || 'Error processing audio');
      setStatus('Processing failed. You can retry or edit the transcript manually.');
    } finally {
      setIsProcessing(false);
    }
  }

  async function transcribeAudio() {
    if (!audioBlob || isProcessing) return;

    try {
      setIsProcessing(true);
      setError('');
      setStatus('Transcribing audio...');
      const data = await sendAudio(audioBlob, '/.netlify/functions/transcribe');
      onChange(data.text || '');
      setStatus('Transcript ready. You can process it manually if needed.');
    } catch (transcriptionError) {
      console.error(transcriptionError);
      setError(transcriptionError.message || 'Error transcribing audio');
      setStatus('Transcription failed.');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voice recap</CardTitle>
      </CardHeader>

      <CardContent className="stack">
        {!isSupported && (
          <div className="error-box">
            Audio recording is not supported in this browser.
          </div>
        )}

        <div className={`voice-status ${isRecording ? 'voice-status-live' : ''}`}>
          <span className="voice-dot" />
          <span>{isRecording ? 'Recording' : isProcessing ? 'Processing' : 'Ready'}</span>
          <span className="muted small">{status}</span>
        </div>

        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Your transcript will appear here after the round recap is processed."
        />

        <div className="recorder-actions">
          {isRecording ? (
            <Button
              className="btn-lg grow"
              onClick={stopRecording}
            >
              Stop and process
            </Button>
          ) : (
            <Button
              className="btn-lg grow"
              onClick={startRecording}
              disabled={!isSupported || isProcessing}
            >
              {isProcessing ? 'Processing...' : audioBlob ? 'Record again' : 'Record recap'}
            </Button>
          )}
        </div>

        {audioBlob && !isRecording && (
          <details className="recorder-more">
            <summary>More recording options</summary>
            <div className="row wrap" style={{ marginTop: 12 }}>
              <Button
                variant="secondary"
                onClick={() => processRoundAudio()}
                disabled={isProcessing}
              >
                Process again
              </Button>

              <Button
                variant="secondary"
                onClick={transcribeAudio}
                disabled={isProcessing}
              >
                Transcribe only
              </Button>

              <Button
                variant="secondary"
                onClick={clearRecording}
                disabled={isProcessing}
              >
                Clear recording
              </Button>
            </div>
          </details>
        )}

        {error && <div className="error-box">{error}</div>}

        {audioUrl && (
          <div className="stack">
            <div className="muted small">Recorded audio preview</div>
            <audio controls src={audioUrl} style={{ width: '100%' }} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

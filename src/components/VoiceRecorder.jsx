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
const ALLOWED_AUDIO_EXTENSIONS = ['m4a', 'mp4', 'mp3', 'wav', 'aac', 'webm'];

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

function getAudioFileName(blob, fallbackMimeType = 'audio/webm') {
  if (blob?.name) return blob.name;
  return `round-recap.${getAudioExtension(blob?.type || fallbackMimeType)}`;
}

function getFileExtension(fileName = '') {
  const extension = fileName.toLowerCase().split('.').pop();
  return extension && extension !== fileName.toLowerCase() ? extension : '';
}

function getAudioMimeType(blob) {
  if (blob?.type) return blob.type;

  const extension = getFileExtension(blob?.name);
  if (extension === 'm4a' || extension === 'mp4') return 'audio/mp4';
  if (extension === 'mp3') return 'audio/mpeg';
  if (extension === 'wav') return 'audio/wav';
  if (extension === 'aac') return 'audio/aac';
  if (extension === 'webm') return 'audio/webm';

  return 'audio/webm';
}

function formatFileSize(size = 0) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function buildAudioErrorMessage(apiMessage, blob, fileName) {
  return [
    `File: ${fileName || getAudioFileName(blob)}`,
    `MIME type: ${getAudioMimeType(blob)}`,
    `Size: ${formatFileSize(blob?.size || 0)}`,
    `API error: ${apiMessage || 'Audio processing failed'}`
  ].join('\n');
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

function appendTranscriptSegment(existingTranscript = '', newSegment = '') {
  const existing = existingTranscript.trim();
  const segment = newSegment.trim();

  if (!existing) return segment;
  if (!segment) return existing;

  return `${existing}\n\n${segment}`;
}

export default function VoiceRecorder({ value, onChange, onTranscriptReady, onRoundProcessed }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingState, setProcessingState] = useState('idle');
  const [isSupported, setIsSupported] = useState(true);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioFileName, setAudioFileName] = useState('');
  const [status, setStatus] = useState('Ready to record a round recap.');
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const monitorFrameRef = useRef(null);
  const audioUrlRef = useRef('');
  const startedAtRef = useRef(0);
  const silentSinceRef = useRef(null);
  const processingKeyRef = useRef('');
  const valueRef = useRef(value || '');

  useEffect(() => {
    valueRef.current = value || '';
  }, [value]);

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
      setProcessingState('recording');
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
        const fileName = getAudioFileName(blob, recordedMimeType);
        setAudioBlob(blob);
        setAudioFileName(fileName);
        revokeAudioUrl();
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        setAudioUrl(url);
        transcribeAudio(blob, fileName);
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
    setAudioFileName('');
    setError('');
    setProcessingState('idle');
    processingKeyRef.current = '';
    setStatus('Ready to record a round recap.');
    revokeAudioUrl();
    setAudioUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onChange('');
  }

  function handleAudioUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const extension = getFileExtension(file.name);
    if (!ALLOWED_AUDIO_EXTENSIONS.includes(extension)) {
      setError('Please choose an audio file: m4a, mp4, mp3, wav, aac, or webm.');
      event.target.value = '';
      return;
    }

    setAudioBlob(file);
    setAudioFileName(file.name);
    setError('');
    setStatus('Audio file selected. Transcribing...');
    revokeAudioUrl();
    const url = URL.createObjectURL(file);
    audioUrlRef.current = url;
    setAudioUrl(url);
    transcribeAudio(file, file.name);
  }

  async function sendAudio(blob, endpoint, fileName = getAudioFileName(blob)) {
    const audioBase64 = await blobToBase64(blob);
    const mimeType = getAudioMimeType(blob);

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
        throw new Error(buildAudioErrorMessage(`Server returned ${res.status}: ${responseText.slice(0, 160)}`, blob, fileName));
      }
    }

    if (!res.ok) {
      throw new Error(buildAudioErrorMessage(data.error || 'Audio processing failed', blob, fileName));
    }

    return data;
  }

  async function processRoundAudio(blob = audioBlob, fileName = audioFileName || getAudioFileName(blob)) {
    return transcribeAudio(blob, fileName, true);
  }

  async function transcribeAudio(blob = audioBlob, fileName = audioFileName || getAudioFileName(blob), force = false) {
    if (!blob || isProcessing) return;
    const processingKey = `${fileName}:${blob.size}:${blob.type || getAudioMimeType(blob)}`;
    if (!force && processingKeyRef.current === processingKey && processingState !== 'error') return;
    processingKeyRef.current = processingKey;

    try {
      setIsProcessing(true);
      setProcessingState('transcribing');
      setError('');
      setStatus('Transcribing...');
      const data = await sendAudio(blob, '/.netlify/functions/transcribe', fileName);
      const transcriptText = data.text || '';
      const combinedTranscript = appendTranscriptSegment(valueRef.current, transcriptText);
      valueRef.current = combinedTranscript;
      onChange(combinedTranscript);
      setProcessingState('converting');
      onTranscriptReady?.(combinedTranscript, { latestSegment: transcriptText });
      setProcessingState('parsed');
      setStatus('Transcript appended. Record another segment or review the round below.');
    } catch (processingError) {
      console.error(processingError);
      setError(processingError.message || buildAudioErrorMessage('Error processing audio', blob, fileName));
      setProcessingState('error');
      setStatus('Processing failed. You can retry or edit the transcript manually.');
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

        {value.trim() && (
          <div className="info-box">
            You can record in multiple parts. Each new recording is transcribed and appended to this recap.
          </div>
        )}

        <div className="row wrap">
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isRecording || isProcessing}
          >
            Upload audio file
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            onChange={handleAudioUpload}
          />
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
                {processingState === 'error' ? 'Retry processing' : 'Process again'}
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

        {error && <div className="error-box" style={{ whiteSpace: 'pre-wrap' }}>{error}</div>}

        {audioUrl && (
          <div className="stack">
            <div>
              <div className="muted small">Recorded audio preview</div>
              {audioBlob && (
                <div className="muted tiny">
                  {audioFileName || getAudioFileName(audioBlob)} • {getFileExtension(audioFileName || getAudioFileName(audioBlob)) || 'no extension'} • {getAudioMimeType(audioBlob)} • {formatFileSize(audioBlob.size)}
                </div>
              )}
            </div>
            <audio controls src={audioUrl} style={{ width: '100%' }} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

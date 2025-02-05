import { convertVideoToWav } from './videoConverter';
import { transcribeAudio } from './openai';
import { FileProcessingError } from './errors';
import { ERROR_MESSAGES } from './constants';

const MAX_FILE_SIZE = 26214400; // 25 MB in Bytes
const SUPPORTED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac'];

/**
 * Splits audio at optimal points using Web Audio API
 */
async function splitAudioFile(file: File): Promise<[File, File]> {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

  // Convert file to ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();

  // Decode audio data
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Calculate middle point (in samples)
  const mid = Math.floor(audioBuffer.length / 2);

  // Create two new buffers for the halves
  const firstHalf = audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    mid,
    audioBuffer.sampleRate
  );

  const secondHalf = audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    audioBuffer.length - mid,
    audioBuffer.sampleRate
  );

  // Copy data to new buffers
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    firstHalf.copyToChannel(audioBuffer.getChannelData(channel).slice(0, mid), channel);
    secondHalf.copyToChannel(audioBuffer.getChannelData(channel).slice(mid), channel);
  }

  // Convert buffers back to files
  const [firstFile, secondFile] = await Promise.all([
    audioBufferToFile(firstHalf, '1', file),
    audioBufferToFile(secondHalf, '2', file)
  ]);

  return [firstFile, secondFile];
}

/**
 * Converts AudioBuffer to File with proper format
 */
async function audioBufferToFile(
  audioBuffer: AudioBuffer,
  suffix: string,
  originalFile: File
): Promise<File> {
  try {
    // Create offline context for rendering
    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );

    // Create buffer source
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start();

    // Render audio
    const renderedBuffer = await offlineContext.startRendering();

    // Convert to WAV format with proper headers
    const wavBlob = await audioBufferToWav(renderedBuffer);

    // Create file with explicit MIME type
    const fileName = originalFile.name.split('.').slice(0, -1).join('.');
    const file = new File(
      [wavBlob],
      `${fileName}_part${suffix}.wav`,
      { type: 'audio/wav' }
    );

    // Verify file type and size
    console.log(`📝 Created WAV file part${suffix}:`, {
      name: file.name,
      type: file.type,
      size: file.size
    });

    return file;
  } catch (error) {
    console.error(`❌ Error creating WAV file part${suffix}:`, error);
    throw error;
  }
}

/**
 * Converts AudioBuffer to WAV format Blob
 */
function audioBufferToWav(buffer: AudioBuffer): Promise<Blob> {
  return new Promise((resolve) => {
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length * numberOfChannels * 2;
    const outputBuffer = new ArrayBuffer(44 + length);
    const view = new DataView(outputBuffer);
    const channels = [];
    let offset = 0;

    // Extract channels
    for (let i = 0; i < numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    // Write WAV header
    // "RIFF" chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(view, 8, 'WAVE');

    // "fmt " sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true);  // AudioFormat (1 for PCM)
    view.setUint16(22, numberOfChannels, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * numberOfChannels * 2, true); // ByteRate
    view.setUint16(32, numberOfChannels * 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample

    // "data" sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, length, true);

    // Write interleaved audio data
    offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let j = 0; j < numberOfChannels; j++) {
        const sample = Math.max(-1, Math.min(1, channels[j][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    // Create blob with proper MIME type
    const blob = new Blob([outputBuffer], { type: 'audio/wav' });
    console.log('📝 WAV blob created:', {
      size: blob.size,
      type: blob.type
    });
    
    resolve(blob);
  });
}

/**
 * Helper to write strings to DataView
 */
function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Handles transcription of audio files with automatic splitting if needed
 */
async function transcribeWithSplitting(file: File): Promise<string> {
  let parts: File[] = [file];
  let transcriptions: string[] = [];

  while (parts.length > 0) {
    const currentPart = parts.shift()!;

    if (currentPart.size > MAX_FILE_SIZE) {
      console.log(`⚠️ File size (${currentPart.size} bytes) exceeds limit. Splitting file...`);
      try {
        const [firstHalf, secondHalf] = await splitAudioFile(currentPart);
        parts.push(firstHalf, secondHalf);
      } catch (error) {
        console.error('Error splitting audio:', error);
        throw new FileProcessingError('Failed to split audio file properly');
      }
    } else {
      console.log(`🎙️ Transcribing file (${currentPart.size} bytes)...`);
      try {
        const transcription = await transcribeAudio(currentPart);
        transcriptions.push(transcription);
      } catch (error) {
        console.error(`❌ Failed to transcribe part: ${currentPart.name}`, error);
        throw new FileProcessingError(`Transcription failed for part: ${currentPart.name}`);
      }
    }
  }

  return transcriptions.join(' ').trim();
}

/**
 * Processes a File, converting videos to audio if necessary und startet den Transkriptionsprozess.
 */
export async function processFile(file: File): Promise<string> {
  try {
    console.log('🔄 Processing file:', file.name, 'Type:', file.type);
    let audioFile: File;

    // Falls der MIME-Type nicht eindeutig ist, prüfen wir zusätzlich den Dateinamen:
    if (file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mp4')) {
      console.log('🎥 Converting video to audio...');
      audioFile = await convertVideoToWav(file);
    } else if (SUPPORTED_AUDIO_TYPES.includes(file.type) || file.name.toLowerCase().endsWith('.mp3')) {
      console.log(`🎵 Using audio file directly (${file.type})`);
      audioFile = file;
    } else {
      throw new FileProcessingError(`Unsupported file format: ${file.type}`);
    }

    console.log('🎙️ Starting transcription process...');
    const transcription = await transcribeWithSplitting(audioFile);
    console.log('✅ Transcription completed');

    return transcription;
  } catch (error) {
    console.error('❌ Error processing file:', error);
    if (error instanceof FileProcessingError) {
      throw error;
    }
    throw new FileProcessingError(ERROR_MESSAGES.FILE_PROCESSING, error);
  }
}

import { convertVideoToMp3 } from './videoConverter';
import { transcribeAudio } from './openai';
import { FileProcessingError } from './errors';
import { ERROR_MESSAGES } from './constants';
import lamejs from '@breezystack/lamejs';

// Configuration constants
const MAX_CHUNK_SIZE = 4 * 1024 * 1024; // 4MB Netlify limit
const SUPPORTED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/flac'];
const MIN_CHUNK_DURATION = 3; // Minimum 3 seconds per chunk
const OVERLAP_DURATION = 1; // 1 second overlap between chunks
const SILENCE_THRESHOLD = -50; // dB threshold for silence detection
const MIN_SILENCE_DURATION = 0.5; // Minimum silence duration in seconds
const TARGET_SAMPLE_RATE = 16000; // 16kHz for optimal transcription
const MP3_BITRATE = 64; // 64kbps for good quality while keeping size small
const MP3_CHANNELS = 1; // Mono

// Helper function to format file size in MB
function formatFileSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface AudioChunk {
  id: number;
  data: Float32Array;
  sampleRate: number;
  duration: number;
  startTime: number;
}

/**
 * Detects silence in audio data using RMS power
 */
function detectSilence(data: Float32Array, sampleRate: number): number[] {
  const windowSize = Math.floor(sampleRate * 0.02); // 20ms window
  const silencePoints: number[] = [];
  
  for (let i = 0; i < data.length - windowSize; i += windowSize) {
    let rms = 0;
    for (let j = 0; j < windowSize; j++) {
      rms += data[i + j] * data[i + j];
    }
    rms = Math.sqrt(rms / windowSize);
    const db = 20 * Math.log10(rms);
    
    if (db < SILENCE_THRESHOLD) {
      const timeInSeconds = i / sampleRate;
      silencePoints.push(timeInSeconds);
    }
  }
  
  return silencePoints;
}

/**
 * Finds the best split point near the target position
 */
function findBestSplitPoint(
  silencePoints: number[],
  targetTime: number,
  sampleRate: number
): number {
  const minSilenceSamples = MIN_SILENCE_DURATION * sampleRate;
  let bestPoint = targetTime;
  let minDistance = Infinity;
  
  for (const point of silencePoints) {
    const distance = Math.abs(point - targetTime);
    if (distance < minDistance && distance < MIN_SILENCE_DURATION) {
      // Ensure we have enough silence duration
      const silenceDuration = silencePoints.filter(
        p => Math.abs(p - point) < MIN_SILENCE_DURATION
      ).length * 0.02; // 20ms per window
      
      if (silenceDuration >= MIN_SILENCE_DURATION) {
        bestPoint = point;
        minDistance = distance;
      }
    }
  }
  
  return Math.floor(bestPoint * sampleRate);
}

/**
 * Splits audio into smaller chunks that fit within Netlify's limits
 */
async function splitAudioIntoChunks(file: File): Promise<AudioChunk[]> {
  console.log('🔄 Starting audio chunking process');
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

  try {
    // Convert file to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    console.log('📝 File converted to ArrayBuffer');

    // Decode audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    console.log('📝 Audio data decoded:', {
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels
    });

    // Mix down to mono first
    const monoData = new Float32Array(audioBuffer.length);
    for (let i = 0; i < audioBuffer.length; i++) {
      let sum = 0;
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        sum += audioBuffer.getChannelData(channel)[i];
      }
      monoData[i] = sum / audioBuffer.numberOfChannels;
    }

    // Detect silence points
    console.log('🔍 Detecting silence points...');
    const silencePoints = detectSilence(monoData, audioBuffer.sampleRate);
    console.log(`Found ${silencePoints.length} potential split points`);

    // Calculate chunk parameters based on MP3 bitrate
    const bytesPerSecond = (MP3_BITRATE * 1024) / 8; // Convert bitrate to bytes/second
    const maxChunkDuration = MAX_CHUNK_SIZE / bytesPerSecond;
    const chunks: AudioChunk[] = [];
    let chunkId = 0;

    // Split into chunks
    for (let offset = 0; offset < monoData.length;) {
      const remainingSamples = monoData.length - offset;
      const targetChunkSamples = Math.min(
        Math.floor(maxChunkDuration * audioBuffer.sampleRate),
        remainingSamples
      );
      
      // Find best split point
      const splitPoint = findBestSplitPoint(
        silencePoints,
        (offset + targetChunkSamples) / audioBuffer.sampleRate,
        audioBuffer.sampleRate
      );
      
      // Ensure minimum chunk size
      const minChunkSamples = MIN_CHUNK_DURATION * audioBuffer.sampleRate;
      const actualChunkSize = Math.max(
        Math.min(splitPoint - offset + (OVERLAP_DURATION * audioBuffer.sampleRate), remainingSamples),
        minChunkSamples
      );
      
      const chunkData = new Float32Array(actualChunkSize);
      chunkData.set(monoData.slice(offset, offset + actualChunkSize));

      // Add fade in/out at chunk boundaries
      const fadeSamples = Math.min(100, actualChunkSize / 10);
      if (offset > 0) {
        // Fade in
        for (let i = 0; i < fadeSamples; i++) {
          const fadeIn = Math.sin((i / fadeSamples) * Math.PI / 2);
          chunkData[i] *= fadeIn;
        }
      }
      if (offset + actualChunkSize < monoData.length) {
        // Fade out
        for (let i = 0; i < fadeSamples; i++) {
          const fadeOut = Math.cos((i / fadeSamples) * Math.PI / 2);
          chunkData[actualChunkSize - fadeSamples + i] *= fadeOut;
        }
      }

      chunks.push({
        id: chunkId++,
        data: chunkData,
        sampleRate: TARGET_SAMPLE_RATE,
        duration: actualChunkSize / audioBuffer.sampleRate,
        startTime: offset / audioBuffer.sampleRate
      });

      console.log(`📝 Created chunk ${chunkId}:`, {
        samples: actualChunkSize,
        duration: actualChunkSize / audioBuffer.sampleRate,
        startTime: offset / audioBuffer.sampleRate,
        estimatedSize: (actualChunkSize / audioBuffer.sampleRate) * bytesPerSecond
      });

      // Move to next chunk, accounting for overlap
      offset = splitPoint;
    }

    console.log('✅ Audio chunking completed:', {
      totalChunks: chunks.length,
      totalDuration: audioBuffer.duration,
      averageChunkDuration: chunks.reduce((sum, chunk) => sum + chunk.duration, 0) / chunks.length
    });

    return chunks;
  } catch (error) {
    console.error('❌ Error splitting audio into chunks:', error);
    throw new Error(`Failed to split audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
  } finally {
    audioContext.close();
  }
}

/**
 * Converts AudioChunk to MP3 File
 */
async function chunkToMp3File(chunk: AudioChunk, originalFile: File): Promise<File> {
  try {
    // Convert Float32Array to Int16Array for MP3 encoding
    const samples = new Int16Array(chunk.data.length);
    for (let i = 0; i < chunk.data.length; i++) {
      const sample = Math.max(-1, Math.min(1, chunk.data[i]));
      samples[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }

    // Initialize MP3 encoder
    const mp3encoder = new lamejs.Mp3Encoder(
      MP3_CHANNELS,
      chunk.sampleRate,
      MP3_BITRATE
    );

    // Encode in chunks of 1152 samples (required by MP3 format)
    const mp3Data: Int8Array[] = [];
    const sampleBlockSize = 1152;
    
    for (let i = 0; i < samples.length; i += sampleBlockSize) {
      const sampleChunk = samples.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }

    // Get the last chunk of encoded data
    const finalMp3buf = mp3encoder.flush();
    if (finalMp3buf.length > 0) {
      mp3Data.push(finalMp3buf);
    }

    // Combine all chunks and convert to Int8Array
    const totalLength = mp3Data.reduce((acc, buf) => acc + buf.length, 0);
    const combinedMp3Data = new Int8Array(totalLength);
    let offset = 0;
    for (const buf of mp3Data) {
      // Convert Uint8Array to Int8Array if needed
      const int8Buf = buf instanceof Int8Array ? buf : new Int8Array(buf);
      combinedMp3Data.set(int8Buf, offset);
      offset += buf.length;
    }

    // Create MP3 file
    const fileName = originalFile.name.split('.').slice(0, -1).join('.');
    const file = new File(
      [combinedMp3Data],
      `${fileName}_chunk${chunk.id}.mp3`,
      {
        type: 'audio/mp3',
        lastModified: Date.now()
      }
    );

    console.log(`📝 Created MP3 file for chunk ${chunk.id}:`, {
      name: file.name,
      size: formatFileSize(file.size),
      duration: chunk.duration
    });

    return file;
  } catch (error) {
    console.error(`❌ Error creating MP3 file for chunk ${chunk.id}:`, error);
    throw error;
  }
}

/**
 * Clean up transcription text
 */
function cleanTranscription(text: string): string {
  // Remove "Untertitel der Amara.org-Community" and similar markers
  text = text.replace(/Untertitel der Amara\.org-Community/gi, '');
  
  // Remove multiple spaces and trim
  text = text.replace(/\s+/g, ' ').trim();
  
  return text;
}

/**
 * Validate transcription result
 */
function isValidTranscription(text: string): boolean {
  // Check for common error indicators
  const errorIndicators = [
    'Untertitel der Amara.org-Community',
    '[Music]',
    '[No speech detected]',
    '[Silence]'
  ];
  
  return text.length > 0 && !errorIndicators.some(indicator => 
    text.toLowerCase().includes(indicator.toLowerCase())
  );
}

/**
 * Processes a file chunk by chunk and combines transcriptions
 */
async function transcribeInChunks(chunks: AudioChunk[], originalFile: File): Promise<string> {
  const transcriptions: { text: string; startTime: number }[] = [];
  let retryCount = 0;
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds

  console.log('🎙️ Starting chunked transcription process');

  for (const chunk of chunks) {
    try {
      console.log(`📝 Processing chunk ${chunk.id}/${chunks.length - 1}`);
      
      // Convert chunk to MP3 file
      const mp3File = await chunkToMp3File(chunk, originalFile);
      
      // Transcribe chunk
      let transcription = await transcribeAudio(mp3File);
      
      // Clean and validate transcription
      transcription = cleanTranscription(transcription);
      
      if (!isValidTranscription(transcription)) {
        console.warn(`⚠️ Invalid transcription detected for chunk ${chunk.id}, retrying...`);
        throw new Error('Invalid transcription detected');
      }
      
      console.log(`✅ Chunk ${chunk.id} transcribed successfully:`, {
        length: transcription.length,
        wordCount: transcription.split(/\s+/).length,
        startTime: chunk.startTime
      });
      
      transcriptions.push({
        text: transcription,
        startTime: chunk.startTime
      });
      retryCount = 0; // Reset retry count on success
      
    } catch (error) {
      console.error(`❌ Failed to process chunk ${chunk.id}:`, error);
      
      if (retryCount < maxRetries) {
        console.log(`🔄 Retrying chunk ${chunk.id} (attempt ${retryCount + 1}/${maxRetries})...`);
        retryCount++;
        await new Promise(resolve => setTimeout(resolve, retryDelay * retryCount));
        chunks.unshift(chunk); // Put the chunk back at the start
        continue;
      }
      
      throw new FileProcessingError(
        `Fehler bei der Verarbeitung von Teil ${chunk.id}. ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`
      );
    }
  }

  // Sort transcriptions by start time
  transcriptions.sort((a, b) => a.startTime - b.startTime);

  // Combine transcriptions with smart text merging
  let combinedText = '';
  let lastSentenceEnd = '';

  for (const { text } of transcriptions) {
    if (combinedText) {
      // Find the overlap between the end of the last chunk and start of the current chunk
      const lastWords = lastSentenceEnd.split(/\s+/).slice(-5).join(' ');
      const currentWords = text.split(/\s+/).slice(0, 5).join(' ');
      
      // Find the best merge point
      let overlapIndex = 0;
      for (let i = Math.min(lastWords.length, currentWords.length); i > 0; i--) {
        if (lastWords.endsWith(currentWords.substring(0, i))) {
          overlapIndex = i;
          break;
        }
      }
      
      // Merge texts avoiding duplicates
      combinedText = combinedText.slice(0, -overlapIndex) + text;
    } else {
      combinedText = text;
    }
    
    // Store the end of this chunk for next iteration
    lastSentenceEnd = text.split(/[.!?]\s+/).pop() || '';
  }

  console.log('✅ All chunks transcribed successfully:', {
    totalChunks: chunks.length,
    totalLength: combinedText.length,
    totalWords: combinedText.split(/\s+/).length
  });

  return combinedText;
}

/**
 * Main file processing function
 */
export async function processFile(file: File): Promise<string> {
  try {
    console.log('🔄 Processing file:', file.name, 'Type:', file.type);
    let audioFile: File;

    // Convert video to audio if needed
    if (file.type.startsWith('video/') || file.name.toLowerCase().endsWith('.mp4')) {
      console.log('🎥 Converting video to audio...');
      audioFile = await convertVideoToMp3(file);
    } else if (SUPPORTED_AUDIO_TYPES.includes(file.type) || file.name.toLowerCase().endsWith('.mp3')) {
      console.log(`🎵 Using audio file directly (${file.type})`);
      audioFile = file;
    } else {
      throw new FileProcessingError(`Unsupported file format: ${file.type}`);
    }

    // Log file details before processing
    console.log('🎙️ Starting transcription process for:', {
      name: audioFile.name,
      type: audioFile.type,
      size: formatFileSize(audioFile.size)
    });

    // Split audio into chunks and process
    const chunks = await splitAudioIntoChunks(audioFile);
    const transcription = await transcribeInChunks(chunks, audioFile);
    
    console.log('✅ Transcription completed:', {
      length: transcription.length,
      wordCount: transcription.split(/\s+/).length
    });

    return transcription;
  } catch (error) {
    console.error('❌ Error processing file:', {
      name: file.name,
      type: file.type,
      size: formatFileSize(file.size),
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    if (error instanceof FileProcessingError) {
      throw error;
    }

    throw new FileProcessingError(
      `${ERROR_MESSAGES.FILE_PROCESSING} (${file.name}, ${formatFileSize(file.size)})`,
      error
    );
  }
}

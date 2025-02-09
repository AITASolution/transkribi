import { convertVideoToWav } from './videoConverter';
import { transcribeAudio } from './openai';
import { FileProcessingError } from './errors';
import { ERROR_MESSAGES } from './constants';

// Adjusted for Netlify's limits (4MB effective limit for binary data)
const MAX_CHUNK_SIZE = 4 * 1024 * 1024; // 4MB
const SUPPORTED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac'];

// Helper function to format file size in MB
function formatFileSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

interface AudioChunk {
  id: number;
  data: Float32Array;
  sampleRate: number;
  duration: number;
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

    // Calculate samples per chunk (4MB limit)
    const bytesPerSample = 4; // 32-bit float
    const samplesPerChunk = Math.floor(MAX_CHUNK_SIZE / bytesPerSample);
    const chunks: AudioChunk[] = [];

    // Mix down to mono and split into chunks
    const totalSamples = audioBuffer.length;
    let chunkId = 0;

    for (let offset = 0; offset < totalSamples; offset += samplesPerChunk) {
      const chunkSize = Math.min(samplesPerChunk, totalSamples - offset);
      const chunkData = new Float32Array(chunkSize);

      // Mix down to mono
      for (let i = 0; i < chunkSize; i++) {
        let sum = 0;
        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
          sum += audioBuffer.getChannelData(channel)[offset + i];
        }
        chunkData[i] = sum / audioBuffer.numberOfChannels;
      }

      // Add fade in/out at chunk boundaries
      const fadeSamples = Math.min(100, chunkSize / 10);
      if (offset > 0) {
        // Fade in
        for (let i = 0; i < fadeSamples; i++) {
          const fadeIn = Math.sin((i / fadeSamples) * Math.PI / 2);
          chunkData[i] *= fadeIn;
        }
      }
      if (offset + chunkSize < totalSamples) {
        // Fade out
        for (let i = 0; i < fadeSamples; i++) {
          const fadeOut = Math.cos((i / fadeSamples) * Math.PI / 2);
          chunkData[chunkSize - fadeSamples + i] *= fadeOut;
        }
      }

      chunks.push({
        id: chunkId++,
        data: chunkData,
        sampleRate: 16000, // Use 16kHz for Whisper
        duration: chunkSize / audioBuffer.sampleRate
      });

      console.log(`📝 Created chunk ${chunkId}:`, {
        samples: chunkSize,
        duration: chunkSize / audioBuffer.sampleRate,
        sizeBytes: chunkSize * bytesPerSample
      });
    }

    console.log('✅ Audio chunking completed:', {
      totalChunks: chunks.length,
      averageChunkSize: formatFileSize(samplesPerChunk * bytesPerSample)
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
 * Converts AudioChunk to WAV File
 */
async function chunkToWavFile(chunk: AudioChunk, originalFile: File): Promise<File> {
  const offlineContext = new OfflineAudioContext(1, chunk.data.length, chunk.sampleRate);
  
  try {
    // Create buffer source
    const source = offlineContext.createBufferSource();
    const buffer = offlineContext.createBuffer(1, chunk.data.length, chunk.sampleRate);
    buffer.copyToChannel(chunk.data, 0);
    source.buffer = buffer;

    // Add a gain node to normalize audio
    const gainNode = offlineContext.createGain();
    gainNode.gain.value = 0.9; // Slight reduction to prevent clipping

    // Connect nodes
    source.connect(gainNode);
    gainNode.connect(offlineContext.destination);
    source.start();

    // Render audio
    console.log('🎵 Rendering audio chunk:', {
      id: chunk.id,
      samples: chunk.data.length,
      duration: chunk.duration
    });
    
    const renderedBuffer = await offlineContext.startRendering();

    // Convert to WAV format
    const wavBlob = await audioBufferToWav(renderedBuffer);
    
    // Create file with proper naming
    const fileName = originalFile.name.split('.').slice(0, -1).join('.');
    const file = new File(
      [wavBlob],
      `${fileName}_chunk${chunk.id}.wav`,
      {
        type: 'audio/wav',
        lastModified: Date.now()
      }
    );

    console.log(`📝 Created WAV file for chunk ${chunk.id}:`, {
      name: file.name,
      size: formatFileSize(file.size),
      duration: chunk.duration
    });

    return file;
  } catch (error) {
    console.error(`❌ Error creating WAV file for chunk ${chunk.id}:`, error);
    throw error;
  }
}

/**
 * Converts AudioBuffer to WAV format Blob
 */
function audioBufferToWav(buffer: AudioBuffer): Promise<Blob> {
  return new Promise((resolve) => {
    const numberOfChannels = 1; // Force mono
    const sampleRate = 16000; // Use 16kHz for Whisper
    
    // Calculate total samples
    const length = buffer.length * numberOfChannels * 2; // 2 bytes per sample
    const outputBuffer = new ArrayBuffer(44 + length);
    const view = new DataView(outputBuffer);
    
    // Write WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true); // 16 bits per sample
    
    // Write data chunk
    writeString(view, 36, 'data');
    view.setUint32(40, length, true);
    
    // Write audio data
    const channelData = buffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < channelData.length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
    
    resolve(new Blob([outputBuffer], { type: 'audio/wav' }));
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
 * Processes a file chunk by chunk and combines transcriptions
 */
async function transcribeInChunks(chunks: AudioChunk[], originalFile: File): Promise<string> {
  const transcriptions: string[] = [];
  let retryCount = 0;
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds

  console.log('🎙️ Starting chunked transcription process');

  for (const chunk of chunks) {
    try {
      console.log(`📝 Processing chunk ${chunk.id}/${chunks.length - 1}`);
      
      // Convert chunk to WAV file
      const wavFile = await chunkToWavFile(chunk, originalFile);
      
      // Transcribe chunk
      const transcription = await transcribeAudio(wavFile);
      console.log(`✅ Chunk ${chunk.id} transcribed successfully:`, {
        length: transcription.length,
        wordCount: transcription.split(/\s+/).length
      });
      
      transcriptions.push(transcription);
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

  // Combine transcriptions
  const combinedText = transcriptions.join(' ').trim();
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
      audioFile = await convertVideoToWav(file);
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

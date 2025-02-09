import { convertVideoToWav } from './videoConverter';
import { transcribeAudio } from './openai';
import { FileProcessingError } from './errors';
import { ERROR_MESSAGES } from './constants';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB in bytes
const SUPPORTED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/flac'];

// Helper function to format file size in MB
function formatFileSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Splits audio at optimal points using Web Audio API
 */
async function splitAudioFile(file: File): Promise<[File, File]> {
  console.log('🔄 Starting audio file split process');
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

    // Find a zero-crossing point near the middle for clean split
    const channel = audioBuffer.getChannelData(0);
    const mid = Math.floor(audioBuffer.length / 2);
    let splitPoint = mid;
    
    // Look for a zero-crossing point within 1000 samples of the midpoint
    const searchRange = 1000;
    for (let i = 0; i < searchRange; i++) {
      if (Math.abs(channel[mid + i]) < 0.001) {
        splitPoint = mid + i;
        break;
      }
      if (Math.abs(channel[mid - i]) < 0.001) {
        splitPoint = mid - i;
        break;
      }
    }

    console.log('📝 Split point found:', {
      originalMid: mid,
      actualSplitPoint: splitPoint,
      timeSplit: splitPoint / audioBuffer.sampleRate
    });

    // Create two new buffers for the halves
    const firstHalf = audioContext.createBuffer(
      1, // Force mono
      splitPoint,
      16000 // Use 16kHz for Whisper
    );

    const secondHalf = audioContext.createBuffer(
      1, // Force mono
      audioBuffer.length - splitPoint,
      16000 // Use 16kHz for Whisper
    );

    // Mix down to mono and copy data
    for (let i = 0; i < splitPoint; i++) {
      let sum = 0;
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        sum += audioBuffer.getChannelData(channel)[i];
      }
      firstHalf.getChannelData(0)[i] = sum / audioBuffer.numberOfChannels;
    }

    for (let i = 0; i < audioBuffer.length - splitPoint; i++) {
      let sum = 0;
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        sum += audioBuffer.getChannelData(channel)[i + splitPoint];
      }
      secondHalf.getChannelData(0)[i] = sum / audioBuffer.numberOfChannels;
    }

    // Add a small fade in/out at the split point to prevent clicks
    const fadeSamples = 100;
    for (let i = 0; i < fadeSamples; i++) {
      const fadeOut = Math.cos((i / fadeSamples) * Math.PI / 2);
      const fadeIn = Math.sin((i / fadeSamples) * Math.PI / 2);
      
      firstHalf.getChannelData(0)[splitPoint - fadeSamples + i] *= fadeOut;
      secondHalf.getChannelData(0)[i] *= fadeIn;
    }

    // Convert buffers back to files
    console.log('📝 Converting split buffers to files');
    const [firstFile, secondFile] = await Promise.all([
      audioBufferToFile(firstHalf, '1', file),
      audioBufferToFile(secondHalf, '2', file)
    ]);

    console.log('✅ Audio file split completed successfully');
    return [firstFile, secondFile];
  } catch (error) {
    console.error('❌ Error splitting audio file:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Failed to split audio file: ${errorMessage}`);
  } finally {
    audioContext.close();
  }
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
    // Create offline context for rendering with standard settings
    const offlineContext = new OfflineAudioContext(
      1, // Force mono channel for better compatibility
      audioBuffer.length,
      16000 // Use 16kHz sample rate for Whisper
    );

    // Create buffer source
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;

    // Add a gain node to normalize audio
    const gainNode = offlineContext.createGain();
    gainNode.gain.value = 0.9; // Slight reduction to prevent clipping

    // Connect nodes
    source.connect(gainNode);
    gainNode.connect(offlineContext.destination);
    source.start();

    // Render audio
    console.log('🎵 Rendering audio buffer with settings:', {
      channels: 1,
      sampleRate: 16000,
      duration: audioBuffer.duration
    });
    
    const renderedBuffer = await offlineContext.startRendering();

    // Convert to WAV format with proper headers
    const wavBlob = await audioBufferToWav(renderedBuffer);

    // Create file with explicit MIME type and proper name
    const fileName = originalFile.name.split('.').slice(0, -1).join('.');
    const file = new File(
      [wavBlob],
      `${fileName}_part${suffix}.wav`,
      {
        type: 'audio/wav',
        lastModified: Date.now()
      }
    );

    // Verify file details
    console.log(`📝 Created WAV file part${suffix}:`, {
      name: file.name,
      type: file.type,
      size: file.size,
      sampleRate: renderedBuffer.sampleRate,
      duration: renderedBuffer.duration,
      channels: renderedBuffer.numberOfChannels
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
    // Force mono channel and 16kHz sample rate for Whisper
    const numberOfChannels = 1;
    const sampleRate = 16000;
    
    // Calculate total samples after resampling if needed
    const resampleRatio = sampleRate / buffer.sampleRate;
    const newLength = Math.floor(buffer.length * resampleRatio);
    const length = newLength * numberOfChannels * 2; // 2 bytes per sample
    
    const outputBuffer = new ArrayBuffer(44 + length);
    const view = new DataView(outputBuffer);
    
    // Mix down to mono and resample if needed
    const monoData = new Float32Array(newLength);
    
    // If original buffer has multiple channels, mix them down to mono
    if (buffer.numberOfChannels > 1) {
      const channels = [];
      for (let i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
      }
      
      // Simple linear interpolation for resampling
      for (let i = 0; i < newLength; i++) {
        const originalIndex = Math.floor(i / resampleRatio);
        let sum = 0;
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          sum += channels[channel][originalIndex];
        }
        monoData[i] = sum / buffer.numberOfChannels;
      }
    } else {
      // If already mono, just resample
      const originalData = buffer.getChannelData(0);
      for (let i = 0; i < newLength; i++) {
        const originalIndex = Math.floor(i / resampleRatio);
        monoData[i] = originalData[originalIndex];
      }
    }
    
    // Write WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(view, 8, 'WAVE');
    
    // fmt chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true); // 16 bits per sample
    
    // data chunk
    writeString(view, 36, 'data');
    view.setUint32(40, length, true);
    
    // Write audio data
    let offset = 44;
    for (let i = 0; i < monoData.length; i++) {
      const sample = Math.max(-1, Math.min(1, monoData[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
    
    // Create blob with proper MIME type
    const blob = new Blob([outputBuffer], { type: 'audio/wav' });
    console.log('📝 WAV blob created:', {
      size: blob.size,
      type: blob.type,
      sampleRate,
      channels: numberOfChannels,
      duration: newLength / sampleRate
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
  let retryCount = 0;
  const maxRetries = 3;
  const retryDelay = 2000; // 2 seconds

  console.log('🎙️ Starting transcription process with splitting capability');

  while (parts.length > 0) {
    const currentPart = parts.shift()!;
    console.log('📝 Processing part:', {
      name: currentPart.name,
      type: currentPart.type,
      size: formatFileSize(currentPart.size)
    });

    if (currentPart.size > MAX_FILE_SIZE) {
      console.log(`⚠️ File size (${formatFileSize(currentPart.size)}) exceeds limit of ${formatFileSize(MAX_FILE_SIZE)}. Splitting file...`);
      try {
        const [firstHalf, secondHalf] = await splitAudioFile(currentPart);
        console.log('📝 Split file into parts:', {
          firstHalf: {
            name: firstHalf.name,
            size: formatFileSize(firstHalf.size),
            type: firstHalf.type
          },
          secondHalf: {
            name: secondHalf.name,
            size: formatFileSize(secondHalf.size),
            type: secondHalf.type
          }
        });
        // Add parts in reverse order (smaller chunks first)
        parts.unshift(secondHalf, firstHalf);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('❌ Error splitting audio:', error);
        throw new FileProcessingError(
          `Datei konnte nicht aufgeteilt werden. Die Datei ist ${formatFileSize(currentPart.size)} groß, maximal erlaubt sind ${formatFileSize(MAX_FILE_SIZE)} pro Teil. Fehler: ${errorMessage}`
        );
      }
    } else {
      console.log(`🎙️ Transcribing file (${formatFileSize(currentPart.size)})...`);
      try {
        const transcription = await transcribeAudio(currentPart);
        console.log('✅ Transcription successful:', {
          partName: currentPart.name,
          transcriptionLength: transcription.length,
          wordCount: transcription.split(/\s+/).length
        });
        transcriptions.push(transcription);
        retryCount = 0; // Reset retry count on success
      } catch (error) {
        console.error(`❌ Failed to transcribe part: ${currentPart.name}`, error);
        
        // Check if error is retryable
        const isRetryableError = error instanceof Error && (
          error.message.includes('Internal Error') ||
          error.message.includes('timeout') ||
          error.message.includes('rate limit')
        );
        
        if (retryCount < maxRetries && isRetryableError) {
          console.log(`🔄 Retrying transcription (attempt ${retryCount + 1}/${maxRetries})...`);
          parts.unshift(currentPart); // Put the part back at the start of the queue
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, retryDelay * retryCount));
          continue;
        }
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new FileProcessingError(
          `Transkription fehlgeschlagen für Teil: ${currentPart.name}. Fehler: ${errorMessage}`
        );
      }
    }
  }

  const combinedText = transcriptions.join(' ').trim();
  console.log('✅ All parts transcribed successfully:', {
    totalParts: transcriptions.length,
    totalLength: combinedText.length,
    totalWords: combinedText.split(/\s+/).length
  });

  return combinedText;
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

    // Log file details before starting transcription
    console.log('🎙️ Starting transcription process for:', {
      name: audioFile.name,
      type: audioFile.type,
      size: formatFileSize(audioFile.size)
    });

    const transcription = await transcribeWithSplitting(audioFile);
    
    // Log success with transcription length
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

    // Include file details in error message
    throw new FileProcessingError(
      `${ERROR_MESSAGES.FILE_PROCESSING} (${file.name}, ${formatFileSize(file.size)})`,
      error
    );
  }
}

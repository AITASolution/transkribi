import { ERROR_MESSAGES } from './constants';
import lamejs from 'lamejs';

export async function convertVideoToMp3(videoFile: File): Promise<File> {
  console.log('🔄 Starting video to MP3 conversion...');
  
  try {
    // Create audio context
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Get video data as ArrayBuffer
    const videoData = await videoFile.arrayBuffer();
    
    // Decode audio data from video
    const audioBuffer = await audioContext.decodeAudioData(videoData);
    
    // Convert to mono and resample to 16kHz
    const targetSampleRate = 16000;
    const resampledBuffer = resampleAndConvertToMono(audioBuffer, targetSampleRate);
    
    // Convert to MP3
    const mp3Data = convertToMp3(resampledBuffer, targetSampleRate);
    
    // Create MP3 file
    const mp3Blob = new Blob([mp3Data], { type: 'audio/mp3' });
    const mp3File = new File([mp3Blob], 'converted.mp3', { type: 'audio/mp3' });
    
    console.log('✅ Conversion completed successfully');
    return mp3File;
    
  } catch (error) {
    console.error('❌ Conversion error:', error);
    throw new Error(ERROR_MESSAGES.FILE_CONVERSION);
  }
}

function resampleAndConvertToMono(audioBuffer: AudioBuffer, targetSampleRate: number): Float32Array {
  const numChannels = audioBuffer.numberOfChannels;
  const originalLength = audioBuffer.length;
  const originalSampleRate = audioBuffer.sampleRate;
  const targetLength = Math.round(originalLength * targetSampleRate / originalSampleRate);
  const resampledData = new Float32Array(targetLength);

  // Mix down to mono and resample
  for (let targetIndex = 0; targetIndex < targetLength; targetIndex++) {
    const originalIndex = Math.floor(targetIndex * originalSampleRate / targetSampleRate);
    let sum = 0;
    
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      sum += channelData[originalIndex];
    }
    
    resampledData[targetIndex] = sum / numChannels;
  }

  return resampledData;
}

function convertToMp3(audioData: Float32Array, sampleRate: number): Uint8Array {
  // Configure MP3 encoder
  const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128); // mono, 16kHz, 128kbps
  const sampleBlockSize = 1152; // Must be multiple of 576 for MP3
  const mp3Data: Int8Array[] = [];

  // Convert Float32Array to Int16Array (required by the encoder)
  const samples = new Int16Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    // Scale to 16-bit range and clip
    const sample = Math.max(-1, Math.min(1, audioData[i]));
    samples[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
  }

  // Encode samples
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

  // Calculate total length
  const totalLength = mp3Data.reduce((acc, buf) => acc + buf.length, 0);
  
  // Combine all chunks into a single Uint8Array
  const combinedMp3Data = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of mp3Data) {
    combinedMp3Data.set(buf, offset);
    offset += buf.length;
  }

  return combinedMp3Data;
}

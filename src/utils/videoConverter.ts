import { ERROR_MESSAGES } from './constants';

export async function convertVideoToMp3(videoFile: File): Promise<File> {
  console.log('🔄 Starting video to MP3 conversion...');
  
  try {
    // Create audio context
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Get video data as ArrayBuffer
    const videoData = await videoFile.arrayBuffer();
    
    // Decode audio data from video
    const audioBuffer = await audioContext.decodeAudioData(videoData);
    
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
    
    console.log('🎵 Processing audio data...');
    
    // Start rendering
    source.start(0);
    const renderedBuffer = await offlineContext.startRendering();
    
    // Convert to WAV format
    const wavData = audioBufferToWav(renderedBuffer);
    
    // Create MP3 file
    const mp3Blob = new Blob([wavData], { type: 'audio/mp3' });
    const mp3File = new File([mp3Blob], 'converted.mp3', { type: 'audio/mp3' });
    
    console.log('✅ Conversion completed successfully');
    return mp3File;
    
  } catch (error) {
    console.error('❌ Conversion error:', error);
    throw new Error(ERROR_MESSAGES.FILE_CONVERSION);
  }
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2;
  const buffer32 = new Float32Array(buffer.length * numOfChan);
  const view = new DataView(new ArrayBuffer(44 + length));
  const channels = [];
  let offset = 0;
  let pos = 0;

  // Extract channels
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  // Interleave channels
  for (let i = 0; i < buffer.length; i++) {
    for (let j = 0; j < numOfChan; j++) {
      buffer32[pos] = channels[j][i];
      pos++;
    }
  }

  // Write WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numOfChan, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2 * numOfChan, true);
  view.setUint16(32, numOfChan * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, length, true);

  // Write audio data
  const volume = 1;
  for (let i = 0; i < buffer32.length; i++) {
    view.setInt16(44 + (i * 2), buffer32[i] * (0x7FFF * volume), true);
  }

  return view.buffer;
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
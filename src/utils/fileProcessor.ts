import { convertVideoToMp3 } from './videoConverter';
import { transcribeAudio } from './openai';
import { FileProcessingError } from './errors';
import { ERROR_MESSAGES } from './constants';

export async function processFile(file: File): Promise<string> {
  try {
    console.log('🔄 Processing file:', file.name, 'Type:', file.type);
    let audioFile: File;

    if (file.type.startsWith('video/')) {
      console.log('🎥 Converting video to audio...');
      audioFile = await convertVideoToMp3(file);
    } else if (file.type === 'audio/mpeg') {
      console.log('🎵 Using audio file directly...');
      audioFile = file;
    } else {
      throw new FileProcessingError(`Nicht unterstütztes Dateiformat: ${file.type}`);
    }

    console.log('🎙️ Starting transcription...');
    const transcription = await transcribeAudio(audioFile);
    console.log('✅ Transcription completed');
    
    return transcription;
  } catch (error) {
    console.error('❌ Error processing file:', error);
    if (error instanceof Error) {
      throw new FileProcessingError(error.message, error);
    }
    throw new FileProcessingError(ERROR_MESSAGES.FILE_PROCESSING);
  }
}
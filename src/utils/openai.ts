import OpenAI from 'openai';
import { TranscriptionError } from './errors';
import { ERROR_MESSAGES } from './constants';

export async function transcribeAudio(audioFile: File): Promise<string> {
  if (!import.meta.env.VITE_OPENAI_API_KEY) {
    throw new TranscriptionError(ERROR_MESSAGES.OPENAI_KEY_MISSING);
  }

  const openai = new OpenAI({
    apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true
  });

  try {
    const response = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'de',
    });

    if (!response.text) {
      throw new TranscriptionError('Keine Transkription erhalten');
    }

    return response.text;
  } catch (error) {
    console.error('Transcription error:', error);
    if (error instanceof Error) {
      throw new TranscriptionError(error.message, error);
    }
    throw new TranscriptionError(ERROR_MESSAGES.TRANSCRIPTION);
  }
}
import { TranscriptionError } from './errors';
import { ERROR_MESSAGES } from './constants';

export async function transcribeAudio(audioFile: File): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('file', audioFile);

    const response = await fetch('http://localhost:3001/api/transcribe', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Transcription failed');
    }

    const data = await response.json();
    
    if (!data.text) {
      throw new TranscriptionError('Keine Transkription erhalten');
    }

    return data.text;
  } catch (error) {
    console.error('Transcription error:', error);
    if (error instanceof Error) {
      throw new TranscriptionError(error.message, error);
    }
    throw new TranscriptionError(ERROR_MESSAGES.TRANSCRIPTION);
  }
}

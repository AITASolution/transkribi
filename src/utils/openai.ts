import { TranscriptionError } from './errors';
import { ERROR_MESSAGES } from './constants';

export async function transcribeAudio(audioFile: File): Promise<string> {
  try {
    // Read the file as ArrayBuffer
    const arrayBuffer = await audioFile.arrayBuffer();
    
    // Convert ArrayBuffer to base64
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    const response = await fetch('/.netlify/functions/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'audio/wav',
      },
      body: base64,
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

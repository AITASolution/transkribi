import { TranscriptionError } from './errors';
import { ERROR_MESSAGES } from './constants';

export async function transcribeAudio(audioFile: File): Promise<string> {
  try {
    console.log('🎙️ Starting transcription for file:', audioFile.name);
    
    // Read the file as ArrayBuffer
    const arrayBuffer = await audioFile.arrayBuffer();
    
    // Convert ArrayBuffer to base64 using browser APIs
    const uint8Array = new Uint8Array(arrayBuffer);
    const binaryString = uint8Array.reduce((str, byte) => str + String.fromCharCode(byte), '');
    const base64 = btoa(binaryString);

    console.log('📡 Sending request to transcription service');
    const response = await fetch('/.netlify/functions/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        isBase64Encoded: true,
        body: base64
      })
    });

    // Try to parse error response even if status is not ok
    let errorData;
    let responseText;
    
    try {
      responseText = await response.text();
      errorData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse response:', responseText);
      // If response is not JSON, use the raw text as error message
      errorData = { error: responseText || 'Unknown error' };
    }

    if (!response.ok) {
      console.error('Transcription request failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });

      // Handle specific error cases
      if (response.status === 413) {
        throw new TranscriptionError('Die Datei ist zu groß für die Verarbeitung');
      }
      
      if (errorData.error === 'OpenAI API Error') {
        throw new TranscriptionError(`OpenAI API Fehler: ${errorData.details}`);
      }

      throw new TranscriptionError(
        errorData.details || errorData.error || ERROR_MESSAGES.TRANSCRIPTION
      );
    }

    // At this point we know we have valid JSON from a successful response
    if (!errorData.text) {
      console.error('No transcription in response:', errorData);
      throw new TranscriptionError('Keine Transkription erhalten');
    }

    console.log('✅ Transcription successful');
    return errorData.text;

  } catch (error) {
    console.error('❌ Transcription error:', error);
    
    if (error instanceof TranscriptionError) {
      throw error;
    }
    
    if (error instanceof Error) {
      throw new TranscriptionError(error.message, error);
    }
    
    throw new TranscriptionError(ERROR_MESSAGES.TRANSCRIPTION);
  }
}

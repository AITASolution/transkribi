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

    // Parse response
    let responseData;
    try {
      const responseText = await response.text();
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse response as JSON:', responseText);
        throw new TranscriptionError('Ungültige Antwort vom Server');
      }
    } catch (error) {
      console.error('Failed to read response:', error);
      throw new TranscriptionError('Fehler beim Lesen der Server-Antwort');
    }

    if (!response.ok) {
      console.error('Transcription request failed:', {
        status: response.status,
        statusText: response.statusText,
        error: responseData
      });

      // Handle specific error cases
      switch (response.status) {
        case 413:
          throw new TranscriptionError('Die Datei ist zu groß für die Verarbeitung');
        case 400:
          if (responseData.error === 'File too large') {
            throw new TranscriptionError('Die Audiodatei überschreitet die maximale Größe');
          }
          throw new TranscriptionError(responseData.details || 'Ungültige Anfrage');
        case 500:
          if (responseData.error === 'OpenAI API Error') {
            throw new TranscriptionError(`OpenAI API Fehler: ${responseData.details}`);
          }
          throw new TranscriptionError('Interner Serverfehler');
        default:
          throw new TranscriptionError(
            responseData.details || responseData.error || ERROR_MESSAGES.TRANSCRIPTION
          );
      }
    }

    // Validate successful response
    if (!responseData.text) {
      console.error('No transcription in response:', responseData);
      throw new TranscriptionError('Keine Transkription in der Server-Antwort');
    }

    console.log('✅ Transcription successful');
    return responseData.text;

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

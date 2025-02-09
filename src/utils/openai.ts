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
      console.log('Server response:', responseText); // Log raw response for debugging
      
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse response as JSON:', responseText);
        throw new TranscriptionError(
          `Ungültige Antwort vom Server: ${responseText.substring(0, 100)}...`
        );
      }
    } catch (error) {
      console.error('Failed to read response:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      throw new TranscriptionError(
        `Fehler beim Lesen der Server-Antwort: ${errorMessage}`
      );
    }

    if (!response.ok) {
      console.error('Transcription request failed:', {
        status: response.status,
        statusText: response.statusText,
        error: responseData
      });

      // Handle specific error cases with more detailed messages
      switch (response.status) {
        case 413:
          throw new TranscriptionError(
            'Die Datei ist zu groß für die Verarbeitung. Maximale Größe: 25MB'
          );
        case 400:
          if (responseData.error === 'File too large') {
            throw new TranscriptionError(
              'Die Audiodatei überschreitet die maximale Größe von 25MB'
            );
          }
          if (responseData.code === 'invalid_request_error') {
            throw new TranscriptionError(
              'Das Audioformat wird nicht unterstützt oder die Datei ist beschädigt'
            );
          }
          throw new TranscriptionError(
            responseData.details || 'Ungültige Anfrage. Bitte überprüfen Sie das Audioformat.'
          );
        case 429:
          throw new TranscriptionError(
            'API-Limit erreicht. Bitte versuchen Sie es in einigen Minuten erneut.'
          );
        case 500:
          if (responseData.error === 'OpenAI API Error') {
            throw new TranscriptionError(
              `OpenAI API Fehler: ${responseData.details}. Bitte versuchen Sie es erneut.`
            );
          }
          if (responseData.error === 'File Processing Error') {
            throw new TranscriptionError(
              'Fehler bei der Verarbeitung der Audiodatei. Bitte überprüfen Sie das Format.'
            );
          }
          throw new TranscriptionError(
            'Ein Serverfehler ist aufgetreten. Bitte versuchen Sie es später erneut.'
          );
        default:
          throw new TranscriptionError(
            responseData.details ||
            responseData.error ||
            `Ein unerwarteter Fehler ist aufgetreten (Status: ${response.status})`
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

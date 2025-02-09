import { TranscriptionError } from './errors';
import { ERROR_MESSAGES } from './constants';

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

export async function transcribeAudio(audioFile: File): Promise<string> {
  try {
    console.log('🎙️ Starting transcription for file:', {
      name: audioFile.name,
      type: audioFile.type,
      size: audioFile.size,
      lastModified: new Date(audioFile.lastModified).toISOString()
    });

    // Validate audio format
    if (!audioFile.type.includes('audio/wav')) {
      throw new TranscriptionError(
        'Ungültiges Audioformat. Es wird WAV-Format erwartet.'
      );
    }
    
    // Read the file as ArrayBuffer
    const arrayBuffer = await audioFile.arrayBuffer();
    
    // Convert ArrayBuffer to base64 using browser APIs
    const uint8Array = new Uint8Array(arrayBuffer);
    const chunks: string[] = [];
    const chunkSize = 0x8000; // Process in smaller chunks to avoid memory issues

    // Process the data in chunks
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      const binaryString = chunk.reduce((str, byte) => str + String.fromCharCode(byte), '');
      chunks.push(binaryString);
    }

    const base64 = btoa(chunks.join(''));

    console.log('📡 Sending request to transcription service', {
      dataSize: base64.length,
      originalSize: arrayBuffer.byteLength,
      chunks: chunks.length
    });

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch('/.netlify/functions/transcribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            isBase64Encoded: true,
            body: base64,
            metadata: {
              filename: audioFile.name,
              mimeType: audioFile.type,
              size: audioFile.size,
              attempt: attempt
            }
          })
        });

        // Get the raw response text first
        const responseText = await response.text();
        console.log('Server response status:', response.status);
        console.log('Server response headers:', Object.fromEntries(response.headers.entries()));
        
        if (responseText.trim().length === 0) {
          console.error('Empty response received');
          throw new Error('Empty response from server');
        }

        console.log('Raw server response:', responseText);

        // Try to parse as JSON
        let responseData;
        try {
          responseData = JSON.parse(responseText);
        } catch (parseError) {
          console.error('Failed to parse response as JSON:', {
            text: responseText,
            error: parseError
          });
          
          // If response is not OK and we couldn't parse JSON, throw a more specific error
          if (!response.ok) {
            throw new TranscriptionError(
              `Server returned ${response.status} ${response.statusText}${responseText ? ': ' + responseText : ''}`
            );
          }
          
          throw new TranscriptionError(
            `Ungültige Antwort vom Server: ${responseText ? responseText.substring(0, 100) + '...' : 'Empty response'}`
          );
        }

        // Handle non-200 responses
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
              if (responseData?.error === 'File too large') {
                throw new TranscriptionError(
                  'Die Audiodatei überschreitet die maximale Größe von 25MB'
                );
              }
              if (responseData?.code === 'invalid_request_error') {
                throw new TranscriptionError(
                  'Das Audioformat wird nicht unterstützt oder die Datei ist beschädigt'
                );
              }
              throw new TranscriptionError(
                responseData?.details || 'Ungültige Anfrage. Bitte überprüfen Sie das Audioformat.'
              );
            case 429:
              throw new TranscriptionError(
                'API-Limit erreicht. Bitte versuchen Sie es in einigen Minuten erneut.'
              );
            case 500:
              if (responseData?.error === 'OpenAI API Error') {
                throw new TranscriptionError(
                  `OpenAI API Fehler: ${responseData.details}. Bitte versuchen Sie es erneut.`
                );
              }
              if (responseData?.error === 'File Processing Error') {
                throw new TranscriptionError(
                  'Fehler bei der Verarbeitung der Audiodatei. Bitte überprüfen Sie das Format.'
                );
              }
              throw new TranscriptionError(
                'Ein Serverfehler ist aufgetreten. Bitte versuchen Sie es später erneut.'
              );
            default:
              throw new TranscriptionError(
                responseData?.details ||
                responseData?.error ||
                `Ein unerwarteter Fehler ist aufgetreten (Status: ${response.status})`
              );
          }
        }

        // Validate successful response
        if (!responseData?.text) {
          console.error('No transcription in response:', responseData);
          throw new TranscriptionError('Keine Transkription in der Server-Antwort');
        }

        console.log('✅ Transcription successful');
        return responseData.text;

      } catch (error) {
        console.error(`❌ Transcription error (attempt ${attempt}/${MAX_RETRIES}):`, error);
        lastError = error as Error;

        // Check if error is retryable
        const isRetryableError = error instanceof Error && (
          error.message.includes('Empty response') ||
          error.message.includes('network') ||
          error.message.includes('timeout') ||
          error.message.includes('rate limit')
        );

        if (attempt < MAX_RETRIES && isRetryableError) {
          console.log(`⏳ Waiting ${RETRY_DELAY}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
          continue;
        }

        throw error;
      }
    }

    // If we get here, all retries failed
    throw lastError || new Error('All transcription attempts failed');

  } catch (error) {
    console.error('❌ Final transcription error:', error);
    
    if (error instanceof TranscriptionError) {
      throw error;
    }
    
    if (error instanceof Error) {
      throw new TranscriptionError(error.message, error);
    }
    
    throw new TranscriptionError(ERROR_MESSAGES.TRANSCRIPTION);
  }
}

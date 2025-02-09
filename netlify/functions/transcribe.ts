import { Handler } from '@netlify/functions';
import OpenAI, { APIError } from 'openai';
import fs from 'fs';
import os from 'os';
import path from 'path';

type OpenAIError = APIError;

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB in bytes

const handler: Handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };

  console.log('🎙️ Transcription function called');

  // OPTIONS-Anfrage behandeln
  if (event.httpMethod === 'OPTIONS') {
    console.log('✅ Handling OPTIONS request');
    return {
      statusCode: 204,
      headers
    };
  }

  if (event.httpMethod !== 'POST') {
    console.log('❌ Invalid HTTP method:', event.httpMethod);
    console.log('Request details:', {
      path: event.path,
      headers: event.headers,
      queryStringParameters: event.queryStringParameters
    });
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: 'Method not allowed',
        message: 'This endpoint only accepts POST requests for audio transcription',
        receivedMethod: event.httpMethod,
        path: event.path
      })
    };
  }

  try {
    // Prüfen, ob der OpenAI API-Schlüssel vorhanden ist
    if (!process.env.OPENAI_API_KEY) {
      console.error('❌ OpenAI API key missing');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Configuration error',
          details: 'OpenAI API key is not configured'
        })
      };
    }

    // Parse request body
    if (!event.body) {
      console.error('❌ No request body provided');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid request',
          details: 'Request body is missing'
        })
      };
    }

    let requestData;
    try {
      requestData = JSON.parse(event.body);
    } catch (error) {
      console.error('❌ Failed to parse request body as JSON');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid request',
          details: 'Request body must be valid JSON'
        })
      };
    }

    if (!requestData.body || typeof requestData.body !== 'string') {
      console.error('❌ No base64 data provided or invalid format');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid request',
          details: 'Base64 audio data is missing or invalid'
        })
      };
    }

    // Log request data for debugging
    console.log('📝 Request data received:', {
      isBase64Encoded: requestData.isBase64Encoded,
      bodyLength: requestData.body.length
    });

    // Base64-String in Buffer umwandeln
    console.log('🔄 Converting base64 to buffer');
    let buffer: Buffer;
    try {
      buffer = Buffer.from(requestData.body, 'base64');

      // Log buffer details for debugging
      console.log('📝 Buffer created:', {
        length: buffer.length,
        isBuffer: Buffer.isBuffer(buffer)
      });

      // Dateigröße prüfen
      if (buffer.length > MAX_FILE_SIZE) {
        console.error('❌ File too large:', buffer.length, 'bytes');
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'File too large',
            details: `File size exceeds maximum of ${MAX_FILE_SIZE} bytes`
          })
        };
      }
    } catch (error) {
      console.error('❌ Error converting base64 to buffer:', error);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid request',
          details: 'Failed to process base64 audio data'
        })
      };
    }

    console.log('📝 Creating OpenAI client');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Schreibe den Buffer in eine temporäre Datei
    const tmpDir = os.tmpdir();
    const tmpFilePath = path.join(tmpDir, `audio_${Date.now()}.wav`);
    console.log('📝 Writing temporary file:', tmpFilePath);
    await fs.promises.writeFile(tmpFilePath, buffer);

    console.log('🎯 Starting transcription');
    let transcription;
    try {
      // Log file details before transcription
      const fileStats = await fs.promises.stat(tmpFilePath);
      console.log('📝 File details:', {
        size: fileStats.size,
        path: tmpFilePath
      });

      // Verify file exists and is readable
      await fs.promises.access(tmpFilePath, fs.constants.R_OK);
      
      // Create a ReadStream with explicit encoding
      const stream = fs.createReadStream(tmpFilePath, {
        encoding: undefined,
        highWaterMark: 1024 * 1024 // 1MB chunks
      });
      
      try {
        // Log the start of OpenAI API call
        console.log('📡 Calling OpenAI API with parameters:', {
          model: 'whisper-1',
          language: 'de',
          fileSize: fileStats.size
        });

        transcription = await openai.audio.transcriptions.create({
          file: stream,
          model: 'whisper-1',
          language: 'de',
          response_format: 'json'
        });
        
        console.log('✅ Transcription successful');
      } catch (apiError) {
        console.error('❌ OpenAI API error details:', {
          error: apiError,
          message: apiError.message,
          type: apiError.type,
          status: apiError.status
        });
        throw apiError;
      } finally {
        // Always close the stream
        stream.destroy();
      }
    } catch (error) {
      console.error('❌ OpenAI transcription error:', error);
      
      // Log detailed error information
      if (error.response) {
        console.error('OpenAI API response:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      }
      
      // Clean up the temporary file before throwing
      await fs.promises.unlink(tmpFilePath).catch(err => {
        console.error('Failed to delete temporary file:', err);
      });
      
      // Throw a more specific error
      throw new Error(
        error.response?.data?.error?.message ||
        error.message ||
        'Unknown transcription error'
      );
    }

    // Clean up the temporary file
    try {
      await fs.promises.unlink(tmpFilePath);
      console.log('🧹 Temporary file cleaned up');
    } catch (error) {
      console.error('Failed to delete temporary file:', error);
      // Continue since transcription was successful
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: transcription.text })
    };

  } catch (error) {
    console.error('❌ Transcription error:', error);
    
    // Zusätzliche Log-Ausgabe, falls ein Response-Body vorhanden ist
    if (error.response) {
      try {
        const responseBody = await error.response.text();
        console.error('Response body:', responseBody);
      } catch (innerError) {
        console.error('Failed to parse error response body');
      }
    }
    
    // Enhanced error handling
    if (error instanceof APIError) {
      console.error('OpenAI API Error:', {
        status: error.status,
        message: error.message,
        code: error.code,
        type: error.type,
        details: error.error
      });
      
      // Handle specific OpenAI error cases
      let errorDetails = error.message;
      let statusCode = error.status || 500;
      
      switch (error.code) {
        case 'invalid_request_error':
          statusCode = 400;
          errorDetails = 'Invalid audio file format or corrupted file';
          break;
        case 'rate_limit_exceeded':
          statusCode = 429;
          errorDetails = 'API rate limit exceeded. Please try again later';
          break;
        case 'file_too_large':
          statusCode = 413;
          errorDetails = 'Audio file is too large for processing';
          break;
      }
      
      return {
        statusCode,
        headers,
        body: JSON.stringify({
          error: 'OpenAI API Error',
          details: errorDetails,
          code: error.code,
          type: error.type
        })
      };
    }
    
    // Handle file system errors
    if (error.code && ['ENOENT', 'EACCES', 'EBADF'].includes(error.code)) {
      console.error('File system error:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'File Processing Error',
          details: 'Failed to process audio file',
          code: error.code
        })
      };
    }
    
    // Generic error handler
    console.error('Unhandled error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Transcription Failed',
        details: error instanceof Error ? error.message : 'Unknown server error',
        id: context.awsRequestId // Include request ID for tracking
      })
    };
  }
};

export { handler };

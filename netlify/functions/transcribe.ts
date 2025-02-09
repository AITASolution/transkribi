import { Handler } from '@netlify/functions';
import OpenAI, { APIError } from 'openai';
import fs from 'fs';
import os from 'os';
import path from 'path';

const MAX_FILE_SIZE = 6 * 1024 * 1024; // 6MB Netlify limit
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface FileSystemError extends Error {
  code?: string;
}

interface RequestMetadata {
  filename?: string;
  mimeType?: string;
  size?: number;
  attempt?: number;
}

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

  // Handle OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    console.log('✅ Handling OPTIONS request');
    return {
      statusCode: 204,
      headers
    };
  }

  // Validate HTTP method
  if (event.httpMethod !== 'POST') {
    console.log('❌ Invalid HTTP method:', event.httpMethod);
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: 'Method not allowed',
        message: 'This endpoint only accepts POST requests for audio transcription',
        receivedMethod: event.httpMethod
      })
    };
  }

  let tmpFilePath = '';
  let requestMetadata: RequestMetadata = {};

  try {
    // Verify OpenAI API key
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

    // Validate request body
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

    // Parse request data
    let requestData;
    try {
      requestData = JSON.parse(event.body);
      requestMetadata = requestData.metadata || {};
      console.log('📝 Request metadata:', requestMetadata);
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

    // Validate base64 data
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

    // Convert base64 to buffer with validation
    console.log('🔄 Converting base64 to buffer');
    let buffer: Buffer;
    try {
      // Remove any potential data URL prefix
      const base64Data = requestData.body.replace(/^data:audio\/\w+;base64,/, '');
      buffer = Buffer.from(base64Data, 'base64');

      // Validate buffer integrity
      if (buffer.length === 0) {
        throw new Error('Empty buffer after base64 conversion');
      }

      console.log('📝 Buffer created:', {
        length: buffer.length,
        isBuffer: Buffer.isBuffer(buffer),
        base64Length: base64Data.length
      });

      // Check file size
      if (buffer.length > MAX_FILE_SIZE) {
        console.error('❌ File too large:', buffer.length, 'bytes');
        return {
          statusCode: 413,
          headers,
          body: JSON.stringify({
            error: 'File too large',
            details: `File size exceeds maximum of ${MAX_FILE_SIZE} bytes`,
            size: buffer.length,
            limit: MAX_FILE_SIZE
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
          details: 'Failed to process base64 audio data: ' + (error instanceof Error ? error.message : 'Unknown error')
        })
      };
    }

    // Initialize OpenAI client
    console.log('📝 Creating OpenAI client');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Create temporary file with unique name
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    tmpFilePath = path.join(os.tmpdir(), `audio_${timestamp}_${randomString}.wav`);
    console.log('📝 Writing temporary file:', tmpFilePath);
    
    await fs.promises.writeFile(tmpFilePath, buffer);

    // Verify file exists and is readable
    await fs.promises.access(tmpFilePath, fs.constants.R_OK);
    const fileStats = await fs.promises.stat(tmpFilePath);
    console.log('📝 File details:', {
      size: fileStats.size,
      path: tmpFilePath
    });

    // Implement retry mechanism for OpenAI API calls
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`📡 Calling OpenAI API (attempt ${attempt}/${MAX_RETRIES})`, {
          model: 'whisper-1',
          language: 'de',
          fileSize: fileStats.size,
          metadata: requestMetadata
        });

        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tmpFilePath),
          model: 'whisper-1',
          language: 'de',
          response_format: 'json'
        });

        console.log('✅ Transcription successful');

        // Clean up temporary file
        try {
          await fs.promises.unlink(tmpFilePath);
          console.log('🧹 Temporary file cleaned up');
          tmpFilePath = '';
        } catch (err) {
          console.error('Failed to delete temporary file:', err);
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            text: transcription.text,
            metadata: {
              ...requestMetadata,
              processingTime: Date.now() - timestamp,
              attempts: attempt
            }
          })
        };
      } catch (error) {
        lastError = error as Error;
        console.error(`❌ OpenAI API error (attempt ${attempt}/${MAX_RETRIES}):`, error);

        if (error instanceof APIError) {
          // Don't retry on certain errors
          if (['invalid_request_error', 'invalid_api_key'].includes(error.code || '')) {
            throw error;
          }
        }

        if (attempt < MAX_RETRIES) {
          console.log(`⏳ Waiting ${RETRY_DELAY}ms before retry...`);
          await wait(RETRY_DELAY);
        }
      }
    }

    // If we get here, all retries failed
    throw lastError || new Error('All transcription attempts failed');

  } catch (error) {
    console.error('❌ Transcription error:', error);

    // Clean up temporary file if it exists
    if (tmpFilePath) {
      try {
        await fs.promises.unlink(tmpFilePath);
        console.log('🧹 Temporary file cleaned up');
      } catch (cleanupError) {
        console.error('Failed to delete temporary file:', cleanupError);
      }
    }

    // Handle OpenAI API errors
    if (error instanceof APIError) {
      console.error('OpenAI API Error:', {
        status: error.status,
        message: error.message,
        code: error.code,
        type: error.type,
        details: error.error
      });

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
        case 'invalid_api_key':
          statusCode = 401;
          errorDetails = 'Invalid API key configuration';
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
          type: error.type,
          metadata: requestMetadata
        })
      };
    }

    // Handle file system errors
    const fsError = error as FileSystemError;
    if (fsError.code && ['ENOENT', 'EACCES', 'EBADF'].includes(fsError.code)) {
      console.error('File system error:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'File Processing Error',
          details: 'Failed to process audio file',
          code: fsError.code,
          metadata: requestMetadata
        })
      };
    }

    // Generic error response
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Transcription Failed',
        details: error instanceof Error ? error.message : 'Unknown server error',
        id: context.awsRequestId,
        metadata: requestMetadata
      })
    };
  }
};

export { handler };

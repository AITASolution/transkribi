import { Handler } from '@netlify/functions';
import OpenAI from 'openai';
import { File } from 'undici';

// Constants
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB in bytes
const SUPPORTED_MIME_TYPES = ['audio/wav', 'audio/mpeg', 'audio/ogg', 'audio/flac'];

const handler: Handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
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

  if (event.httpMethod !== 'POST') {
    console.log('❌ Invalid HTTP method:', event.httpMethod);
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Validate OpenAI API key
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

    if (!event.isBase64Encoded) {
      console.error('❌ Request body is not base64 encoded');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Invalid request',
          details: 'Request body must be base64 encoded'
        })
      };
    }

    // Convert base64 body to buffer
    console.log('🔄 Converting base64 to buffer');
    const buffer = Buffer.from(event.body, 'base64');

    // Check file size
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

    console.log('📝 Creating OpenAI client');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Create a File object that OpenAI can process
    console.log('📁 Creating file object');
    const file = new File([buffer], 'audio.wav', { type: 'audio/wav' });

    // Create transcription
    console.log('🎯 Starting transcription');
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'de',
    });

    console.log('✅ Transcription successful');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: transcription.text })
    };

  } catch (error) {
    console.error('❌ Transcription error:', error);
    
    // Handle OpenAI API errors
    if (error instanceof OpenAI.APIError) {
      console.error('OpenAI API Error:', {
        status: error.status,
        message: error.message,
        code: error.code,
        type: error.type
      });
      
      return {
        statusCode: error.status || 500,
        headers,
        body: JSON.stringify({
          error: 'OpenAI API Error',
          details: error.message,
          code: error.code,
          type: error.type
        })
      };
    }
    
    // Handle other errors
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Transcription failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

export { handler };
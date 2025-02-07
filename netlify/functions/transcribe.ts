import { Handler } from '@netlify/functions';
import OpenAI from 'openai';
import { createReadStream } from 'fs';
import formidable from 'formidable';
import { IncomingMessage } from 'http';

// Helper to parse form data
const parseFormData = async (request: IncomingMessage) => {
  return new Promise<{ files: formidable.Files }>((resolve, reject) => {
    const form = formidable({
      keepExtensions: true,
      filter: part => {
        return part.mimetype === 'audio/wav' || 
               part.originalFilename?.endsWith('.wav') || 
               false;
      }
    });

    form.parse(request, (err, _, files) => {
      if (err) reject(err);
      resolve({ files });
    });
  });
};

const handler: Handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Parse the multipart form data
    const { files } = await parseFormData(event as any);
    const file = files.file?.[0];

    if (!file) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'No file provided' })
      };
    }

    // Create transcription
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(file.filepath),
      model: 'whisper-1',
      language: 'de',
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: transcription.text })
    };

  } catch (error) {
    console.error('Transcription error:', error);
    
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
import { Handler } from '@netlify/functions';
import axios from 'axios';

const RAPID_API_HOST = 'instagram-downloader-download-instagram-stories-videos4.p.rapidapi.com';

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
    if (!process.env.RAPID_API_KEY) {
      throw new Error('RAPID_API_KEY is not configured');
    }

    let url: string;
    try {
      const body = JSON.parse(event.body || '{}');
      url = body.url;
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid request body' })
      };
    }

    if (!url) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'URL is required' })
      };
    }

    const response = await axios.get(`https://${RAPID_API_HOST}/convert`, {
      params: { url },
      headers: {
        'X-RapidAPI-Key': process.env.RAPID_API_KEY,
        'X-RapidAPI-Host': RAPID_API_HOST,
      },
      maxRedirects: 5,
    });

    const data = response.data;
    
    if (!data?.media?.[0]?.url) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'No video URL found in response' })
      };
    }

    const videoUrl = data.media[0].url;
    
    // Handle special case for proxied URLs
    if (videoUrl.startsWith('https://kk.igdows.workers.dev/?url=')) {
      const decodedUrl = decodeURIComponent(videoUrl.split('?url=')[1]);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ videoUrl: decodedUrl })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ videoUrl })
    };

  } catch (error) {
    console.error('Instagram API error:', error);

    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        return {
          statusCode: 429,
          headers,
          body: JSON.stringify({ error: 'Rate limit exceeded' })
        };
      }
      if (error.response?.status === 404) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Video not found' })
        };
      }
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to fetch Instagram data',
        details: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};

export { handler };
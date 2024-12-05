import axios from 'axios';
import { VideoDownloadResult } from './types';
import { InstagramError } from '../errors';
import { ERROR_MESSAGES } from '../constants';

const RAPID_API_KEY = import.meta.env.VITE_RAPID_API_KEY;
const RAPID_API_HOST = 'instagram-downloader-download-instagram-stories-videos4.p.rapidapi.com';

export async function fetchVideoMetadata(url: string): Promise<string> {
  console.log('🔍 Fetching video metadata for URL:', url);
  
  if (!RAPID_API_KEY) {
    console.error('❌ RapidAPI key missing');
    throw new InstagramError(ERROR_MESSAGES.RAPID_API_KEY_MISSING);
  }

  try {
    console.log('📡 Making API request to RapidAPI...');
    const response = await axios.get(`https://${RAPID_API_HOST}/convert`, {
      params: { url },
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': RAPID_API_HOST,
      },
      maxRedirects: 5,
    });

    console.log('✅ API response received');
    const data = response.data;
    
    if (!data?.media?.[0]?.url) {
      console.error('❌ No video URL found in response');
      throw new Error(ERROR_MESSAGES.VIDEO_URL_NOT_FOUND);
    }

    const videoUrl = data.media[0].url;
    console.log('📹 Video URL extracted:', videoUrl);
    
    if (videoUrl.startsWith('https://kk.igdows.workers.dev/?url=')) {
      const decodedUrl = decodeURIComponent(videoUrl.split('?url=')[1]);
      console.log('🔄 Decoded proxy URL:', decodedUrl);
      return decodedUrl;
    }

    return videoUrl;
  } catch (error) {
    console.error('❌ Instagram API error:', error);
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        throw new InstagramError(ERROR_MESSAGES.RATE_LIMIT);
      }
      if (error.response?.status === 404) {
        throw new InstagramError(ERROR_MESSAGES.VIDEO_URL_NOT_FOUND);
      }
    }
    throw new InstagramError(ERROR_MESSAGES.INSTAGRAM_DATA_FETCH);
  }
}

export async function downloadVideo(videoUrl: string, reelId: string): Promise<VideoDownloadResult> {
  console.log('⬇️ Starting video download for reel:', reelId);
  
  try {
    console.log('📥 Downloading video from URL:', videoUrl);
    const response = await axios.get(videoUrl, {
      responseType: 'blob',
      headers: {
        'Accept': 'video/mp4,video/webm,video/*'
      },
      maxRedirects: 5,
      timeout: 30000,
      validateStatus: (status) => status >= 200 && status < 300
    });

    const contentType = response.headers['content-type'] || 'video/mp4';
    console.log('📁 Creating file with content type:', contentType);
    
    const blob = new Blob([response.data], { type: contentType });
    const file = new File([blob], `instagram-reel-${reelId}.mp4`, { type: contentType });

    console.log('✅ Video download completed successfully');
    return {
      file,
      mimeType: contentType
    };
  } catch (error) {
    console.error('❌ Video download error:', error);
    throw new InstagramError(ERROR_MESSAGES.VIDEO_URL_NOT_FOUND);
  }
}
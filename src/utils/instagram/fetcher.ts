import axios from 'axios';
import { VideoDownloadResult } from './types';
import { InstagramError } from '../errors';
import { ERROR_MESSAGES } from '../constants';

export async function fetchVideoMetadata(url: string): Promise<string> {
  console.log('🔍 Fetching video metadata for URL:', url);
  
  try {
    console.log('📡 Making API request to backend...');
    const response = await fetch('http://localhost:3001/api/instagram', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || ERROR_MESSAGES.INSTAGRAM_DATA_FETCH);
    }

    const data = await response.json();
    console.log('✅ API response received');
    
    if (!data?.videoUrl) {
      console.error('❌ No video URL found in response');
      throw new Error(ERROR_MESSAGES.VIDEO_URL_NOT_FOUND);
    }

    console.log('📹 Video URL extracted:', data.videoUrl);
    return data.videoUrl;
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

import { validateInstagramUrl, extractReelId, cleanInstagramUrl } from './validation';
import { fetchVideoMetadata, downloadVideo } from './fetcher';
import { InstagramError } from '../errors';
import { ERROR_MESSAGES } from '../constants';

export async function downloadInstagramReel(url: string): Promise<File> {
  console.log('🎬 Starting Instagram reel download process');
  
  if (!validateInstagramUrl(url)) {
    console.error('❌ Invalid Instagram URL:', url);
    throw new InstagramError(ERROR_MESSAGES.INVALID_INSTAGRAM_URL);
  }

  try {
    const reelId = extractReelId(url);
    console.log('🏷️ Extracted reel ID:', reelId);
    
    const cleanUrl = cleanInstagramUrl(url);
    console.log('🧹 Cleaned URL:', cleanUrl);
    
    console.log('🔍 Fetching video metadata...');
    const videoUrl = await fetchVideoMetadata(cleanUrl);
    
    console.log('⬇️ Downloading video...');
    const { file } = await downloadVideo(videoUrl, reelId);
    
    console.log('✅ Download process completed successfully');
    return file;
  } catch (error) {
    console.error('❌ Instagram download error:', error);
    if (error instanceof InstagramError) {
      throw error;
    }
    throw new InstagramError(ERROR_MESSAGES.INSTAGRAM_DATA_FETCH);
  }
}
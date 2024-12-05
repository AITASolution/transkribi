export function validateInstagramUrl(url: string): boolean {
  const regex = /^https:\/\/(?:www\.)?instagram\.com\/reel\/[\w-]+/;
  return regex.test(url);
}

export function extractReelId(url: string): string {
  const reelMatch = url.match(/\/reel\/([^/?]+)/);
  if (!reelMatch) {
    throw new Error('Invalid Instagram Reel URL');
  }
  return reelMatch[1];
}

export function cleanInstagramUrl(url: string): string {
  return url.split('?')[0];
}
export interface InstagramApiResponse {
  title: string;
  media: {
    thumbnail: string;
    url: string;
  }[];
}

export interface VideoDownloadResult {
  file: File;
  mimeType: string;
}
export const SUPPORTED_FILE_TYPES = {
  'audio/mpeg': ['.mp3'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/webm': ['.webm']
} as const;

export const ERROR_MESSAGES = {
  OPENAI_KEY_MISSING: 'OpenAI API Key ist nicht konfiguriert',
  FILE_PROCESSING: 'Fehler bei der Verarbeitung der Datei',
  TRANSCRIPTION: 'Fehler bei der Transkription. Bitte versuchen Sie es erneut.',
  INVALID_INSTAGRAM_URL: 'Ungültige Instagram Reel URL. Bitte geben Sie eine gültige URL ein.',
  INSTAGRAM_DATA_FETCH: 'Fehler beim Abrufen der Instagram Daten. Bitte versuchen Sie es später erneut.',
  VIDEO_URL_NOT_FOUND: 'Video konnte nicht gefunden werden. Möglicherweise ist das Video privat oder nicht mehr verfügbar.',
  FFMPEG_LOAD: 'Fehler beim Laden von FFmpeg',
  FILE_CONVERSION: 'Fehler bei der Konvertierung der Datei',
  RATE_LIMIT: 'Das API-Limit wurde erreicht. Bitte warten Sie einen Moment und versuchen Sie es erneut.',
  PAGE_FETCH_ERROR: 'Fehler beim Laden der Instagram-Seite. Bitte versuchen Sie es später erneut.',
  RAPID_API_KEY_MISSING: 'RapidAPI Key ist nicht konfiguriert',
  // Neue spezifische Fehlermeldungen
  FILE_TOO_LARGE: 'Die Datei ist zu groß für die Verarbeitung (Maximum: 25MB)',
  INVALID_FILE_TYPE: 'Nicht unterstütztes Dateiformat',
  OPENAI_API_ERROR: 'Fehler bei der OpenAI API. Bitte versuchen Sie es später erneut.',
  NO_AUDIO_CONTENT: 'Keine Audiodaten in der Datei gefunden',
  NETWORK_ERROR: 'Netzwerkfehler bei der Übertragung. Bitte überprüfen Sie Ihre Internetverbindung.',
  SERVER_ERROR: 'Serverfehler bei der Verarbeitung. Bitte versuchen Sie es später erneut.',
  TRANSCRIPTION_TIMEOUT: 'Zeitüberschreitung bei der Transkription. Bitte versuchen Sie es mit einer kürzeren Audiodatei.',
  TRANSCRIPTION_NO_SPEECH: 'Keine Sprache in der Audiodatei erkannt',
  INVALID_RESPONSE: 'Ungültige Antwort vom Server erhalten'
} as const;
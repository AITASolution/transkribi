export class TranscriptionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

export class FileProcessingError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'FileProcessingError';
  }
}

export class InstagramError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'InstagramError';
  }
}
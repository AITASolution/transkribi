declare module 'lamejs' {
  export class Mp3Encoder {
    /**
     * Creates a new MP3 encoder instance
     * @param channels Number of channels (1 for mono, 2 for stereo)
     * @param sampleRate Sample rate in Hz (e.g., 44100, 16000)
     * @param kbps Bitrate in kbps (e.g., 128, 192)
     */
    constructor(channels: number, sampleRate: number, kbps: number);

    /**
     * Encodes a buffer of audio samples
     * @param buffer Int16Array of audio samples
     * @returns Int8Array of MP3 data
     */
    encodeBuffer(buffer: Int16Array): Int8Array;

    /**
     * Flushes the encoder and returns any remaining MP3 data
     * @returns Int8Array of remaining MP3 data
     */
    flush(): Int8Array;
  }
}
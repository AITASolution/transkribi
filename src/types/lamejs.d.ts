declare module '@breezystack/lamejs' {
  export interface Mp3Encoder {
    encodeBuffer(buffer: Int16Array): Int8Array;
    flush(): Int8Array;
  }

  export interface Mp3EncoderConstructor {
    new (channels: number, sampleRate: number, bitRate: number): Mp3Encoder;
  }

  const lamejs: {
    Mp3Encoder: Mp3EncoderConstructor;
  };

  export default lamejs;
}
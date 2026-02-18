/**
 * Programmatic WAV audio fixture generation for integration tests.
 * Generates valid 16-bit 16kHz mono PCM sine wave tones wrapped in WAV headers.
 */

const SAMPLE_RATE = 16000;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;
const FREQUENCY_HZ = 440; // A4 tone

/**
 * Generate raw 16-bit 16kHz mono PCM samples (sine wave).
 */
export function generateTestPCM(durationMs: number = 100): Buffer {
  const numSamples = Math.floor((SAMPLE_RATE * durationMs) / 1000);
  const buffer = Buffer.alloc(numSamples * 2); // 2 bytes per sample (16-bit)

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const sample = Math.sin(2 * Math.PI * FREQUENCY_HZ * t);
    // Scale to 16-bit signed integer range
    const value = Math.round(sample * 32767);
    buffer.writeInt16LE(value, i * 2);
  }

  return buffer;
}

/**
 * Wrap raw 16-bit 16kHz mono PCM in a valid 44-byte WAV header.
 */
export function wrapInWav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  const dataSize = pcm.length;

  header.write("RIFF", 0);
  header.writeUInt32LE(dataSize + 36, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(NUM_CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE / 8), 28); // byte rate
  header.writeUInt16LE(NUM_CHANNELS * (BITS_PER_SAMPLE / 8), 32); // block align
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

/**
 * Generate a complete WAV file buffer with a sine wave tone.
 */
export function generateTestWAV(durationMs: number = 100): Buffer {
  return wrapInWav(generateTestPCM(durationMs));
}

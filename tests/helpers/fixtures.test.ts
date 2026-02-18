import { describe, it, expect } from "vitest";
import { generateTestPCM, generateTestWAV, wrapInWav } from "./fixtures.js";

describe("Test fixtures", () => {
  it("generates PCM buffer of correct size", () => {
    const pcm = generateTestPCM(100);
    // 16kHz * 0.1s * 2 bytes = 3200 bytes
    expect(pcm.length).toBe(3200);
  });

  it("generates valid WAV with correct header", () => {
    const wav = generateTestWAV(100);

    // RIFF marker
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    // File size (data + 36)
    expect(wav.readUInt32LE(4)).toBe(wav.length - 8);
    // WAVE marker
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    // fmt marker
    expect(wav.toString("ascii", 12, 16)).toBe("fmt ");
    // fmt chunk size
    expect(wav.readUInt32LE(16)).toBe(16);
    // PCM format
    expect(wav.readUInt16LE(20)).toBe(1);
    // Mono
    expect(wav.readUInt16LE(22)).toBe(1);
    // Sample rate 16000
    expect(wav.readUInt32LE(24)).toBe(16000);
    // Byte rate (16000 * 1 * 2)
    expect(wav.readUInt32LE(28)).toBe(32000);
    // Block align (1 * 2)
    expect(wav.readUInt16LE(32)).toBe(2);
    // Bits per sample
    expect(wav.readUInt16LE(34)).toBe(16);
    // data marker
    expect(wav.toString("ascii", 36, 40)).toBe("data");
    // Data size
    expect(wav.readUInt32LE(40)).toBe(3200);
    // Total size: 44 header + 3200 data
    expect(wav.length).toBe(3244);
  });

  it("wrapInWav wraps arbitrary PCM", () => {
    const fakePcm = Buffer.alloc(100);
    const wav = wrapInWav(fakePcm);
    expect(wav.length).toBe(144); // 44 + 100
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.readUInt32LE(40)).toBe(100);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WhisperSTT } from "../../src/stt/whisper.js";
import { createMockWhisperServer, type MockWhisperServer } from "../helpers/mock-whisper.js";
import { generateTestPCM } from "../helpers/fixtures.js";

describe("WhisperSTT integration", () => {
  let mock: MockWhisperServer;

  beforeAll(async () => {
    mock = await createMockWhisperServer();
  });

  afterAll(async () => {
    await mock.close();
  });

  it("transcribes audio via real HTTP to mock server", async () => {
    mock.setResponse("hello from integration test");

    const stt = new WhisperSTT({ url: mock.url });
    const result = await stt.transcribe(generateTestPCM(100));

    expect(result).toBe("hello from integration test");
  });

  it("sends multipart POST with WAV file to /inference", async () => {
    const stt = new WhisperSTT({ url: mock.url });
    await stt.transcribe(generateTestPCM(100));

    const requests = mock.getRequests();
    const last = requests[requests.length - 1];
    expect(last.contentType).toContain("multipart/form-data");
    expect(last.bodySize).toBeGreaterThan(44); // At least a WAV header
  });

  it("throws on server error", async () => {
    mock.setError(500, "Internal Server Error");

    const stt = new WhisperSTT({ url: mock.url });
    await expect(stt.transcribe(generateTestPCM(100))).rejects.toThrow(
      "Whisper STT failed: 500"
    );

    mock.clearError();
  });

  it("works with trailing slash URL", async () => {
    mock.setResponse("trailing slash test");

    const stt = new WhisperSTT({ url: `${mock.url}/` });
    const result = await stt.transcribe(generateTestPCM(100));

    expect(result).toBe("trailing slash test");
  });
});

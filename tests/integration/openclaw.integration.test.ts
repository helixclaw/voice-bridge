import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { OpenClawAI } from "../../src/ai/openclaw.js";
import { createMockOpenClawServer, type MockOpenClawServer } from "../helpers/mock-openclaw.js";

describe("OpenClawAI integration", () => {
  const TOKEN = "test-integration-token";
  let mock: MockOpenClawServer;

  beforeAll(async () => {
    mock = await createMockOpenClawServer(TOKEN);
  });

  afterAll(async () => {
    await mock.close();
  });

  it("sends chat message via real HTTP to mock server", async () => {
    mock.setResponse("Hello from mock AI!");

    const ai = new OpenClawAI({ gatewayUrl: mock.url, token: TOKEN });
    const result = await ai.chat("hi there");

    expect(result).toBe("Hello from mock AI!");
  });

  it("sends correct Authorization Bearer header", async () => {
    const ai = new OpenClawAI({ gatewayUrl: mock.url, token: TOKEN });
    await ai.chat("auth test");

    const requests = mock.getRequests();
    const last = requests[requests.length - 1];
    expect(last.authHeader).toBe(`Bearer ${TOKEN}`);
  });

  it("sends text, userId, and sessionId in request body", async () => {
    const ai = new OpenClawAI({ gatewayUrl: mock.url, token: TOKEN });
    await ai.chat("body test");

    const requests = mock.getRequests();
    const last = requests[requests.length - 1];
    expect(last.text).toBe("body test");
    expect(last.userId).toBeDefined();
    expect(last.sessionId).toBeDefined();
    expect(last.sessionId).toMatch(/^voice-/);
  });

  it("throws on auth failure (wrong token)", async () => {
    const ai = new OpenClawAI({ gatewayUrl: mock.url, token: "wrong-token" });
    await expect(ai.chat("test")).rejects.toThrow("401");
  });

  it("throws on server error", async () => {
    mock.setError(500, "internal error");

    const ai = new OpenClawAI({ gatewayUrl: mock.url, token: TOKEN });
    await expect(ai.chat("test")).rejects.toThrow("500");

    mock.clearError();
  });
});

/**
 * Mock Piper TTS HTTP server for integration tests.
 * Mimics the Piper API: POST /api/tts (JSON { text }) → WAV audio
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { generateTestWAV } from "./fixtures.js";

export interface MockPiperServer {
  server: Server;
  port: number;
  url: string;
  close: () => Promise<void>;
  setError: (status: number, message: string) => void;
  clearError: () => void;
  getRequests: () => { text: string }[];
}

export function createMockPiperServer(): Promise<MockPiperServer> {
  let errorConfig: { status: number; message: string } | null = null;
  const requests: { text: string }[] = [];

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200);
      res.end("ok");
      return;
    }

    if (req.method === "POST" && req.url === "/api/tts") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

      if (!body.text) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "no text provided" }));
        return;
      }

      requests.push({ text: body.text });

      if (errorConfig) {
        res.writeHead(errorConfig.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: errorConfig.message }));
        return;
      }

      const wav = generateTestWAV(50);
      res.writeHead(200, {
        "Content-Type": "audio/wav",
        "Content-Length": String(wav.length),
      });
      res.end(wav);
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({
        server,
        port: addr.port,
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise<void>((res) => server.close(() => res())),
        setError: (status: number, message: string) => { errorConfig = { status, message }; },
        clearError: () => { errorConfig = null; },
        getRequests: () => [...requests],
      });
    });
  });
}

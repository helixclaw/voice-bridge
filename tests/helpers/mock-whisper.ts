/**
 * Mock Whisper STT HTTP server for integration tests.
 * Mimics the whisper.cpp server API: POST /inference (multipart form) → { text }
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";

export interface MockWhisperServer {
  server: Server;
  port: number;
  url: string;
  close: () => Promise<void>;
  setResponse: (text: string) => void;
  setError: (status: number, message: string) => void;
  clearError: () => void;
  getRequests: () => { contentType: string; bodySize: number }[];
}

export function createMockWhisperServer(): Promise<MockWhisperServer> {
  let responseText = "mock transcription";
  let errorConfig: { status: number; message: string } | null = null;
  const requests: { contentType: string; bodySize: number }[] = [];

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200);
      res.end("ok");
      return;
    }

    if (req.method === "POST" && req.url === "/inference") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = Buffer.concat(chunks);

      requests.push({
        contentType: req.headers["content-type"] ?? "",
        bodySize: body.length,
      });

      if (errorConfig) {
        res.writeHead(errorConfig.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: errorConfig.message }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ text: responseText }));
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
        setResponse: (text: string) => { responseText = text; },
        setError: (status: number, message: string) => { errorConfig = { status, message }; },
        clearError: () => { errorConfig = null; },
        getRequests: () => [...requests],
      });
    });
  });
}

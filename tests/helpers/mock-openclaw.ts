/**
 * Mock OpenClaw gateway HTTP server for integration tests.
 * Mimics: POST /webhook/voice-bridge (Bearer auth, JSON) → { text }
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";

export interface MockOpenClawServer {
  server: Server;
  port: number;
  url: string;
  close: () => Promise<void>;
  setResponse: (text: string) => void;
  setError: (status: number, message: string) => void;
  clearError: () => void;
  getRequests: () => { text: string; userId: string; sessionId: string; authHeader: string }[];
}

export function createMockOpenClawServer(expectedToken: string): Promise<MockOpenClawServer> {
  let responseText = "mock AI response";
  let errorConfig: { status: number; message: string } | null = null;
  const requests: { text: string; userId: string; sessionId: string; authHeader: string }[] = [];

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "POST" && req.url === "/webhook/voice-bridge") {
      const authHeader = req.headers["authorization"] ?? "";

      // Validate Bearer token
      if (authHeader !== `Bearer ${expectedToken}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

      requests.push({
        text: body.text ?? "",
        userId: body.userId ?? "",
        sessionId: body.sessionId ?? "",
        authHeader,
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

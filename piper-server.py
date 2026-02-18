"""Minimal HTTP wrapper around Piper TTS binary."""

import http.server
import json
import subprocess
import io
import wave


class PiperHandler(http.server.BaseHTTPRequestHandler):
    MODEL = "/data/en_US-lessac-medium.onnx"

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))
        text = body.get("text", "")

        if not text:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'{"error": "no text provided"}')
            return

        try:
            proc = subprocess.run(
                ["piper", "--model", self.MODEL, "--output-raw"],
                input=text.encode("utf-8"),
                capture_output=True,
                timeout=30,
            )
            raw_pcm = proc.stdout

            # Wrap raw PCM (16-bit mono 22050Hz) in WAV
            buf = io.BytesIO()
            with wave.open(buf, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(22050)
                wf.writeframes(raw_pcm)
            wav_data = buf.getvalue()

            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(wav_data)))
            self.end_headers()
            self.wfile.write(wav_data)
        except subprocess.TimeoutExpired:
            self.send_response(504)
            self.end_headers()
            self.wfile.write(b'{"error": "TTS timed out"}')
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    print("Piper HTTP server starting on port 5000...")
    server = http.server.HTTPServer(("0.0.0.0", 5000), PiperHandler)
    server.serve_forever()

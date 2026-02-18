# voice-bridge

Modular voice-to-AI-to-voice bridge. Listens in a real-time voice channel, transcribes speech locally, sends text to an AI backend, and plays back the AI response as speech.

First implementation targets Discord, but the architecture cleanly separates platform-specific logic from core voice/AI logic for future transports.

```
┌─────────────────────────────────────────────────────────┐
│                    voice-bridge                         │
│                                                         │
│  ┌───────────┐    ┌─────┐    ┌────┐    ┌─────┐          │
│  │ Transport │───▶│ STT │───▶│ AI │───▶│ TTS │──┐       │
│  │ (Discord) │    └─────┘    └────┘    └─────┘  │       │
│  │           │◀─────────────────────────────────┘       │
│  └───────────┘                                          │
│       │              │          │          │            │
│       ▼              ▼          ▼          ▼            │
│  discord.js     whisper.cpp  OpenClaw   Piper TTS       │
│  @discordjs/    (HTTP)       (HTTP)     (HTTP)          │
│  voice                                                  │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

- Node.js 22+
- pnpm
- Docker & Docker Compose (for whisper + piper servers)
- A Discord bot token

## Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to **Bot** → click **Reset Token** → copy the token
4. Enable these **Privileged Gateway Intents**:
   - Message Content Intent
5. Go to **OAuth2** → **URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Connect`, `Speak`, `Use Voice Activity`
6. Use the generated URL to invite the bot to your server
7. Copy your **Application ID** (Client ID) and **Guild ID** (Server ID)

## Configuration

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `DISCORD_TOKEN` | Yes | Bot token |
| `DISCORD_CLIENT_ID` | Yes | Application/Client ID |
| `DISCORD_GUILD_ID` | Yes | Server ID for slash commands |
| `DISCORD_LISTEN_USER_ID` | No | Only respond to this user |
| `WHISPER_URL` | No | Whisper server URL (default: `http://whisper:8080`) |
| `PIPER_URL` | No | Piper server URL (default: `http://piper:5000`) |
| `OPENCLAW_URL` | Yes | OpenClaw API base URL |
| `OPENCLAW_API_KEY` | Yes | OpenClaw API key |
| `OPENCLAW_MODEL` | No | Model identifier (default: `default`) |
| `OPENCLAW_SYSTEM_PROMPT` | No | Custom system prompt |

## Quick Start (Docker Compose)

```bash
cp .env.example .env
# Edit .env with your credentials

docker compose up --build
```

This starts:
- **voice-bridge** — the Node.js bot
- **whisper** — whisper.cpp HTTP server (speech-to-text)
- **piper** — Piper TTS server (text-to-speech)

## Local Development

```bash
pnpm install
pnpm build

# Register slash commands (one-time)
pnpm deploy-commands

# Run the bot
pnpm start

# Or watch mode for development
pnpm dev
```

## Slash Commands

| Command | Description |
|---|---|
| `/join` | Join your current voice channel |
| `/leave` | Leave the voice channel |
| `/status` | Show connection status |

## Running Tests

```bash
pnpm test
```

## Architecture

The project is built around four core interfaces that are completely platform-agnostic:

- **`VoiceTransport`** — join/leave voice, receive audio streams, play audio back
- **`SpeechToText`** — audio buffers → text
- **`TextToSpeech`** — text → audio buffers
- **`AIBackend`** — text in → text out

The **`Pipeline`** orchestrator wires these together: `transport → STT → AI → TTS → transport playback`.

### Project Structure

```
src/
├── core/
│   ├── interfaces.ts    # Platform-agnostic interfaces
│   ├── pipeline.ts      # Pipeline orchestrator
│   └── index.ts         # Core exports
├── transports/
│   └── discord/
│       ├── transport.ts  # Discord VoiceTransport implementation
│       ├── commands.ts   # Slash command definitions + handlers
│       ├── deploy-commands.ts  # One-time command registration
│       └── index.ts
├── stt/
│   └── whisper.ts       # Whisper.cpp STT implementation
├── tts/
│   └── piper.ts         # Piper TTS implementation
├── ai/
│   └── openclaw.ts      # OpenClaw AI implementation
├── config.ts            # Environment config loader
└── index.ts             # Entry point
```

### Adding a New Transport

Implement the `VoiceTransport` interface from `src/core/interfaces.ts`:

```typescript
import type { VoiceTransport, UserAudioStream } from "./core/interfaces.js";

class MyTransport implements VoiceTransport {
  async join(channelId: string): Promise<void> { /* ... */ }
  async leave(): Promise<void> { /* ... */ }
  onUserAudio(handler: (userAudio: UserAudioStream) => void): void { /* ... */ }
  async playAudio(audio: Buffer): Promise<void> { /* ... */ }
  isConnected(): boolean { /* ... */ }
}
```

Then wire it into a `Pipeline` instance — the STT, AI, and TTS modules work unchanged.

### Adding a New STT/TTS/AI Backend

Implement the corresponding interface:

```typescript
// STT
class MySTT implements SpeechToText {
  async transcribe(audio: Buffer): Promise<string> { /* ... */ }
}

// TTS
class MyTTS implements TextToSpeech {
  async synthesize(text: string): Promise<Buffer> { /* ... */ }
}

// AI
class MyAI implements AIBackend {
  async chat(userMessage: string): Promise<string> { /* ... */ }
}
```

## License

ISC

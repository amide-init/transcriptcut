# client

The Next.js app for the AI Video Editor — see the [repo root README](../README.md)
for project status and the [product spec](../claude.md).

## Getting started

```bash
npm install
```

Add an OpenAI API key (server-side only, used by `/api/transcribe`) to
`.env`:

```bash
OPENAI_API_KEY=sk-...
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Stack

- Next.js 16 (App Router, Turbopack)
- Tailwind CSS v4 + shadcn/ui (Radix primitives) — custom dark editor theme, see `src/app/globals.css`
- Zustand for editor state (`src/stores`)
- OpenAI Whisper for transcription (`src/lib/ai/transcribe.ts`)

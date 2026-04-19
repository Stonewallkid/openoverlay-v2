# OpenOverlay v2

A social annotation layer for the web. Draw, annotate, and play games on any webpage — and share it all with friends.

## Vision

OpenOverlay transforms the web into a collaborative canvas. Users can:
- **Draw** freehand graffiti on any webpage
- **Annotate** text with notes and comments
- **Play** racing games on page content
- **Follow** other users to see their creations
- **Comment** on annotations and drawings
- **Filter** content by user or feature type

## Project Status

🚧 **Complete rewrite in progress** — migrating from prototype to production-ready architecture.

## Architecture

See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for technical design.

## Project Structure

```
openoverlay-v2/
├── docs/                    # Documentation
│   ├── ARCHITECTURE.md      # System design
│   ├── API.md               # API reference
│   └── MONETIZATION.md      # Premium features spec
├── extension/               # Chrome extension (client)
│   ├── src/
│   │   ├── content/         # Content scripts
│   │   ├── background/      # Service worker
│   │   ├── ui/              # UI components
│   │   ├── canvas/          # Drawing engine
│   │   ├── game/            # Runner game
│   │   └── shared/          # Shared utilities
│   ├── manifest.json
│   └── package.json
├── server/                  # Backend API
│   ├── src/
│   │   ├── routes/          # API endpoints
│   │   ├── models/          # Data models
│   │   ├── services/        # Business logic
│   │   └── middleware/      # Auth, rate limiting
│   └── package.json
└── shared/                  # Shared types/schemas
    └── types/
```

## Tech Stack

### Extension (Client)
- TypeScript
- Vite (bundler)
- Web Components (UI)
- Canvas 2D API

### Backend
- Node.js + Express (or Hono for edge)
- PostgreSQL (users, social graph, metadata)
- Redis (sessions, caching, rate limiting)
- S3-compatible storage (drawings as images)
- WebSocket (real-time sync)

### Infrastructure
- Supabase or Railway (database + auth)
- Cloudflare R2 (storage)
- Stripe (payments)

## Getting Started

```bash
# Install dependencies
cd extension && npm install
cd ../server && npm install

# Development
npm run dev        # Start extension in watch mode
npm run dev:server # Start API server

# Build
npm run build      # Production build
```

## License

TBD

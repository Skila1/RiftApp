# RiftApp

> **Fast. Clean. Yours.** — Instant communication.

A modern, privacy-first communication platform. Think fast group chat with hubs, streams, and real-time messaging — built for performance and simplicity.

## Quick Start

### Prerequisites

- [Go 1.22+](https://go.dev/dl/)
- [Node.js 20+](https://nodejs.org/)
- [Docker + Docker Compose](https://docs.docker.com/get-docker/)

### One-Command Start (Docker)

```bash
docker-compose up --build
```

This starts:
- **PostgreSQL** on port 5432
- **Redis** on port 6379
- **MinIO** (S3) on port 9000 (console: 9001)
- **Backend API** on port 8080
- **Frontend** on port 3000

### Development (Local)

**1. Start infrastructure:**
```bash
docker-compose up postgres redis minio -d
```

**2. Run backend:**
```bash
cd backend
cp ../.env.example .env
go mod tidy
go run ./cmd/riftapp
```

**3. Run frontend:**
```bash
cd frontend
npm install
npm run dev
```

Frontend dev server runs on `http://localhost:5173` with API proxy to backend.

## Architecture

```
Frontend (React/Vite/Tailwind)
    ↕ REST + WebSocket
Backend (Go / chi router)
    ↕
PostgreSQL + Redis + S3
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for full details including database schema, API design, and WebSocket events.

## Project Structure

```
RiftApp/
├── backend/
│   ├── cmd/riftapp/          # Entry point
│   ├── internal/
│   │   ├── api/              # HTTP handlers + router
│   │   ├── auth/             # Auth service + JWT
│   │   ├── config/           # Configuration
│   │   ├── database/         # DB connection + migrations
│   │   ├── middleware/       # Auth middleware
│   │   ├── models/           # Data models + permissions
│   │   └── ws/               # WebSocket hub + client
│   ├── Dockerfile
│   └── go.mod
├── frontend/
│   ├── src/
│   │   ├── api/              # API client
│   │   ├── components/
│   │   │   ├── auth/         # Login/register
│   │   │   ├── chat/         # Chat panel + messages
│   │   │   ├── layout/       # App layout
│   │   │   └── sidebar/      # Hub + stream sidebars
│   │   ├── hooks/            # WebSocket hook
│   │   ├── stores/           # Zustand state
│   │   └── types/            # TypeScript types
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── ARCHITECTURE.md
```

## Naming

| Traditional    | RiftApp        |
|---------------|----------------|
| Server        | **Hub**        |
| Channel       | **Stream**     |
| Voice Channel | **Voice Stream** |
| Roles         | **Ranks**      |

## License

Private — all rights reserved.

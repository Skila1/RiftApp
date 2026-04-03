# Riptide — Architecture

> Fast. Clean. Yours. — Instant communication.

## High-Level Architecture

```
┌─────────────┐     ┌──────────────────────────────────────────────┐
│   Frontend   │────▶│              API Gateway (Go)                │
│  React/Vite  │◀───│  REST + WebSocket Upgrade                    │
└─────────────┘     └──────┬──────────┬──────────┬────────────────┘
                           │          │          │
                    ┌──────▼──┐ ┌─────▼────┐ ┌──▼──────────┐
                    │  Auth   │ │ Messaging│ │   Voice     │
                    │ Service │ │ Service  │ │  (LiveKit)  │
                    └────┬────┘ └────┬─────┘ └─────────────┘
                         │          │
                    ┌────▼──────────▼─────┐
                    │     PostgreSQL       │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │       Redis          │
                    │  (cache + pubsub)    │
                    └─────────────────────┘
```

## Service Breakdown

### API Gateway (single Go binary, modular internal packages)
- HTTP REST API for CRUD operations
- WebSocket endpoint for real-time messaging
- JWT-based authentication middleware
- Rate limiting via Redis

### Auth Service (internal package)
- Registration (email/username + password)
- Login → JWT access + refresh tokens
- Session management via Redis
- Password hashing with bcrypt

### Messaging Service (internal package)
- Message CRUD (create, edit, delete)
- Reactions
- WebSocket broadcast via Redis PubSub
- File/image upload to S3-compatible storage

### Voice Service (external — LiveKit)
- WebRTC SFU via LiveKit
- Room management mapped to Voice Streams
- Push-to-talk + voice activity detection (client-side)

## Data Flow — Real-time Messaging

```
Client A sends message
    → WebSocket → Server validates + stores in PostgreSQL
    → Server publishes to Redis PubSub (stream:{stream_id})
    → All connected servers subscribed to that stream
    → Broadcast to connected WebSocket clients in that stream
```

## Scaling Strategy

- **Horizontal**: Multiple API server instances behind load balancer
- **Redis PubSub**: Cross-instance message fan-out
- **PostgreSQL**: Read replicas for scaling reads
- **S3**: Stateless file storage
- **LiveKit**: Scales independently

## Naming Map

| Traditional | Riptide   |
|------------|-----------|
| Server     | Hub       |
| Channel    | Stream    |
| Voice Channel | Voice Stream |
| Roles      | Ranks     |

## Database Schema

### users
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| username | VARCHAR(32) | unique |
| email | VARCHAR(255) | unique, nullable |
| password_hash | TEXT | bcrypt |
| display_name | VARCHAR(64) | |
| avatar_url | TEXT | nullable |
| status | SMALLINT | 0=offline, 1=online, 2=idle, 3=dnd |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### hubs
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| name | VARCHAR(100) | |
| owner_id | UUID | FK → users |
| icon_url | TEXT | nullable |
| created_at | TIMESTAMPTZ | |

### hub_members
| Column | Type | Notes |
|--------|------|-------|
| hub_id | UUID | FK → hubs |
| user_id | UUID | FK → users |
| rank_id | UUID | FK → ranks, nullable |
| joined_at | TIMESTAMPTZ | |
| PK | (hub_id, user_id) | |

### ranks
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| hub_id | UUID | FK → hubs |
| name | VARCHAR(64) | |
| color | VARCHAR(7) | hex color |
| permissions | BIGINT | bitfield |
| position | INT | ordering |
| created_at | TIMESTAMPTZ | |

### streams
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| hub_id | UUID | FK → hubs |
| name | VARCHAR(100) | |
| type | SMALLINT | 0=text, 1=voice |
| position | INT | ordering |
| is_private | BOOLEAN | default false |
| created_at | TIMESTAMPTZ | |

### messages
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK (UUIDv7 for time-ordering) |
| stream_id | UUID | FK → streams |
| author_id | UUID | FK → users |
| content | TEXT | max 4000 chars |
| edited_at | TIMESTAMPTZ | nullable |
| created_at | TIMESTAMPTZ | |

### attachments
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| message_id | UUID | FK → messages |
| filename | VARCHAR(255) | |
| url | TEXT | S3 URL |
| content_type | VARCHAR(128) | |
| size_bytes | BIGINT | |

### reactions
| Column | Type | Notes |
|--------|------|-------|
| message_id | UUID | FK → messages |
| user_id | UUID | FK → users |
| emoji | VARCHAR(32) | unicode emoji |
| created_at | TIMESTAMPTZ | |
| PK | (message_id, user_id, emoji) | |

### direct_messages
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| sender_id | UUID | FK → users |
| receiver_id | UUID | FK → users |
| content | TEXT | |
| edited_at | TIMESTAMPTZ | nullable |
| created_at | TIMESTAMPTZ | |

### friendships
| Column | Type | Notes |
|--------|------|-------|
| user_id | UUID | FK → users |
| friend_id | UUID | FK → users |
| status | SMALLINT | 0=pending, 1=accepted, 2=blocked |
| created_at | TIMESTAMPTZ | |
| PK | (user_id, friend_id) | |

## API Design

### REST Endpoints

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout

GET    /api/users/@me
PATCH  /api/users/@me
GET    /api/users/:id

POST   /api/hubs
GET    /api/hubs
GET    /api/hubs/:id
PATCH  /api/hubs/:id
DELETE /api/hubs/:id
GET    /api/hubs/:id/members
POST   /api/hubs/:id/join
POST   /api/hubs/:id/leave

POST   /api/hubs/:id/streams
GET    /api/hubs/:id/streams
GET    /api/streams/:id
PATCH  /api/streams/:id
DELETE /api/streams/:id

GET    /api/streams/:id/messages?before=&limit=
POST   /api/streams/:id/messages
PATCH  /api/messages/:id
DELETE /api/messages/:id
POST   /api/messages/:id/reactions
DELETE /api/messages/:id/reactions/:emoji

GET    /api/friends
POST   /api/friends/:userId
DELETE /api/friends/:userId
GET    /api/dms/:userId

POST   /api/hubs/:id/ranks
PATCH  /api/ranks/:id
DELETE /api/ranks/:id
```

### WebSocket Events

```
Connection: ws://host/ws?token=<jwt>

Client → Server:
  { "op": "subscribe", "d": { "stream_id": "..." } }
  { "op": "unsubscribe", "d": { "stream_id": "..." } }
  { "op": "heartbeat" }
  { "op": "typing", "d": { "stream_id": "..." } }

Server → Client:
  { "op": "ready", "d": { "user": {...}, "hubs": [...] } }
  { "op": "message_create", "d": { ... } }
  { "op": "message_update", "d": { ... } }
  { "op": "message_delete", "d": { "id": "...", "stream_id": "..." } }
  { "op": "reaction_add", "d": { ... } }
  { "op": "reaction_remove", "d": { ... } }
  { "op": "typing_start", "d": { "user_id": "...", "stream_id": "..." } }
  { "op": "presence_update", "d": { "user_id": "...", "status": 1 } }
  { "op": "heartbeat_ack" }
```

## Permission Bitfield (Ranks)

```
VIEW_STREAMS      = 1 << 0
SEND_MESSAGES     = 1 << 1
MANAGE_MESSAGES   = 1 << 2
MANAGE_STREAMS    = 1 << 3
MANAGE_HUB        = 1 << 4
MANAGE_RANKS      = 1 << 5
KICK_MEMBERS      = 1 << 6
BAN_MEMBERS       = 1 << 7
CONNECT_VOICE     = 1 << 8
SPEAK_VOICE       = 1 << 9
ADMINISTRATOR     = 1 << 31
```

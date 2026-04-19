# OpenOverlay v2 Architecture

## Overview

OpenOverlay is a Chrome extension with a backend API. The extension injects an overlay onto webpages that allows users to draw, annotate, and play games. The backend handles authentication, social features, and content storage.

```
┌─────────────────────────────────────────────────────────────┐
│                     Chrome Extension                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Content    │  │  Background │  │  Popup/Settings     │  │
│  │  Scripts    │  │  Worker     │  │  Page               │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
└─────────┼────────────────┼────────────────────┼─────────────┘
          │                │                    │
          └────────────────┼────────────────────┘
                           │
                    ┌──────▼──────┐
                    │   REST API  │
                    │  + WebSocket│
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
    ┌─────▼─────┐   ┌──────▼──────┐  ┌─────▼─────┐
    │ PostgreSQL│   │    Redis    │  │  R2/S3    │
    │  (data)   │   │  (cache)    │  │ (assets)  │
    └───────────┘   └─────────────┘  └───────────┘
```

## Data Models

### Users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  avatar_url TEXT,
  tier VARCHAR(20) DEFAULT 'free', -- 'free', 'pro', 'creator'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE follows (
  follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);
```

### Content

```sql
-- Drawings/graffiti stored per-page
CREATE TABLE drawings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  page_url_hash VARCHAR(64) NOT NULL, -- SHA-256 for indexing
  data JSONB NOT NULL, -- strokes, text items
  visibility VARCHAR(20) DEFAULT 'public', -- 'public', 'followers', 'private'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_drawings_page ON drawings(page_url_hash);
CREATE INDEX idx_drawings_user ON drawings(user_id);

-- Annotations (text highlights with notes)
CREATE TABLE annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  page_url_hash VARCHAR(64) NOT NULL,

  -- W3C Web Annotation selectors
  selector_type VARCHAR(50) NOT NULL, -- 'TextQuoteSelector'
  selector_exact TEXT NOT NULL,
  selector_prefix TEXT,
  selector_suffix TEXT,
  css_hint TEXT, -- CSS path for re-anchoring

  body TEXT, -- The annotation note
  visibility VARCHAR(20) DEFAULT 'public',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_annotations_page ON annotations(page_url_hash);

-- Comments on annotations
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annotation_id UUID REFERENCES annotations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE, -- for threading
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comments_annotation ON comments(annotation_id);

-- Race courses (game data)
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  page_url TEXT NOT NULL,
  page_url_hash VARCHAR(64) NOT NULL,
  data JSONB NOT NULL, -- start, flags, finish, hazards
  visibility VARCHAR(20) DEFAULT 'public',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leaderboard times
CREATE TABLE race_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  time_ms INTEGER NOT NULL,
  character VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_race_times_course ON race_times(course_id, time_ms);
```

### User Preferences

```sql
-- What content types user wants to see
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  show_drawings BOOLEAN DEFAULT true,
  show_annotations BOOLEAN DEFAULT true,
  show_courses BOOLEAN DEFAULT true,
  show_from VARCHAR(20) DEFAULT 'following', -- 'all', 'following', 'none'
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-user mutes/blocks
CREATE TABLE user_blocks (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, blocked_id)
);
```

## API Endpoints

### Authentication
```
POST   /auth/register          # Create account
POST   /auth/login             # Login (returns JWT)
POST   /auth/logout            # Invalidate session
GET    /auth/me                # Current user
POST   /auth/google            # Google OAuth callback
```

### Users
```
GET    /users/:username        # Public profile
GET    /users/:id/followers    # List followers
GET    /users/:id/following    # List following
POST   /users/:id/follow       # Follow user
DELETE /users/:id/follow       # Unfollow user
PATCH  /users/me               # Update profile
```

### Content
```
# Drawings
GET    /pages/:urlHash/drawings      # Get drawings for page
POST   /drawings                      # Create/update drawing
DELETE /drawings/:id                  # Delete drawing

# Annotations
GET    /pages/:urlHash/annotations   # Get annotations for page
POST   /annotations                   # Create annotation
PATCH  /annotations/:id               # Update annotation
DELETE /annotations/:id               # Delete annotation

# Comments
GET    /annotations/:id/comments     # Get comments
POST   /annotations/:id/comments     # Add comment
DELETE /comments/:id                  # Delete comment

# Courses
GET    /pages/:urlHash/courses       # Get courses for page
POST   /courses                       # Create course
DELETE /courses/:id                   # Delete course

# Race times
GET    /courses/:id/leaderboard      # Top times
POST   /courses/:id/times            # Submit time
```

### Feed
```
GET    /feed                   # Content from followed users
GET    /feed/page/:urlHash     # Content for specific page from feed
```

### Subscriptions (Stripe)
```
POST   /billing/checkout       # Create Stripe checkout session
POST   /billing/portal         # Customer portal link
POST   /billing/webhook        # Stripe webhook handler
```

## Extension Architecture

### Content Scripts

```
src/content/
├── index.ts              # Entry point, orchestrates modules
├── state.ts              # Centralized state store
├── api.ts                # API client
│
├── canvas/
│   ├── BaseCanvas.ts     # Persistent drawing layer
│   ├── TempCanvas.ts     # Preview/interaction layer
│   ├── Renderer.ts       # Drawing primitives
│   └── Brush.ts          # Brush styles
│
├── annotations/
│   ├── Highlighter.ts    # Text highlighting
│   ├── Anchoring.ts      # Text range resolution
│   └── Tooltip.ts        # Hover tooltips
│
├── game/
│   ├── Physics.ts        # Movement, collision
│   ├── Sprites.ts        # Character rendering
│   ├── Course.ts         # Race course management
│   └── Input.ts          # Keyboard/touch handling
│
├── ui/
│   ├── FAB.ts            # Floating action button
│   ├── Toolbar.ts        # Drawing toolbar
│   ├── Panel.ts          # Settings/feed panel
│   ├── UserList.ts       # Toggle users on/off
│   └── Comments.ts       # Comment thread UI
│
└── sync/
    ├── WebSocketClient.ts # Real-time updates
    └── OfflineQueue.ts    # Offline support
```

### State Management

Simple pub/sub store:

```typescript
interface OverlayState {
  // Auth
  user: User | null;
  token: string | null;

  // UI mode
  mode: 'none' | 'draw' | 'text' | 'annotate' | 'game';
  panelOpen: boolean;

  // Drawing
  brush: {
    color: string;
    width: number;
    style: 'solid' | 'spray' | 'dots' | 'rainbow' | 'glow';
    opacity: number;
  };
  strokes: Stroke[];

  // Content visibility
  filters: {
    showDrawings: boolean;
    showAnnotations: boolean;
    showCourses: boolean;
    visibleUsers: Set<string>; // user IDs to show, empty = all
    hiddenUsers: Set<string>;  // user IDs to hide
  };

  // Page content
  pageContent: {
    drawings: Drawing[];
    annotations: Annotation[];
    courses: Course[];
  };

  // Game
  game: {
    active: boolean;
    character: string;
    course: Course | null;
  };
}

// Store implementation
type Listener<T> = (state: T) => void;

class Store<T> {
  private state: T;
  private listeners: Set<Listener<T>> = new Set();

  constructor(initial: T) {
    this.state = initial;
  }

  getState(): T {
    return this.state;
  }

  setState(partial: Partial<T>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach(fn => fn(this.state));
  }

  subscribe(fn: Listener<T>): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
```

### UI Components

Using Web Components for encapsulation:

```typescript
// Example: FAB component
class OverlayFAB extends HTMLElement {
  private shadow: ShadowRoot;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.attachEvents();
  }

  private render() {
    this.shadow.innerHTML = `
      <style>
        :host { position: fixed; right: 18px; bottom: 18px; z-index: 2147483647; }
        .fab { width: 56px; height: 56px; border-radius: 50%; ... }
      </style>
      <button class="fab">•••</button>
      <div class="menu hidden">...</div>
    `;
  }

  private attachEvents() {
    this.shadow.querySelector('.fab')?.addEventListener('click', () => {
      store.setState({ panelOpen: !store.getState().panelOpen });
    });
  }
}

customElements.define('oo-fab', OverlayFAB);
```

## Premium Features (Tiers)

### Free
- Draw on any page (public only)
- Create annotations (public only)
- Follow up to 50 users
- Play races, submit times
- Basic brush styles

### Pro ($5/mo)
- Private/followers-only content
- Unlimited follows
- All brush styles + custom colors
- Export drawings as images
- Ad-free experience
- Priority support

### Creator ($15/mo)
- Everything in Pro
- Custom sprites (upload your own)
- Course editor tools
- Analytics (views, engagement)
- Verified badge
- API access

## Security Considerations

1. **Content Moderation**: Need to handle inappropriate drawings/annotations
   - Report button on all content
   - Admin dashboard for review
   - Auto-moderation via image scanning (future)

2. **Rate Limiting**: Prevent spam
   - Redis-based rate limiter
   - Per-user and per-IP limits
   - Stricter limits for anonymous/free users

3. **Input Validation**: All user input sanitized
   - URL validation before storage
   - Text length limits
   - JSON schema validation for drawing data

4. **Authentication**:
   - JWT with short expiry (15 min)
   - Refresh tokens (7 days)
   - Secure cookie storage in extension

## Performance Optimizations

1. **Drawing Storage**: Store as vector data, render client-side
   - Compress stroke data (delta encoding)
   - Lazy load off-screen content

2. **Caching**:
   - Redis cache for frequently accessed pages
   - IndexedDB for offline access
   - Service worker for static assets

3. **Real-time Sync**:
   - WebSocket for live updates
   - Debounce writes (1 second)
   - Batch multiple changes

4. **Image Generation**:
   - Generate preview thumbnails server-side
   - Use for social sharing / embeds

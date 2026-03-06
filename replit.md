# Gleam - Beauty Product Discovery App

## Overview

Gleam is a React Native/Expo mobile application that helps users identify beauty products from tutorial videos (TikTok, Instagram, YouTube). Users share video URLs, the app uses AI (Google Gemini) to analyze video content and detect products, then matches detected items against a beauty product catalog. The app also supports skin tone analysis from selfies to recommend personalized product shades.

**Core Value Proposition**: Transform "Get Ready With Me" and makeup tutorial videos into actionable shopping lists with personalized shade recommendations.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React Native with Expo SDK 54 (New Architecture enabled)
- **Navigation**: React Navigation v7 with bottom tabs and native stack navigators
  - Tab navigation: Lookbook, Profile (simplified two-tab structure)
  - Modal screens: Video Analysis, Product Detail, Look Detail
- **State Management**: TanStack React Query for server state
- **Styling**: Custom theme system with light/dark mode support via `useTheme` hook
- **Animations**: React Native Reanimated for elastic video and micro-interactions
- **Video Playback**: expo-video for embedded tutorial playback
- **Path Aliases**: `@/` maps to `./client/`, `@shared/` maps to `./shared/`

### Look Detail Experience (Layered Navigation)
The look detail screen uses a single-object layered navigation model with vertical swipe as the primary gesture:

**Three Depth States:**
- **Full (depth 0)**: Video fills screen with minimal overlay (chevron-down close, centered play/pause)
- **Peek (depth 1)**: First swipe reveals routine docked at bottom (~180px peek)
- **Expanded (depth 2)**: Second swipe expands routine fully, video pinned at top (~220px)

**Key Interactions:**
- **Vertical swipe**: Primary gesture to traverse depth (up = deeper, down = shallower)
- **Tappable steps**: Each step jumps video to relevant timestamp
- **Active step sync**: Currently playing step softly highlights as video progresses
- **Inline products**: Products appear as chips within steps or as a secondary tab (not a separate modal)

**Design Principles:**
- Single object unfolding rather than stacked panels
- No explicit instructional copy - spatial layout teaches interaction
- Continuous surfaces without hard modal edges
- Calm, cohesive, inevitable feel

### Backend Architecture
- **Runtime**: Node.js with Express 5
- **API Pattern**: RESTful endpoints under `/api/`
- **AI Integration**: Google Gemini via Replit AI Integrations service (gemini-2.5-flash model)
- **External APIs**: Makeup API (http://makeup-api.herokuapp.com) for product catalog matching

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts`
- **Key Tables**:
  - `video_analyses`: Stores analyzed videos with status, tutorial steps (JSONB)
  - `detected_products`: Products identified in videos with AI and matched catalog data
  - `saved_looks`: User's bookmarked product collections
  - `user_profiles`: User data including selfie URLs and skin tone data (JSONB)
  - `conversations/messages`: Chat history for AI interactions

### Key Design Patterns
- **Shared Schema**: Database schema and TypeScript types defined once in `shared/` and used by both client and server
- **Storage Abstraction**: `IStorage` interface in `server/storage.ts` for database operations
- **Component Library**: Reusable themed components (Button, Card, ThemedText, ProductCard, etc.)
- **Screen Options Hook**: `useScreenOptions` standardizes navigation header styling across screens

### Enhanced Product Detection Pipeline
- **AI Evidence Gathering**: Gemini returns evidence for each product detection:
  - `visual`: Where/how product was seen in video frames
  - `audio`: Transcript mentions confirming product
  - `metadata`: Any description/title info used
- **Confidence Scoring**: 0-1 score indicating detection certainty
  - 0.9-1.0: Brand + exact product name visible
  - 0.7-0.9: Brand known, product type inferred
  - 0.5-0.7: Product type only (no brand)
  - 0.3-0.5: Category detection only
- **Normalization Layer** (`server/productNormalizer.ts`):
  - Brand slug mapping (60+ brands): "Charlotte Tilbury" → `charlotte_tilbury`
  - Category taxonomy: "lipstick" → `lipstick`, "lippie" → `lipstick`
  - Name tokenization with stop word filtering
- **Smart Matching** (`server/productMatcher.ts`):
  - Multi-field scoring: brand (40%), type (30%), name (30%)
  - Tiered search: brand+type → type only → fallback
  - Returns match quality scores for transparency

### Frame Extraction & Timing
- **Extraction Modes** (`server/videoDownloader.ts`):
  - `scene_change` (default): FFmpeg scene filter detects visual changes, extracts keyframes
  - `fixed_fps`: Traditional approach, 1 frame per N seconds
- **Scene Detection Config**:
  - Threshold: 0.3 (sensitivity to visual changes)
  - Min frame spacing: 2.0s (prevents frame clustering)
  - Max frames: 40, Min frames: 6
- **A/B Comparison**: Pass `extractionMode: "fixed_fps"` or `"scene_change"` to `/api/analyze-video`
- **Timing Instrumentation** (`server/timing.ts`):
  - Per-stage timing: download, frame extraction, audio, AI analysis, product matching, DB ops
  - Structured JSON output logged to console
  - Stored in `debugData.timingReport` for UI display

### Admin Dashboard & Pre-Digest Pipeline
- **Admin Dashboard**: Web-based operator interface at `/admin` (port 5000)
  - Table of all analyzed videos with status, step/product counts, timing data
  - Detail drawer with tabs: Overview, Transcript, AI Analysis, Products, Timing, Frames
  - Bulk queue: paste multiple URLs for background processing
  - Discovery: search for top beauty tutorial videos via YouTube API or AI suggestions
  - Auto-refreshes every 30 seconds
- **Fast-Match**: When a user submits a URL that's already been analyzed, results return instantly from cache
  - Controlled by `forceReprocess` flag in analyze-video endpoint
  - Returns `cached: true` in response when serving pre-computed results
- **Background Processing**: Bulk URLs are queued and processed asynchronously
  - Queue status tracking via `/api/admin/queue-status`
  - Duplicate detection prevents re-processing completed videos
- **Video Discovery**: Find high-value videos to pre-digest
  - Uses YouTube Data API when `YOUTUBE_API_KEY` is set
  - Falls back to Gemini AI suggestions when no API key is available
  - Supports search by category (GRWM, Makeup Tutorial, etc.) and sort by view count

### Developer Tools
- **Debug Analysis Screen**: Developer view showing video analysis internals
  - Access: Code icon button on VideoAnalysisScreen results
  - Displays: extracted frames, video metadata, audio transcript, AI prompt, raw AI response
  - Shows: detected products with evidence, confidence scores, normalized data, and match quality
  - New: Timing breakdown with per-stage durations, extraction mode badge, scene timestamps
  - API: `GET /api/video-analyses/:id/debug`
  - Stored in `debug_data` JSONB column in `video_analyses` table

## External Dependencies

### AI Services
- **Google Gemini** (via Replit AI Integrations): Video/image analysis, skin tone detection
  - Environment variables: `AI_INTEGRATIONS_GEMINI_API_KEY`, `AI_INTEGRATIONS_GEMINI_BASE_URL`
  - Models used: `gemini-2.5-flash` for text, `gemini-2.5-flash-image` for image generation

### Product Catalog
- **Makeup API**: Free REST API for beauty product matching
  - Base URL: `http://makeup-api.herokuapp.com/api/v1`
  - Query-based searches with caching (10 minute TTL)
  - Returns: name, brand, price, image, product URL, colors, description
  - Supported product types: lipstick, eyeshadow, blush, bronzer, mascara, eyeliner, eyebrow, foundation, nail_polish
  - Available brands: almay, benefit, colourpop, covergirl, dior, e.l.f., essie, fenty, glossier, l'oreal, maybelline, milani, nyx, physicians formula, revlon, smashbox, stila, wet n wild
  - Category mapping: concealer→foundation, highlighter→blush, primer→foundation, powder→foundation, lip_gloss→lipstick
  - Unsupported categories: applicator, makeup_brush (tools not matched)

### Database
- **PostgreSQL**: Primary data store
  - Connection via `DATABASE_URL` environment variable
  - Migrations in `./migrations/` directory

### Mobile Platform Features
- **expo-camera**: Selfie capture for skin tone analysis
- **expo-image-picker**: Photo library access
- **expo-haptics**: Tactile feedback on interactions
- **expo-web-browser**: External link handling

### Fonts
- Playfair Display (display/heading typography)
- Inter (body text)
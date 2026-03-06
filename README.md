# Gleam - Beauty Product Discovery App

Transform makeup tutorials into your personal lookbook. Gleam uses AI to analyze beauty videos from TikTok, YouTube, and Instagram, extracting step-by-step routines and matching products you can actually buy.

## What Gleam Does

Paste a link to any makeup tutorial video. Gleam will:

1. **Extract the tutorial** - Download and analyze video frames using scene detection
2. **Identify products** - Use Google Gemini AI to detect every product mentioned or shown
3. **Match to real products** - Cross-reference detected items against a beauty product catalog
4. **Create a shoppable routine** - Present step-by-step instructions with linked products

The result is a personal lookbook of recreatable makeup looks, each with a tappable routine that syncs to video timestamps.

---

## Features

### Video Analysis Pipeline
- **Multi-platform support**: TikTok, YouTube, Instagram, YouTube Shorts
- **Scene-change detection**: Smart frame extraction captures key moments, not random intervals
- **Audio transcription**: Captures product mentions from voiceover and conversation
- **Multimodal AI**: Google Gemini analyzes both visual frames and audio together

### Product Detection & Matching
- **Evidence-based detection**: Each product includes where it was seen (visual, audio, metadata)
- **Confidence scoring**: 0-1 scores indicate detection certainty
- **Brand normalization**: Maps variations ("Charlotte Tilbury" → `charlotte_tilbury`) to improve matching
- **Smart catalog matching**: Multi-field scoring (brand, type, name) finds the right products

### Look Detail Experience
The look detail screen uses a layered navigation model:

| Depth | View | Description |
|-------|------|-------------|
| Full | Video fills screen | Minimal overlay with play/pause and close |
| Peek | Routine peeks from bottom | ~180px preview of steps |
| Expanded | Video pinned at top | Full routine visible, scrollable |

**Key interactions:**
- Swipe up/down to change depth
- Tap any step to jump video to that timestamp
- Active step highlights as video plays
- Products appear inline within steps or in a dedicated tab

### Developer Tools
- **Debug Analysis Screen**: View extracted frames, AI prompts, raw responses, and timing breakdowns
- **Timing instrumentation**: Per-stage timing for download, extraction, AI, matching, and DB operations

---

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React Native + Expo SDK 54 | Cross-platform mobile app |
| React Navigation v7 | Tab and stack navigation |
| TanStack React Query | Server state management |
| React Native Reanimated | Gesture-driven animations |
| expo-video | Embedded video playback |

### Backend
| Technology | Purpose |
|------------|---------|
| Node.js + Express 5 | REST API server |
| PostgreSQL + Drizzle ORM | Data persistence |
| Google Gemini AI | Video/image analysis |
| FFmpeg | Video download and frame extraction |

### External Services
| Service | Purpose |
|---------|---------|
| Google Gemini (via Replit AI Integrations) | Multimodal AI analysis |
| Makeup API | Beauty product catalog matching |
| yt-dlp | Video downloading from social platforms |

---

## Project Structure

```
gleam/
├── client/                    # React Native Expo app
│   ├── components/           # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── ProductCard.tsx
│   │   ├── ThemedText.tsx
│   │   └── ...
│   ├── navigation/           # React Navigation setup
│   │   ├── RootStackNavigator.tsx
│   │   ├── MainTabNavigator.tsx
│   │   └── LookbookStackNavigator.tsx
│   ├── screens/              # App screens
│   │   ├── LookbookScreen.tsx      # Home: saved looks collection
│   │   ├── LookDetailScreen.tsx    # Layered video + routine view
│   │   ├── VideoAnalysisScreen.tsx # Analysis progress + results
│   │   ├── ProductDetailScreen.tsx # Individual product info
│   │   ├── ProfileScreen.tsx       # User settings + skin tone
│   │   └── ...
│   ├── constants/            # Theme, colors, spacing
│   ├── hooks/                # Custom React hooks
│   └── lib/                  # API client, utilities
├── server/                   # Express backend
│   ├── index.ts             # Server entry point
│   ├── routes.ts            # API endpoints
│   ├── storage.ts           # Database operations
│   ├── videoDownloader.ts   # yt-dlp + FFmpeg integration
│   ├── productNormalizer.ts # Brand/category normalization
│   ├── productMatcher.ts    # Catalog matching logic
│   └── timing.ts            # Performance instrumentation
├── shared/                   # Shared between client/server
│   └── schema.ts            # Drizzle schema + TypeScript types
└── migrations/              # Database migrations
```

---

## API Endpoints

### Video Analysis
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/analyze-video` | Start video analysis |
| GET | `/api/video-analyses/:id` | Get analysis with products |
| GET | `/api/video-analyses/:id/debug` | Get debug data (frames, prompts, timing) |
| GET | `/api/video-analyses` | List all analyses |

### Saved Looks
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/saved-looks` | Save a look to collection |
| GET | `/api/saved-looks` | Get all saved looks |
| DELETE | `/api/saved-looks/:id` | Remove saved look |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products/search` | Search product catalog |

---

## Database Schema

### Core Tables

**video_analyses**
- Stores analyzed videos with status, tutorial steps (JSONB), and debug data
- Links to detected products

**detected_products**
- Products identified in videos
- Includes AI detection data and matched catalog data
- Evidence fields: `detectionEvidence`, `confidenceScore`

**saved_looks**
- User's bookmarked video analyses
- References video_analyses for full data

**user_profiles**
- User data including selfie URLs
- Skin tone analysis data (JSONB) for shade recommendations

---

## Design Philosophy

### Layered Navigation
The look detail experience follows a "single object unfolding" principle:
- No stacked modals or panels
- Continuous surfaces without hard edges
- Vertical swipe as the primary gesture
- Spatial layout teaches interaction (no instructional copy)

### Product Integration
Products are children of the routine, not parallel content:
- Inline chips within tutorial steps
- Secondary tab for full product grid
- Tapping a product opens detail without interrupting video

### Visual Language
- Calm, cohesive, inevitable feel
- Minimal UI chrome in video-focused views
- Soft highlighting for active states
- Warm, collection-oriented copy ("My Lookbook", "Add to Lookbook")

---

## Running the App

### Prerequisites
- Node.js 18+
- PostgreSQL database (provided by Replit)
- Expo Go app on your phone (for mobile testing)

### Development

The app runs two workflows:

1. **Start Backend** - Express API server on port 5000
   ```bash
   npm run server:dev
   ```

2. **Start Frontend** - Expo dev server on port 8081
   ```bash
   npm run expo:dev
   ```

### Testing on Device
1. Open Expo Go on your iOS or Android device
2. Scan the QR code from Replit's URL bar menu
3. The app loads directly on your phone

### Web Preview
The web version is available at port 8081, though the native mobile experience via Expo Go is recommended.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Google Gemini API key (via Replit AI Integrations) |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | Gemini API base URL |
| `SESSION_SECRET` | Session encryption key |

---

## Product Matching Details

### Brand Normalization
60+ brand mappings handle variations:
- "Charlotte Tilbury" → `charlotte_tilbury`
- "e.l.f." / "elf" → `e.l.f.`
- "NYX" / "nyx cosmetics" → `nyx`

### Category Taxonomy
Consistent category mapping:
- "lippie" / "lip_gloss" → `lipstick`
- "concealer" / "primer" / "powder" → `foundation`
- "highlighter" → `blush`

### Match Scoring
Multi-field scoring weights:
- Brand match: 40%
- Product type match: 30%
- Name similarity: 30%

### Supported Product Types
lipstick, eyeshadow, blush, bronzer, mascara, eyeliner, eyebrow, foundation, nail_polish

### Available Brands
almay, benefit, colourpop, covergirl, dior, e.l.f., essie, fenty, glossier, l'oreal, maybelline, milani, nyx, physicians formula, revlon, smashbox, stila, wet n wild

---

## Frame Extraction

### Scene Change Detection (default)
- FFmpeg scene filter detects visual changes
- Threshold: 0.3 sensitivity
- Minimum frame spacing: 2 seconds
- Max frames: 40, Min frames: 6

### Fixed FPS Mode
- Traditional approach: 1 frame per N seconds
- Use by passing `extractionMode: "fixed_fps"` to analyze endpoint

---

## Future Considerations

- **Skin tone analysis**: Selfie capture for personalized shade recommendations
- **Shopping list**: Aggregate products across saved looks
- **Social sharing**: Share looks with friends
- **Price tracking**: Monitor product prices over time

---

## License

Private project. All rights reserved.

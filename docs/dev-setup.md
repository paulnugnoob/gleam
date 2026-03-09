# Dev Setup

## Overview

This document covers the minimum local setup needed to run and work on Gleam.

Gleam currently has:

- an Express backend
- an Expo React Native client
- a PostgreSQL database
- local video-processing dependencies

## Requirements

Install the following on your machine:

- Node.js 18+
- npm
- PostgreSQL
- `ffmpeg`
- `ffprobe`
- `yt-dlp`

## Environment Variables

The project now reads local environment variables from `.env.local`.

Start from:

- [`.env.example`](/Users/paulnugent/AI-Lab/gleam/.env.example)

Edit:

- [`.env.local`](/Users/paulnugent/AI-Lab/gleam/.env.local)

Minimum required values:

- `DATABASE_URL`
- `AI_INTEGRATIONS_GEMINI_API_KEY`
- `AI_INTEGRATIONS_GEMINI_BASE_URL`

Optional:

- `YOUTUBE_API_KEY`
- `REPLIT_DEV_DOMAIN`
- `REPLIT_DOMAINS`

## Install Dependencies

From repo root:

```bash
cd /Users/paulnugent/AI-Lab/gleam
npm install
```

## Run The Backend

```bash
cd /Users/paulnugent/AI-Lab/gleam
npm run server:dev
```

Expected:

- Express server starts on `http://localhost:5000`
- admin page is served at `http://localhost:5000/admin`

## Run The Expo Client

In a separate terminal:

```bash
cd /Users/paulnugent/AI-Lab/gleam
npm run expo:dev
```

Notes:

- the mobile client expects `EXPO_PUBLIC_DOMAIN` to point at the backend host
- `localhost:5000` works for local web development
- if testing on a physical device, set `EXPO_PUBLIC_DOMAIN` to your machine's reachable local network address

Example:

```env
EXPO_PUBLIC_DOMAIN=192.168.1.20:5000
```

## Typecheck And Lint

Run these regularly during development:

```bash
cd /Users/paulnugent/AI-Lab/gleam
npm run check:types
npm run lint
```

## Format

```bash
cd /Users/paulnugent/AI-Lab/gleam
npm run format
```

## Database

Schema config is defined in:

- [drizzle.config.ts](/Users/paulnugent/AI-Lab/gleam/drizzle.config.ts)

Push schema changes with:

```bash
cd /Users/paulnugent/AI-Lab/gleam
npm run db:push
```

Only run this when `DATABASE_URL` points at the database you intend to modify.

## Quick Smoke Test

1. Start Postgres and confirm `DATABASE_URL` works
2. Start the backend with `npm run server:dev`
3. Visit `http://localhost:5000/admin`
4. Start Expo with `npm run expo:dev`
5. Run `npm run check:types`

## Useful Local Files

- [`.env.local`](/Users/paulnugent/AI-Lab/gleam/.env.local)
- [v1-product-spec.md](/Users/paulnugent/AI-Lab/gleam/docs/v1-product-spec.md)
- [architecture-build-plan.md](/Users/paulnugent/AI-Lab/gleam/docs/architecture-build-plan.md)
- [sample-inputs.md](/Users/paulnugent/AI-Lab/gleam/docs/sample-inputs.md)

## Recommended Workflow Before Major Refactors

```bash
cd /Users/paulnugent/AI-Lab/gleam
git status
npm run check:types
```

If the repo is stable:

```bash
git checkout -b codex/your-branch-name
```

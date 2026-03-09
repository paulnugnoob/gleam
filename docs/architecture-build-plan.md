# Gleam Architecture And Build Plan

## Goal

Build a consumer beauty app that can reliably turn supported beauty videos into trusted, shoppable product lists, then expand into shade personalization.

The architecture should support:

- fast iteration on v1
- strict confidence gating
- admin review for quality improvement
- model-provider flexibility
- eventual local-model support

## Current Codebase Assessment

The repo already has useful foundations:

- React Native app with core screens and navigation
- Express backend with working video analysis flow
- frame extraction and audio transcription path
- product normalization and catalog matching
- debug views and a basic admin surface

The main gaps are structural rather than conceptual:

- analysis logic is concentrated inside route handlers
- foreground and background analysis flows are duplicated
- classification outputs are stored as if they are final truth
- there is no strong evaluation or review data model for continuous quality improvement

## Architecture Principles

- precision over recall
- confidence is first-class
- approved truth is separate from raw model prediction
- the admin dashboard exists to improve the consumer experience
- model providers should be replaceable
- user-facing objects should be stable even if the underlying pipeline evolves

## Target Architecture

### 1. Ingestion Domain

Responsibilities:

- URL validation
- platform detection
- metadata fetch
- video download
- audio extraction
- frame extraction
- dedupe and retry handling

Suggested files:

- `server/analysis/ingest/videoSource.ts`
- `server/analysis/ingest/videoDownloader.ts`
- `server/analysis/ingest/frameExtractor.ts`
- `server/analysis/ingest/audioExtractor.ts`

### 2. Classification Domain

Responsibilities:

- run multimodal analysis against frames, transcript, and metadata
- normalize model response into Gleam-owned schema
- attach provider, model, prompt, latency, and cost metadata
- calculate confidence states before UI exposure

Suggested files:

- `server/analysis/classification/classificationService.ts`
- `server/analysis/classification/providers/openaiProvider.ts`
- `server/analysis/classification/providers/geminiProvider.ts`
- `server/analysis/classification/providers/localProvider.ts`
- `server/analysis/classification/prompts/videoPrompt.ts`
- `server/analysis/classification/parsers/parseClassification.ts`

### 3. Catalog Matching Domain

Responsibilities:

- normalize detected products
- retrieve product candidates
- score candidate matches
- generate exact match vs candidate match outcomes

Suggested files:

- `server/analysis/catalog/catalogMatchService.ts`
- `server/analysis/catalog/productNormalizer.ts`
- `server/analysis/catalog/productMatcher.ts`
- `server/analysis/catalog/catalogProviders/affiliateCatalog.ts`

### 4. Review And Evaluation Domain

Responsibilities:

- route uncertain analyses into review queues
- collect admin corrections
- collect user feedback
- maintain gold-set examples
- compare provider/model performance over time

Suggested files:

- `server/review/reviewService.ts`
- `server/review/evaluationService.ts`
- `server/review/qualityRules.ts`

### 5. Presentation Domain

Responsibilities:

- expose stable API objects to mobile and admin clients
- separate raw predictions from approved user-facing results

Suggested files:

- `server/presentation/analysisPresenter.ts`
- `server/presentation/adminPresenter.ts`

## Proposed Data Model Changes

Keep current user-facing tables for continuity where helpful, but evolve toward this structure.

### Core

- `video_sources`
  - canonical source URL, platform, creator metadata, source status

- `analysis_runs`
  - one run per processing attempt
  - fields: provider, model, prompt version, status, latency, cost, extraction config

- `analysis_step_predictions`
  - raw predicted steps for a run

- `analysis_product_predictions`
  - raw predicted products for a run
  - includes confidence, evidence, matched catalog candidates

- `approved_analyses`
  - the consumer-facing approved output for a source

### Quality

- `review_tasks`
  - queued review work for admin

- `review_labels`
  - admin decisions and corrections

- `user_feedback`
  - end-user "wrong product", "missing product", "wrong shade" feedback

- `gold_examples`
  - curated evaluation set

- `evaluation_runs`
  - quality metrics for a provider/model/prompt against gold examples

- `model_registry`
  - enabled providers, versions, and rollout settings

## Confidence System

The confidence system should combine:

- model confidence
- evidence quality
- catalog match quality
- optional business rules

Recommended result buckets:

- `high`
- `candidate`
- `hidden`

This should drive both UI and review routing.

## Admin Dashboard Requirements

The admin dashboard should become the quality-control center.

### Queue View

- new analyses
- low-confidence analyses
- analyses with user complaints
- analyses by provider/model/version

### Detail View

- source metadata
- extracted frames
- transcript
- raw model output
- normalized step predictions
- normalized product predictions
- candidate catalog matches
- confidence breakdown

### Review Actions

- approve exact match
- pick alternate candidate
- edit product identity
- mark product missing
- mark product uncertain
- correct steps
- capture reason codes for failure patterns

### Quality Views

- product precision trends
- catalog top-1 and top-3 rates
- disagreement by category
- confidence calibration
- user complaint trends

## Consumer API Shape

The mobile app should receive a clean object that is already filtered by confidence policy.

Suggested response sections:

- `analysis`
- `productsExact`
- `productsCandidates`
- `steps`
- `confidenceSummary`
- `personalization`

The app should not need to interpret raw model outputs to decide what to show.

## Recommended V1 Platform Strategy

### Launch

- YouTube first

### Why

- lower ingestion friction
- better metadata access
- easier debugging and repeatable examples
- faster path to validating product click behavior

### After Launch

- add TikTok
- add Instagram

Only after the review and confidence system is stable enough to absorb lower-quality inputs.

## Model Strategy

### Near Term

- use a low-cost hosted model
- prefer a provider abstraction from the start
- log prompt version, latency, and cost on every run

### Mid Term

- route only harder cases to more expensive models
- keep cheap model as default path

### Long Term

- support a local model provider for offline or lower-cost batch processing
- use the same `ClassifierProvider` contract so the app and admin systems do not care which provider produced the result

## Recommended Target File Structure

This is a target structure, not a required immediate rewrite.

```text
gleam/
├── client/
│   ├── app/
│   ├── components/
│   ├── features/
│   │   ├── analysis/
│   │   ├── lookbook/
│   │   ├── profile/
│   │   └── admin_debug/
│   ├── lib/
│   ├── navigation/
│   └── screens/
├── docs/
│   ├── v1-product-spec.md
│   └── architecture-build-plan.md
├── server/
│   ├── analysis/
│   │   ├── ingest/
│   │   ├── classification/
│   │   ├── catalog/
│   │   └── orchestration/
│   ├── presentation/
│   ├── ranking/
│   ├── review/
│   ├── routes/
│   ├── templates/
│   └── db.ts
├── shared/
│   ├── models/
│   ├── api/
│   └── schema.ts
└── scripts/
```

## Staged Build Plan

### Stage 0: Align The Brief

Deliverables:

- lock v1 product spec
- lock confidence policy
- lock YouTube-first scope
- lock complexion-only shade matching for later phase

### Stage 1: Refactor The Analysis Pipeline

Goal:

- move pipeline logic out of route handlers into services

Deliverables:

- `AnalysisOrchestrator`
- shared foreground/background execution path
- provider abstraction
- structured run metadata

### Stage 2: Introduce Confidence Gating

Goal:

- ensure low-confidence junk does not reach the consumer app

Deliverables:

- confidence policy service
- exact vs candidate vs hidden result buckets
- cleaner mobile API response shape

### Stage 3: Build Review And Feedback Loop

Goal:

- improve quality without making review the product

Deliverables:

- admin review queue
- product correction actions
- user feedback capture
- review-driven reprocessing path

### Stage 4: Build Evaluation Infrastructure

Goal:

- prove the system can get to a useful hit rate

Deliverables:

- gold-set dataset
- evaluation runner
- weekly scorecard
- metrics by product category and provider

### Stage 5: Launch Consumer V1

Goal:

- validate trusted product-link clicks

Deliverables:

- YouTube submission flow
- high-confidence product list
- candidate product display
- lightweight tutorial steps
- save and feedback flows

### Stage 6: Add Shade Matching

Goal:

- create the first truly magical differentiated experience

Deliverables:

- selfie capture and profile quality checks
- complexion product shade recommendation
- confidence treatment for shade recommendations

### Stage 7: Expand Platform And Monetization

Goal:

- broaden acquisition and deepen monetization only after trust exists

Deliverables:

- TikTok and Instagram ingestion
- affiliate optimization
- premium experiments
- creator-side workflows if still strategically useful

## Recommended Build Order For Immediate Work

If we start coding next, the highest-leverage order is:

1. pipeline refactor
2. confidence gating
3. admin review queue
4. user feedback capture
5. evaluation dataset and scorecards
6. consumer polishing
7. shade matching

## Final Recommendation

Do not overbuild tutorial reconstruction first.

Build Gleam around trusted exact product matching, clean confidence presentation, and a path to shade personalization. If users click and trust the product links, the business has a real foundation. If that loop is weak, no amount of extra tutorial detail will save it.

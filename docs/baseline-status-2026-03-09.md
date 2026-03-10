# Gleam Baseline Status

Generated: 2026-03-09

## Outcome

The core Gleam pipeline has been proven on a real YouTube video:

- video download works
- audio extraction works
- frame extraction works
- multimodal model analysis works
- product persistence works
- catalog matching works mechanically

This means the product concept is technically viable.

## What Was Completed

### Evaluation Infrastructure

- Added a locked YouTube baseline dataset:
  - `docs/evaluation-dataset.json`
  - `docs/evaluation-dataset.smoke.json`
- Added the baseline runner:
  - `scripts/evaluate-baseline.ts`
- Added evaluation docs:
  - `docs/baseline-evaluation.md`
  - `docs/evaluation-selection-plan.md`

### Provider Work

- Added provider abstraction in `server/aiProvider.ts`
- Kept Gemini as default
- Added OpenAI-backed evaluation path
- Added provider preflight so future runs fail fast on missing quota instead of downloading videos first

### Matching Work

- Tightened catalog-match acceptance thresholds in `server/productMatcher.ts`
- Weak type-only matches are now more likely to be rejected instead of attached as misleading product links

## What Was Measured

One real YouTube case completed end-to-end before provider quota blocked broader evaluation.

Completed case:

- `https://www.youtube.com/watch?v=gY3-wHA_qQc`

Observed runtime:

- download: `32.25s`
- frame extraction: `9.47s`
- audio transcription: `43.41s`
- AI analysis: `44.22s`
- product matching: `10.05s`
- total: `140.66s`

## Qualitative Baseline Read

### What Looked Promising

- The model identified several real products from the video
- The system handled long-form YouTube ingestion successfully
- The evaluation harness is in place and reusable

### What Looked Weak

- Catalog matching was too eager
- Several wrong generic matches were attached to branded products
- Exact shoppable precision is not good enough yet

## Top Failure Modes Observed

1. Type-only catalog matches were being accepted when brand and product name evidence were weak
2. Unsupported categories such as tools and lashes still create noise in extraction output
3. Long-form video runtime is high enough that broad evaluation runs are expensive
4. Provider quota is currently the gating factor for batch measurement
5. The current catalog is too sparse and generic for true exact-match beauty behavior

## Current Blocker

The smoke baseline could not be completed to a valid percentage report because both providers were quota-blocked:

- Gemini: free-tier request quota exhausted
- OpenAI: account returned `insufficient_quota`

Because of that, the latest generated smoke report is not a valid quality baseline. It reflects provider failure, not model quality.

## Before / After Evaluation Status

Requested goal:

- run smoke baseline
- improve matching
- rerun smoke baseline
- compare before vs after

Actual status:

- before baseline: blocked by provider quota
- matching improvement: implemented
- after baseline: not yet rerun successfully due provider quota

So the comparison is pending, not complete.

## Highest-Leverage Next Steps

1. Fund or enable one provider for batch evaluation
2. Rerun `docs/evaluation-dataset.smoke.json` with provider preflight enabled
3. Inspect `reports/baseline-latest.md` and `reports/baseline-latest.json`
4. If smoke results are stable, run the full 10-video baseline
5. Expand matching improvements only after seeing the post-threshold numbers

## Recommended Next Command

Once quota is available:

```bash
npm run eval:baseline:openai docs/evaluation-dataset.smoke.json
```

If OpenAI quota is not available but Gemini paid tier is:

```bash
npm run eval:baseline docs/evaluation-dataset.smoke.json
```

## Honest Summary

The important first-principles question has been answered:

`Yes, Gleam can ingest a real beauty video and produce structured product output.`

The more important business question is still open:

`Can Gleam produce exact enough product matching to deserve user trust?`

The codebase is now set up to answer that quickly once provider quota is available.

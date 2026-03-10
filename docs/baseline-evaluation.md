# Baseline Evaluation

This is the first-principles check for Gleam:

- can we ingest a real beauty video
- can the model identify likely products
- can we match those products to the current catalog
- what baseline quality do we get before tuning

Before selecting videos, use [evaluation-selection-plan.md](/Users/paulnugent/AI-Lab/gleam/docs/evaluation-selection-plan.md) to keep the dataset narrow and stable.

## Dataset Setup

1. Copy `docs/evaluation-dataset.example.json` to `docs/evaluation-dataset.json`
2. Add 5 to 10 real videos
3. For each video, list the products you expect Gleam to find

Start narrow:

- YouTube first
- makeup only
- videos where the creator names or shows products clearly

Good first set:

- 10 videos total
- 6 search-led videos
- 4 creator-lane videos
- 4 easy
- 4 medium
- 2 hard

## Run

```bash
npm run eval:baseline docs/evaluation-dataset.json
```

If you omit the path, the script defaults to `docs/evaluation-dataset.json`.

To run the same baseline against OpenAI instead of Gemini:

```bash
npm run eval:baseline:openai docs/evaluation-dataset.json
```

That requires:

- `OPENAI_API_KEY`
- optionally `OPENAI_VISION_MODEL`
- optionally `OPENAI_TRANSCRIPTION_MODEL`

For cheaper evaluation runs, set:

- `EVAL_MAX_FRAMES=10`
- `EVAL_SKIP_AUDIO_TRANSCRIPTION=true`

Those settings reduce cost and are appropriate for smoke testing.

## Outputs

The script writes:

- `reports/baseline-latest.json`
- `reports/baseline-latest.md`

## What The Metrics Mean

- `Detection recall`: how many expected products Gleam found at all
- `Catalog recall`: how many expected products ended up with a plausible catalog match
- `Presented precision`: how many shown products appear to correspond to expected products
- `Exact bucket precision`: how reliable the high-confidence bucket looks
- `Catalog match precision`: how often catalog-linked results appear aligned with the labeled set

These are not gold-standard academic metrics yet. They are a practical startup baseline for answering:

`Does this work well enough to be promising?`

## Recommended Evaluation Rhythm

- Run the baseline before any major prompt/provider change
- Save the output files after each run
- Keep the labeled set small but stable at first
- Only expand the set once the baseline starts moving in the right direction

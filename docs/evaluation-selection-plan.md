# Evaluation Selection Plan

## Purpose

This plan defines the first baseline dataset for Gleam.

The goal is not to prove that Gleam works on all beauty content. The goal is to answer a narrower question:

`Can Gleam ingest a supported beauty video, identify the products used, and match those products to the current catalog with promising baseline quality?`

## Platform Decision

Baseline platform:

- YouTube only

Reason:

- easiest ingestion path
- public metadata is accessible
- lower platform friction for the first measurable baseline

This is an evaluation constraint, not the long-term product scope.

## Content Decision

Baseline content:

- makeup only
- English-language videos only
- one creator, one look, one routine where possible

We are not using this first set for:

- skincare
- hair
- haul videos
- product reviews
- celebrity transformation content
- shorts-first content
- shopping / ranking / challenge formats

## Video Shape We Want

Choose videos that have most of the following:

- title includes `GRWM`, `get ready with me`, `makeup tutorial`, `everyday makeup`, `soft glam`, or `full face`
- creator names products verbally or visually
- packaging is visible for at least some products
- the routine is coherent rather than heavily edited across multiple looks
- expected product count is roughly 2 to 8
- at least one product has a plausible chance of existing in the current catalog

## Search Parameters

Use search-led selection first, not creator-led selection.

Preferred query themes:

- `grwm makeup tutorial`
- `get ready with me makeup tutorial`
- `everyday makeup tutorial`
- `full face makeup tutorial`
- `soft glam makeup tutorial`

Preferred candidate characteristics:

- 3 to 15 minutes long
- clear face-focused tutorial footage
- spoken product mentions or creator narration
- recent enough to still be available and useful

## Controlled Creator Lane

Use a smaller second lane of known tutorial creators to reduce variance.

This lane exists to keep part of the dataset stylistically consistent, not to define the whole evaluation set.

Good creator lane characteristics:

- established tutorial format
- product-forward content
- clear verbal explanations
- consistent beauty niche

## First Dataset Shape

Target 10 videos total:

- 6 search-led videos
- 4 creator-lane videos

Difficulty mix:

- 4 easy
- 4 medium
- 2 hard

## Difficulty Rubric

### Easy

- products are clearly named in audio or title/description
- packaging is visible
- video structure is straightforward
- likely 2 to 5 expected products

### Medium

- some products are visible, some are only spoken
- editing is faster or labels are less clean
- likely 4 to 7 expected products

### Hard

- weak packaging visibility
- fast cuts
- incomplete verbal naming
- more ambiguity in exact product identity

Hard cases are included to understand failure modes, not to define whether v1 is viable.

## Labeling Rules

For the first baseline, each selected video should have:

- a stable ID
- the original URL
- short notes on why it is in the set
- a manually written expected product list

Each expected product should include:

- product name
- brand if known
- type if known
- whether it is required for the case
- whether we expect a catalog match to be possible

## Success Criteria For The Baseline

We are trying to estimate:

- ingestion success rate
- expected product detection recall
- catalog recall
- presented precision
- exact-bucket precision

The first pass does not need to be strong. It needs to be honest and informative.

What would feel promising:

- the pipeline runs reliably on the chosen set
- Gleam detects a meaningful share of expected products
- exact matches are noticeably more trustworthy than candidate matches
- failure cases are legible enough to guide the next iteration

## What To Avoid

Do not bias the set too far toward:

- only perfect easy cases
- only famous creators
- only videos with affiliate links or product lists already provided

That would make the baseline look better than the real product is.

Do not bias the set too far toward:

- highly chaotic content
- content outside the current catalog coverage
- videos with 10 to 20 products to label

That would make the first baseline look worse than necessary.

## Operating Rule

Lock the first 10-video set and reuse it for at least the next few prompt or pipeline changes.

Do not keep swapping videos in and out between runs, or the baseline becomes meaningless.

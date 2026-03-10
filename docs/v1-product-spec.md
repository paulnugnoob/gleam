# Gleam V1 Product Spec

## Product Thesis

Gleam is a consumer beauty app that turns a beauty video into a trusted, shoppable product list.

The primary user value is not "AI analysis completed." It is:

- "I found the exact product."
- "I trust this match enough to click to buy."
- "This product was adapted to me, especially shade."

Tutorial steps matter, but they are a support layer for trust and usability rather than the primary wedge.

## Core Insight

The closest analogy is recipe extraction for beauty:

- products are the ingredients
- steps are the recipe
- shade matching is the personalization layer that makes the result feel magical

For v1, the product list is the main event. Steps help explain the look and make the result feel complete.

## Target User

- Beauty consumers who regularly watch short-form beauty content
- Users who want to know exactly what the creator used
- Users who want an easy way to buy the right product, ideally in the right shade

## V1 Success Metric

Primary metric:

- trusted product-link click

Supporting metrics:

- analysis to product click-through rate
- save-to-lookbook rate
- repeat analysis rate
- share rate
- user correction submission rate

## V1 Product Promise

"Paste a supported beauty video and Gleam gives you a clean, shoppable list of the products used, with confidence signals and lightweight steps. If you have a selfie profile, Gleam can help tailor shade-sensitive products to you."

## Recommended Launch Scope

### Content Scope

- Makeup only
- English-language content only
- Looks where products are visible, named, or described with reasonable frequency

### Platform Scope

Recommended v1:

- YouTube first

Reason:

- easiest ingestion path
- public APIs and metadata are easier to work with
- good surface to validate pipeline quality, confidence gating, and commerce loop

Phase 2:

- TikTok
- Instagram

### Product Scope

V1 core:

- product extraction
- exact match where possible
- shoppable links
- visible confidence state

V1 support:

- lightweight tutorial steps

V1.5:

- shade matching for complexion products first

## Non-Goals For V1

- broad beauty coverage beyond makeup
- best-price guarantee across every retailer
- creator tools as a first-class product
- deep tutorial/video editing features
- full automation across all low-confidence analyses

## Accuracy Standard

Gleam should prefer omission over false certainty.

Rules:

- missing a product is acceptable
- showing the wrong exact product is not acceptable
- low-confidence guesses should not be presented as exact matches
- confidence must be visible to users

This means v1 should optimize for precision before recall.

## Confidence Policy

### High Confidence

Criteria:

- strong evidence from packaging, spoken mention, metadata, or repeated signal
- strong catalog match

UI treatment:

- show as standard result
- include direct shoppable link

### Medium Confidence

Criteria:

- plausible product identity or plausible catalog match, but not fully certain

UI treatment:

- show as "we think this might be"
- visibly marked as uncertain
- optionally show one to three candidate products

### Low Confidence

Criteria:

- weak evidence and weak match

UI treatment:

- suppress from main result
- keep available in admin/debug only

## User Correction Loop

V1 should include a lightweight correction path.

Examples:

- "This product is wrong"
- "This product is missing"
- "This shade is wrong"
- "This should be a different product"

The goal is not to turn users into editors. The goal is to collect signal that improves review and future evaluation.

## User Experience Principles

- exactness beats completeness
- show uncertainty honestly
- keep the experience fast and clean
- make the result feel delightful, not technical
- preserve the sense that the app did useful work on the user's behalf

## Magical Moment

The most differentiated future moment is:

"This creator used product X, but Gleam recommends shade Y for me."

That should shape the roadmap, but it should not destabilize v1.

## Monetization Direction

Near term:

- affiliate commerce

Later:

- premium subscription after trust and repeat usage are established
- possible mechanics such as free tier limits, subscription for premium features, or referral-based unlocks

The product should not depend on subscription revenue to validate v1. Trust and click-through should come first.

## V1 User Flows

### Consumer Flow

1. User submits a video URL
2. Gleam analyzes the video
3. User receives:
   - product list
   - confidence states
   - lightweight steps
   - shoppable links
4. User clicks through to a product
5. User may save the look
6. User may submit feedback if something is wrong

### Admin Flow

1. New analyses enter the pipeline
2. Low-confidence or strategically important analyses are reviewed
3. Corrections improve:
   - current result quality
   - evaluation set quality
   - future model tuning

## Product Decisions Locked For Now

- Consumer app first
- Product-link click is the main success metric
- YouTube-first is the recommended launch platform
- Exact shoppable product matching is the core wedge
- Baseline evaluation should use a locked YouTube-only dataset before broadening scope
- Tutorial steps are secondary
- Confidence must be visible
- Human review is a bootstrapping tool, not the business
- Shade matching is the first major magic layer after core trust is established

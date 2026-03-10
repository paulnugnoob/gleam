# Gleam Catalog API Plan

## Recommendation

For broad catalog coverage, use:

1. eBay Browse API as the first live catalog provider
2. Makeup API only as a temporary fallback while we validate the provider layer

Do not make Amazon the second integration right now.

## Why eBay First

eBay gives us the best immediate combination of:

- broad live product coverage
- keyword search
- fixed-price listings
- straightforward application-token auth
- public documentation that is stable and usable

This is a better fit than the current Makeup API when the goal is to find real product listings across many beauty brands and marketplaces.

## Why Not Amazon First

Amazon is still strategically interesting, but it is the wrong next integration for broad-coverage speed.

Reasons:

- Amazon Product Advertising API 5.0 is officially being deprecated on April 30, 2026
- Amazon is pushing developers toward Creators API instead
- Amazon affiliate/content policies are materially tighter
- the new Creators API docs are less friendly for quick unattended setup than eBay's public developer flow

That means Amazon should be evaluated as a later commerce/affiliate channel, not the first broad-coverage catalog foundation.

## What Has Been Implemented

The codebase now supports a catalog provider order:

- `ebay`
- `makeup_api`

Environment variable:

```env
CATALOG_PROVIDER_ORDER=ebay,makeup_api
```

Added env placeholders:

```env
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
```

The matching layer now:

- tries eBay first when credentials are present
- falls back to Makeup API if eBay is unavailable or returns no acceptable matches
- keeps the existing confidence and review pipeline intact

## Required Setup

Add these to `.env.local`:

```env
CATALOG_PROVIDER_ORDER=ebay,makeup_api
EBAY_CLIENT_ID=your_production_client_id
EBAY_CLIENT_SECRET=your_production_client_secret
```

## Next Build Steps

### Stage 1

Get eBay live and rerun the smoke baseline.

Goal:

- measure whether catalog recall and catalog precision improve versus the Makeup API fallback path

### Stage 2

Store richer provider metadata per match.

Add fields later for:

- `matchedProductSource`
- `matchedProductSourceId`
- `matchedProductMarketplace`

This matters because the current schema was designed around a single integer catalog ID, which is not a good long-term fit for external marketplaces like eBay.

### Stage 3

Add a second real provider only after we see baseline movement from eBay.

Good candidates later:

- Amazon Creators API
- retailer-specific feeds or affiliate APIs
- a first-party curated Gleam beauty catalog

## Strategic Direction

Short term:

- use external marketplaces for coverage

Medium term:

- keep a provider layer and collect corrections

Long term:

- build a Gleam-owned beauty catalog from corrected matches, popular products, and creator-linked products

That is the path that gives us both coverage now and defensibility later.

## Official References

- eBay Browse API search:
  - https://developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/search
- eBay OAuth client credentials flow:
  - https://developer.ebay.com/api-docs/static/oauth-client-credentials-grant.html
- eBay OAuth credentials:
  - https://developer.ebay.com/api-docs/static/oauth-credentials.html
- Amazon PA-API deprecation notice:
  - https://webservices.amazon.com/paapi5/documentation/document-history.html
- Amazon Creators API landing page:
  - https://affiliate-program.amazon.com/creatorsapi
- Amazon Associates operating agreement and policy constraints:
  - https://affiliate-program.amazon.com/help/operating/policies

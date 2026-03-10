# Gleam Smoke Baseline Set

Three easier YouTube makeup tutorials used to get a fast first baseline on ingestion, product extraction, and catalog matching.

Generated: 2026-03-10T13:22:15.083Z

## Run Config

- Provider: openai
- Max frames: 10
- Skip audio transcription: false

## Summary

- Cases run: 3
- Cases failed: 0
- Expected products: 12
- Detection recall: 50%
- Catalog recall: 8.3%
- Presented precision: 28.6%
- Exact bucket precision: 25%
- Catalog match precision: 4.8%

## Cases

### search-denitslava-soft-glam

- Status: completed
- URL: https://www.youtube.com/watch?v=gY3-wHA_qQc
- Analysis ID: 32
- Runtime: 74.59s
- Detected: 4
- Presented: 4 (0 exact / 4 candidate / 0 hidden)

| Expected | Detected match | Detection score | Catalog match | Catalog score |
| --- | --- | ---: | --- | ---: |
| Laura Mercier Flawless Fusion Foundation | Laura Mercier Flawless Fusion Ultra Longwear Foundation | 0.74 | miss | 0.00 |
| Laura Mercier Flawless Fusion Concealer | miss | 0.47 | miss | 0.00 |
| Benefit 24-HR Brow Setter | miss | 0.23 | miss | 0.00 |
| ColourPop Blush in Frisky Business | miss | 0.00 | miss | 0.00 |

### search-puspita-nyx-soft-glam

- Status: completed
- URL: https://www.youtube.com/watch?v=upz61aYWhHM
- Analysis ID: 33
- Runtime: 64.68s
- Detected: 10
- Presented: 10 (7 exact / 3 candidate / 0 hidden)

| Expected | Detected match | Detection score | Catalog match | Catalog score |
| --- | --- | ---: | --- | ---: |
| NYX Angel Veil Skin Perfecting Primer | NYX NYX Angel Veil Skin Perfecting Primer | 0.89 | miss | 0.25 |
| NYX Total Control Drop Foundation | NYX NYX Total Control Drop Foundation | 1.00 | nyx Total Control Drop Foundation | 1.00 |
| NYX Highlight and Contour Pro Palette | NYX NYX Highlight and Contour Pro Palette | 0.89 | miss | 0.46 |
| NYX Liquid Suede Soft Spoken | miss | 0.36 | miss | 0.25 |

### search-fromheadtotoe-drugstore-fall

- Status: completed
- URL: https://www.youtube.com/watch?v=-v5XOMRb7tc
- Analysis ID: 34
- Runtime: 103.28s
- Detected: 7
- Presented: 7 (1 exact / 6 candidate / 0 hidden)

| Expected | Detected match | Detection score | Catalog match | Catalog score |
| --- | --- | ---: | --- | ---: |
| Neutrogena Healthy Skin Foundation | Neutrogena Neutrogena Healthy Skin Foundation | 0.84 | miss | 0.00 |
| Physicians Formula Mineral Wear Powder | Physicians Formula Physicians Formula Mineral Wear Powder | 0.74 | miss | 0.57 |
| NYX Black Label Lipstick in Diva | miss | 0.25 | miss | 0.25 |
| Milani Blush in Luminous | miss | 0.00 | miss | 0.00 |

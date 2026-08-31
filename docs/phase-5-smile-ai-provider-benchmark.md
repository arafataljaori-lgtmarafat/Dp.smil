# Phase 5 / Stage 0 — Smile AI Provider Benchmark

Research conducted via live web search/fetch against primary sources during this Stage 0
session (August 29, 2026). Every factual claim below is tagged:

- **VERIFIED** — read directly from the provider's own official page (pricing page, terms
  of service, privacy policy, or product blog post), fetched and quoted/paraphrased in
  this session.
- **INFERENCE** — consistent across multiple independent secondary sources (aggregators,
  trade press) but not confirmed by this session's own fetch of a primary source.
- **UNKNOWN** — not established this session; explicitly flagged as a required input to
  the controlled provider benchmark (Stage 1) rather than guessed.

No provider call was made. No real or synthetic patient image was sent to any third
party. This document is desk research only, exactly as Stage 0 requires.

## Candidates evaluated

### 1. Google Gemini API — image generation/editing ("Nano Banana" family)

- **Current models** (VERIFIED, `ai.google.dev/gemini-api/docs/pricing`, fetched this
  session): `gemini-2.5-flash-image` (legacy "Nano Banana," scheduled for shutdown; a
  September/October 2026 retirement date is stated across secondary sources — **INFERENCE**
  on the exact date), `gemini-3.1-flash-image` / `gemini-3.1-flash-image-preview` ("Nano
  Banana 2"), `gemini-3-pro-image` / `gemini-3-pro-image-preview` ("Nano Banana Pro").
- **Identity/character consistency**: Nano Banana Pro is described (INFERENCE, consistent
  secondary trade coverage) as holding character consistency across up to 14 reference
  images and winning on instruction-following/grounding accuracy versus FLUX Kontext.
  **No dental-specific or facial-edit-specific benchmark was found from Google or any
  independent source** — UNKNOWN for the one metric that matters most for this product
  (local dental control: editing only teeth/gingiva while leaving the rest of the face
  byte-for-byte perceptually unchanged).
- **Pricing** (VERIFIED, official pricing page): image output billed per token —
  1024×1024 output ≈ **$0.067/image** (`gemini-3.1-flash-image`, 1120 tokens × $60/1M);
  512px ≈ $0.045; 4K ≈ $0.15–0.24 depending on model tier. Free tier exists but see privacy
  note below.
- **Data retention / training** (VERIFIED, `ai.google.dev/gemini-api/terms`, fetched this
  session, "Additional Terms of Service," effective 2026-03-23): **Paid Services: Google
  does not use prompts or responses (including images) to improve its products**, and
  processes them under a Data Processing Addendum. Paid-tier prompts/responses are still
  logged transiently "for a limited period of time, solely for detecting and preventing
  violations of the Prohibited Use Policy," and that data "may be stored transiently or
  cached in any country in which Google or its agents maintain facilities" — i.e., **no
  guaranteed data residency**, even on the paid tier. **Free/Unpaid tier: content IS used
  to improve products**, human reviewers may read/annotate it, and Google's own terms
  state explicitly: *"Do not submit sensitive, confidential, or personal information to
  the Unpaid Services."* This makes the free tier a hard exclusion for this product
  regardless of any other factor.
- **Medical-use restriction** (VERIFIED, same terms document): *"You may not use the
  Services in clinical practice, to provide medical advice, or in any manner that is
  overseen by or requires clearance or approval from a medical device regulatory
  agency."* This is a binding contractual constraint, not just good practice — it
  independently forces the "visualization only, never diagnosis" safety boundary this
  product already intends (see the threat model doc).
- **Regional availability** (VERIFIED, `ai.google.dev/gemini-api/docs/available-regions`,
  fetched this session, full country list checked directly): **Yemen is listed** as an
  available country/territory. EEA/Switzerland/UK users may only be served via the Paid
  tier (VERIFIED, same terms doc).
- **Rate limits** (VERIFIED mechanism, `ai.google.dev/gemini-api/docs/rate-limits`, fetched
  this session): tiered, spend-gated (RPM/TPM/RPD/Images-per-minute), auto-upgrading with
  cumulative Cloud Billing spend; preview/experimental image models sit in the most
  restricted tier. **Exact numeric RPD/IPM figures for the current preview image models**:
  INFERENCE only (secondary sources cite ~250 RPD at the entry paid tier for preview
  models) — needs a live account check in Stage 1, not assumed here.
- **Commercial rights**: Google does not claim ownership of generated output (VERIFIED,
  terms doc) but explicitly reserves the right to generate the same or similar output for
  other customers (no exclusivity) — standard for this class of provider.
- **Vendor lock-in**: closed, hosted-only, no open-weight or self-host option (INFERENCE —
  no self-hosting product was found in this session's research).

### 2. OpenAI Images API (GPT Image family)

- **Current lineup** (mixed): `gpt-image-1` was the primary model VERIFIED via direct
  fetch of OpenAI's own launch post (`openai.com/index/image-generation-api/`, dated
  April 23, 2025) with its original pricing and policies. Multiple independent secondary
  sources place a newer `gpt-image-1.5` and `gpt-image-2` (flagship, ~April 2026) above it
  in OpenAI's current catalog, with `gpt-image-1` itself scheduled for deprecation around
  October 23, 2026 and DALL·E 2/3 already fully removed from the API (~May 12, 2026) — all
  of this newer-lineup detail is **INFERENCE**, not yet confirmed by this session's own
  fetch of OpenAI's live pricing/model pages for the 1.5/2 generation.
- **Pricing** (VERIFIED for original `gpt-image-1`, OpenAI's own post): $5/1M text-input
  tokens, $10/1M image-input tokens, $40/1M image-output tokens ≈ **$0.02 / $0.07 / $0.19
  per image** at low/medium/high quality square output. Newer-generation pricing
  (`gpt-image-1.5` ≈ $0.009–$0.20/image, `gpt-image-2` ≈ $0.005–$0.211/image per several
  consistent secondary sources) is **INFERENCE**.
- **Editing capability**: the Images API's `edit` endpoint (VERIFIED to exist from
  OpenAI's own documentation references and confirmed by multiple secondary code
  examples) supports a source image + an optional mask + a natural-language instruction —
  structurally the right shape for "edit only the smile region." Precision of masked
  editing on a small, specific region (teeth/gingiva) versus whole-image regeneration:
  UNKNOWN, needs the controlled benchmark.
- **Data retention / training** (VERIFIED, OpenAI's own launch post): *"By default, we
  never train on customer API data, and all image inputs and outputs remain subject to our
  API usage policies."* No free-vs-paid split caveat was found in this source (unlike
  Google) — INFERENCE that this "never train by default" applies uniformly to all API
  usage tiers, not confirmed against OpenAI's full data-usage policy page in this session.
- **Content provenance**: generated images carry C2PA metadata (VERIFIED, same source) —
  a plus for transparency, but must be checked in Stage 1 that this metadata does not
  itself leak anything (device/account identifiers) into a file the user exports/shares.
- **Regional availability**: OpenAI publishes a supported-countries list
  (`help.openai.com/en/articles/5347006`) confirmed to exist, but **this session could not
  retrieve its actual country contents** — **UNKNOWN whether Yemen is on OpenAI's
  supported list**; this is a hard blocker-or-not question that must be answered from
  that exact page before OpenAI could be selected, given the product's Yemeni operating
  context.
- **Commercial rights**: standard API output ownership terms per several consistent
  secondary sources (full commercial usage rights, user retains ownership) — INFERENCE,
  not verified against OpenAI's own terms of use in this session.
- **Vendor lock-in**: closed, hosted-only.

### 3. Black Forest Labs — FLUX.1 Kontext (Pro/Max/Dev)

- **Editing capability**: purpose-built for multi-turn, character/identity-consistent
  editing (VERIFIED, `bfl.ai` product description and Vercel AI Gateway model page, both
  fetched/searched this session) — this is the strongest *positioning* match for "keep
  the same face, change only the smile" of the three candidates. Independently ranked
  first on "KontextBench" for text-editing and character preservation per Black Forest
  Labs' own technical report (INFERENCE — cited by a secondary source, not fetched
  directly).
- **Pricing**: ~$0.04/image for Kontext Pro is consistent across several secondary
  aggregators (INFERENCE); Black Forest Labs' own pricing page exists at `bfl.ai/pricing`
  / `docs.bfl.ml/quick_start/pricing` (confirmed to exist, credit-based, 1 credit =
  $0.01) but this session did not fetch its full current rate table for Kontext
  specifically — the ~$0.04/image figure should be re-confirmed directly in Stage 1.
- **Data retention / training — the decisive negative finding** (VERIFIED, `bfl.ai/legal/privacy-policy`
  and `bfl.ai/legal/terms-of-service`, both fetched this session): Black Forest Labs
  **trains on customer Inputs and Outputs by default**. The opt-out is manual and
  reactive — a developer must email `privacy@blackforestlabs.ai` / `legal@blackforestlabs.ai`
  with a "Training Opt Out" request; and critically, *"The license granted... with respect
  to future training use terminates prospectively, but continues to apply to (i) Your
  Content already used to train a model."* This is the opposite default from both Google
  (paid tier: never) and OpenAI (never, by default) among the three candidates.
- **Biometric data clauses** (VERIFIED, `bfl.ai/legal/developer-terms-of-service`): the
  developer terms contain an explicit Biometric Data clause requiring the developer to
  "comply with all applicable laws related to Biometric Data, including obtaining all
  required consents... and comply with all Biometric Data retention periods" and
  prohibiting use of the FLUX models "to build, enhance, or augment any facial
  recognition or surveillance system." This confirms Black Forest Labs itself treats
  facial photo input as biometric data requiring special legal handling — directly
  relevant to this product's patient-facing-photo use case.
- **Vendor lock-in — the decisive positive finding**: FLUX ships an **open-weight `Dev`
  variant** (VERIFIED product-line fact, multiple sources including Black Forest Labs'
  own site) that can be self-hosted, eliminating both per-image API cost and the
  training-on-input risk above at the cost of operating GPU infrastructure directly. This
  is the only candidate of the three with a credible self-host escape hatch.
- **Product-priority risk**: FLUX.2 is now Black Forest Labs' recommended flagship for new
  projects; Kontext specifically is described by a secondary trade source as receiving
  "lower development priority going forward" (INFERENCE) — a longevity concern to weigh
  against its identity-preservation strength.
- **Regional availability / medical-use restriction**: UNKNOWN — not found in this
  session; must be checked against Black Forest Labs' usage policy directly in Stage 1.

### 4. Dental-specific "smile design" software (SmileFy, Smilecloud, exocad Smile Creator,
   3Shape TRIOS Smile Design, Medit Smile Design, DTS PRO, Smile Designer Pro, and
   similar)

- **Finding**: every one of these identified in this session's research (VERIFIED to
  exist as products, via multiple industry sources) is a **clinic/practice-facing SaaS
  or CAD/CAM-bundled product**, sold to dentists and dental labs for chairside treatment
  planning, often tied to a specific intraoral scanner ecosystem (3Shape TRIOS, Medit).
  **No public, usage-based developer API was found for any of them** in this session —
  UNKNOWN whether one exists privately behind a partner/enterprise sales process, but no
  evidence of a self-serve integration path surfaced despite specific searching.
- **Architectural implication**: this product is explicitly a **personal-user
  application, not clinic-management software** (established product boundary, unchanged
  since Phase 1). A B2B clinical SaaS product designed to be operated *by a dentist inside
  a clinic workflow* is not a drop-in `SmileSimulationProviderPort` implementation the way
  a general-purpose image-editing API is — even setting the API-availability question
  aside, integrating one would likely require a business partnership, not just an SDK
  key, and may implicitly assume clinic-side supervision the personal-user product
  explicitly does not have.
- **Recommendation**: do not pursue as a Stage 1 provider candidate on current evidence.
  If Pluto wants this reconsidered, the concrete next step is a direct sales inquiry to
  one of these vendors (e.g., SmileFy, which markets an "AI-powered" single-photo
  simulation flow) to ask whether a usage-based API exists at all — this session found no
  public evidence either way beyond "not advertised."

## Weighted benchmark

Scale: 1 (worst) – 5 (best) per dimension, based on evidence above.
**I** = INFERENCE-based score (lower confidence); **V** = VERIFIED-based score.

| Dimension | Weight | Google Nano Banana (paid tier) | OpenAI GPT Image | BFL FLUX Kontext |
|---|---|---|---|---|
| Identity preservation (claimed) | 20% | 4 (I) | 3 (I) | 4 (I) — purpose-built positioning |
| Local dental control / edit precision | 20% | UNKNOWN — 0, see rejection rule | UNKNOWN — 0 (has mask-based edit endpoint, untested) | UNKNOWN — 0, see rejection rule |
| Realism (claimed, general) | 10% | 4 (I) | 4 (I) | 4 (I) |
| Latency (claimed) | 10% | 3 (I) | UNKNOWN | 5 (I) — "fastest of three tested," ~7s |
| Cost at scale (see quantification below) | 15% | 4 (V, cheapest verified per-image at 1K) | 3 (V for legacy tier; unverified for current flagship) | 4 (I) |
| Privacy / data-retention default | 15% | 5 (V) — paid tier never trains | 5 (V) — never trains by default | **1 (V)** — trains by default, manual opt-out, retroactive-only |
| Commercial rights clarity | 5% | 4 (V) | 3 (I) | 3 (V, but self-host escape hatch raises ceiling to 5 if Dev used) |
| Regional availability (Yemen) | 5% | 5 (V — confirmed listed) | 0 (UNKNOWN — must verify before use) | 0 (UNKNOWN — not checked) |

**No composite score is computed.** Two of the eight dimensions
(local dental control, and at least one provider's regional availability) are UNKNOWN for
every candidate, and UNKNOWN on a load-bearing dimension is not averageable into a
number without hiding the gap — that is precisely what Rule 3's rejection thresholds
below are for.

## Explicit rejection thresholds

A candidate is **rejected outright**, regardless of its other scores, if any of the
following is confirmed true in the controlled benchmark (Stage 1):

- **Identity drift**: a same-subject before/after pair is judged (by a documented,
  repeatable visual check — not "it looked fine") to change perceptible identity outside
  the mouth/smile region — hairline, eye shape/color, skin tone, face geometry, apparent
  age.
- **Lip/gingiva distortion**: any output shows anatomically implausible lips, gumline, or
  tooth count/shape that a lay reviewer would find obviously wrong (not merely
  imperfect).
- **Dental artifacts**: warped, duplicated, or missing teeth; visible seam/blend
  artifacts at the edit boundary.
- **Inconsistency**: repeated runs of the identical input + instruction produce materially
  different degrees of change (unpredictable enough that the user cannot form an
  expectation of what "generate" will do).
- **Latency**: p95 end-to-end latency exceeds a to-be-set ceiling that keeps the mobile UX
  inside the existing bounded-retry/timeout discipline already used elsewhere in this
  codebase (concrete number is a Stage 1 product decision, not fixed here).
- **Cost**: projected cost per generation, at the operability volumes quantified below,
  exceeds what the product's monetization model (not yet defined — out of scope for
  Stage 0) can sustain.
- **Privacy risk**: the provider trains on input by default with no credible,
  contractually enforceable opt-out available to a project at this product's scale (this
  threshold, applied literally, is already a strong signal against Black Forest Labs'
  hosted Kontext Pro/Max *unless* the opt-out is obtained and confirmed in writing before
  any real patient-adjacent photo is sent — the open-weight self-hosted `Dev` variant is
  exempt from this concern entirely, since no data leaves the operator's own
  infrastructure).

No real patient data may be used to evaluate these thresholds, per Rule 3 — the
controlled benchmark must use synthetic/consented test photography only.

## Operability quantification

Verified per-image pricing (paid tier, single 1024×1024-class output, no retries) from
above:

| Volume/month | Google Nano Banana 2 (~$0.067/img) | OpenAI gpt-image-1 legacy medium (~$0.07/img, VERIFIED) | BFL FLUX Kontext Pro (~$0.04/img, INFERENCE) |
|---|---|---|---|
| 100 | $6.70 | $7.00 | $4.00 |
| 1,000 | $67.00 | $70.00 | $40.00 |
| 10,000 | $670.00 | $700.00 | $400.00 |

These are **generation-provider cost only**. A complete monthly figure additionally
needs, none of which is estimated here because none is yet decided or measured in this
codebase:

- **Retries**: the state-machine doc proposes up to 3 attempts for transient failures —
  worst case multiplies the table above by up to 3× for the fraction of jobs that hit a
  transient provider error (that fraction is UNKNOWN pre-launch).
- **Storage/egress**: generated PNGs at the sizes already used elsewhere in this codebase
  (compare Phase 4's 1080–1920px export presets) are small (low hundreds of KB to a few
  MB) — object storage cost at this scale is expected to be a rounding error next to
  generation cost, but no specific cloud storage vendor/pricing has been chosen for
  production (the current `ObjectStoragePort` has a local-disk and an S3-compatible/MinIO
  adapter for dev/test only), so this is UNKNOWN, not zero.
- **Queueing/observability infrastructure**: cost of the durable queue and any added
  monitoring named in the architecture doc's Stage 1 scope is a separate, unestimated
  line item dependent on which durable queue technology is chosen (not decided in Stage
  0).
- **Provider outage strategy**: no cost model exists yet for a secondary/fallback
  provider — Rule 8 asks this be quantified, and the honest answer is that doing so
  requires first deciding whether multi-provider fallback is even in scope (the smallest
  Stage 1 scope in the architecture doc explicitly excludes it), so a real number cannot
  be produced without that product decision first.

## Summary table (VERIFIED / INFERENCE / UNKNOWN counts)

| Candidate | VERIFIED facts found | INFERENCE facts | UNKNOWN (must resolve before selection) |
|---|---|---|---|
| Google Gemini (Nano Banana family) | Pricing mechanism, paid-tier no-training policy, medical-use ToS prohibition, Yemen regional availability, rate-limit tiering mechanism | Exact current-model identity-preservation claims, exact current RPD/IPM numbers | Dental-specific edit-precision accuracy |
| OpenAI GPT Image | Original `gpt-image-1` pricing, no-training-by-default policy, C2PA metadata | Current flagship (`gpt-image-2`) pricing/lineup, commercial-rights terms detail | **Yemen regional availability**, dental-specific edit-precision accuracy |
| Black Forest Labs FLUX Kontext | **Trains on input by default**, biometric-data ToS clause, open-weight self-host option exists | Kontext Pro pricing, KontextBench ranking | Regional availability, medical-use restriction (if any), dental-specific edit-precision accuracy |
| Dental-specific vendors | Product category exists, clinic/CAD-CAM-oriented | — | Whether any public developer API exists at all |

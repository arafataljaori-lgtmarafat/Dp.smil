# Phase 5 / Stage 0 — Smile AI Decision Document

**Authoritative codebase for this Stage 0 session:**
`DentPilot_Phase_4_Stage_2_Native_Validation_Claude.zip`
SHA-256 `69ce98a7b5a8427c5420d6a46c29c3e6920f45cafcf7d3f80b9553cc581f813f`.

**Preserved status, unchanged by this session:**
```text
PHASE 4 CODE COMPLETE — EXTERNAL ANDROID/iOS DEVICE GATE REMAINS
```
Phase 4 is not reopened. The native device gate is not claimed passed. This session added
documentation only — no application, mobile, or infrastructure source file was touched.

This is a decision-gate document, per the Stage 0 command: no provider SDK, no Prisma
migration, no API/UI behavior change, no fake AI, no video, and no Phase 5 Stage 1 code
were written in this session.

## 1. What was audited (full detail: `docs/phase-5-generation-architecture.md`)

The existing `GenerationJob`/`GenerationVersion`/queue/provenance/idempotency/
`SmileSimulationProviderPort`/storage-ownership architecture was read directly from
source, not inferred from prior reports. **Finding: the provider boundary is already
correctly shaped and reusable as-is** — `SmileSimulationProviderPort.generate()` is a
plain bytes-in/bytes-out contract with no vendor awareness anywhere in the domain or
application layer, matching the mission's required path
(`Mobile → DentPilot API → generation service → provider-neutral adapter → private
storage → immutable GenerationVersion`) exactly. **No blocker requiring redesign of this
boundary was found.**

Concrete, evidenced gaps exist (non-durable queue, no cancellation implementation, no
timeout/stale-job reconciliation, no webhook ingestion, no retry policy, no
presigned-storage capability) — all additive work for a future Stage 1, detailed with
exact source evidence in the architecture document, not reasons to redesign what already
works.

## 2. What was researched (full detail: `docs/phase-5-smile-ai-provider-benchmark.md`)

Three general-purpose image-editing API candidates were researched from primary sources
this session (Google Gemini "Nano Banana" family, OpenAI GPT Image family, Black Forest
Labs FLUX.1 Kontext), plus dental-specific "smile design" software as a fourth category.
Every fact is tagged VERIFIED, INFERENCE, or UNKNOWN in that document; nothing below
restates a claim without that grounding.

**Headline findings:**

- **No candidate has a verified, dental-specific edit-precision benchmark.** This is the
  single most important gap: every candidate's identity-preservation and editing-quality
  claims come from general-purpose marketing/benchmark material, not from anything tested
  against a mouth/teeth/gingiva edit specifically. This is exactly what a controlled
  benchmark is for and cannot be resolved by more desk research.
- **Black Forest Labs FLUX Kontext trains on customer input by default** (verified
  directly from its own privacy policy and terms of service), with only a manual,
  non-retroactive opt-out. This is a material privacy risk given the product handles
  facial photographs, and is the clearest rejection-threshold trigger found in this
  session — unless the open-weight, self-hostable `Dev` variant is used instead, which
  avoids the risk entirely by keeping all data on infrastructure this product's operator
  controls.
- **Google (paid tier) and OpenAI both verified as not training on API input by
  default.** Google additionally carries a directly-relevant, binding contractual
  restriction against clinical/medical use, which reinforces rather than conflicts with
  this product's own safety boundary.
- **Yemen is confirmed available for the Google Gemini API** (verified directly from
  Google's own regions page). **Whether Yemen is supported by OpenAI's API is unresolved**
  — OpenAI's supported-countries page exists but its contents could not be retrieved this
  session. Given the product's Yemeni operating context (established in Pluto's project
  profile), this is a concrete, must-resolve item before OpenAI could be selected.
- **Dental-specific "smile design" vendors (SmileFy, Smilecloud, exocad, 3Shape, Medit,
  and others) show no evidence of a public, usage-based developer API** — they are
  clinic-facing SaaS/CAD-CAM products, not a fit for this personal-user product's
  architecture on current evidence, and are not recommended for further pursuit absent a
  direct partnership inquiry.

## 3. Threat model and safety boundary (full detail:
   `docs/phase-5-smile-ai-threat-model.md`)

All ten required threat areas were modeled against the audited architecture. Nine of ten
map to mitigations that already exist and are verified correct in this codebase today
(private owner-scoped storage, no provider secrets reachable from mobile, replay
protection via idempotency + atomic claiming, cross-account isolation enforced at the
database level, safe/minimal logging discipline, EXIF stripped at ingestion). The
remaining risk surface is genuinely new to this feature and is not yet closed by
anything in the codebase:

1. **Retry-safe provider-call idempotency ("lost-success recovery")** is unresolved for
   every candidate equally — this is an architecture gap (see the Stage 1 scope in the
   architecture doc), not a reason to prefer one provider over another.
2. **No candidate offers a verified zero-retention guarantee.** Google and OpenAI don't
   train on input; neither confirms zero transient logging/retention. This is a residual,
   documented risk to accept, negotiate, or avoid via self-hosting — not something this
   desk-research session can eliminate.
3. **Signed-URL / provider-upload path is not yet needed** by any evaluated candidate
   (all expect request-body image upload), so the highest-risk item in the threat model
   (a bearer-credential signed URL) is currently avoidable by design, not just by
   discipline — this should remain the default assumption for Stage 1.

The safety boundary itself — visualization only, never diagnosis, never a treatment
prediction — is not a new invention of this document. It is already the operating
assumption of the existing mock provider's own placeholder output and is independently
reinforced by at least one candidate provider's own binding usage terms.

## 4. Operability

Verified/inferred per-image provider cost at 100/1,000/10,000 generations per month is
quantified in the benchmark document, ranging from roughly $4–$7 at 100/month to
$400–$700 at 10,000/month across the three candidates, for generation cost alone. Retry
overhead, storage/egress, queueing/observability infrastructure cost, and a
provider-outage fallback strategy are all identified as currently unquantifiable —
honestly marked UNKNOWN rather than estimated without basis — because each depends on a
product or infrastructure decision (retry policy specifics, durable queue technology,
whether multi-provider fallback is even in scope) that has not yet been made. This is
recorded as a required Stage 1 input, not glossed over.

## 5. Decision

Weighing the above:

- The reusable architecture finding is unambiguous and positive — no blocker exists there.
- The provider research is thorough and primary-sourced, but leaves genuine, load-bearing
  unknowns (dental-specific edit precision for every candidate; OpenAI's regional
  availability for this product's context) that **cannot be resolved by more desk
  research** — they require actually calling a provider with controlled test imagery,
  which is precisely what a controlled provider benchmark is for and precisely what Stage
  0 is not permitted to do.
- The threat model found no unmitigable blocker, but did surface one real open design
  question (lost-success/retry-safe provider idempotency) that any Stage 1 implementation
  must resolve before going live with a real provider, regardless of which one is chosen.

None of these unknowns is a reason to say the path is undefined or that required facts are
structurally missing — they are exactly the facts a *controlled* benchmark is designed to
produce, and the benchmark document above already defines the rejection thresholds that
benchmark must apply. This is a "the next concrete step is well-defined and boundaryed"
situation, not a "we don't know what to do next" situation.

```text
READY FOR CONTROLLED PROVIDER BENCHMARK
```

## 6. Smallest defensible Phase 5 Stage 1 scope (defined here; not started)

If and when approved to proceed past this decision gate, the smallest slice that turns
this decision into a real, safely-operable feature — restated from the architecture
document's §5, in dependency order:

1. **Controlled provider benchmark execution** (not implementation): using synthetic or
   explicitly consented non-patient test photography only, run the same edit instruction
   against Google Gemini (paid tier), OpenAI GPT Image, and Black Forest Labs FLUX Kontext
   (hosted, only if a written training opt-out is obtained first — otherwise test the
   self-hosted `Dev` variant instead), scored against this document's rejection
   thresholds. Resolve the two headline unknowns (dental edit precision; OpenAI's Yemen
   availability) as part of this step.
2. Durable queue behind the existing `GenerationQueuePort` interface — no
   application/domain code change required.
3. `PROCESSING_TIMEOUT` failure code + a generation reconciler mirroring the Phase 3
   upload-session recovery pattern.
4. Bounded retry (attempt count + backoff) for `PROVIDER_FAILED`/`STORAGE_WRITE_FAILED`
   only, with a provider-call idempotency mechanism resolving the lost-success-recovery
   gap identified in the threat model.
5. `cancel()` for the `queued` state only.
6. One concrete provider adapter implementing `SmileSimulationProviderPort`, built only
   after step 1 selects a winner.
7. Widen the output mime-type assertion only if the selected provider's native output
   isn't PNG.

Explicitly out of scope for this smallest slice: webhook ingestion (add only if the
selected provider is genuinely async/webhook-based), presigned-URL storage access (add
only if the selected provider requires provider-side fetch), mid-flight cancellation,
multi-provider fallback/routing, and any UI change beyond surfacing the failure/cancel
states the domain already defines.

**Stage 1 is not started by this document.** This scope definition is informational,
per the Stage 0 command's explicit instruction to define but not begin it.

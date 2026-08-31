# Phase 5 / Stage 0 — Smile AI Threat Model &amp; Safety Boundary

Decision-gate documentation only — no code changed. Threat-modeled against the audited
architecture in `docs/phase-5-generation-architecture.md` and the provider facts in
`docs/phase-5-smile-ai-provider-benchmark.md`.

## Safety boundary (Rule 6)

**Smile AI is a visualization/simulation feature, not a diagnostic or predictive
clinical tool, unless and until it is clinically validated as such.**

This is not a new policy invented for this document — it is already the operating
assumption of every artifact in this codebase touching generation:

- The existing mock provider's placeholder output is explicitly labeled *"NOT A CLINICAL
  SIMULATION"* and *"NO DIAGNOSIS · NO TREATMENT PLAN · NO PREDICTION"*
  (`mock-smile-simulation.provider.ts`).
- Every candidate provider evaluated in the benchmark either contractually prohibits
  clinical/medical use outright (Google, verified) or is a general-purpose creative tool
  never designed, marketed, or validated for clinical accuracy (OpenAI, Black Forest
  Labs).

Concrete requirements this boundary imposes on any future Stage 1 implementation:

1. **UI language**: every surface showing a generated result must use visualization
   language ("a possible visualization," "not a treatment prediction") — never
   "preview of your treatment outcome," "expected result," or similar language implying
   clinical accuracy or a guarantee.
2. **No treatment-plan derivation**: a generated image must never be used, by this
   product, as an input to any treatment-planning, treatment-recommendation, or
   diagnostic feature, now or without a separate, explicit, clinically-validated design
   effort.
3. **No clinical-workflow presentation**: consistent with the existing personal-user
   product boundary (this app is not clinic-management software), Smile AI output must
   not be framed as something a clinician relies on for patient care decisions.
4. **Provider contractual alignment**: whichever provider is eventually selected, its own
   usage policy's medical-use restriction (verified for Google; unverified for OpenAI and
   Black Forest Labs — a required Stage 1 check) must be re-confirmed compatible with
   this product's actual use of the output before integration, not assumed.
5. **No fake AI**: the current mock provider's practice of being honestly and visibly
   labeled as a mock is correct and must be preserved until a real provider is wired in —
   never silently upgrade the mock's visual fidelity to look real without it being real.

## Threat model

### 1. Patient images (source photos)

- **Threat**: unauthorized access to a user's uploaded face/mouth photo, at rest or in
  transit, by anyone other than the owning user and the minimum necessary processing
  path.
- **Existing mitigation** (verified in the audited codebase): private, owner-scoped
  object storage (`users/{ownerUserId}/cases/{caseId}/source/{mediaId}`, regex-enforced),
  no public storage URLs, streaming ingest with SHA-256 integrity, cross-user access
  returns non-enumerating 404s.
- **New surface for Smile AI**: the source image now additionally travels to a third
  party (the chosen provider). This is a genuinely new trust boundary that does not exist
  for any other feature in this codebase today.
- **Required for Stage 1**: confirm the chosen provider's transport is TLS end-to-end
  (expected for all three candidates but not independently verified per-candidate in this
  session), and that the provider path is only ever reached from the API server process
  (never mobile-direct) — already structurally guaranteed by the current architecture's
  lack of any presigned-URL capability (see architecture doc §1).

### 2. Provider upload (how the source reaches the provider)

- **Threat**: if a future provider integration requires the *provider* to fetch the
  source image (rather than the API server pushing bytes in a request body), a
  short-lived signed URL would need to be minted for that purpose — a new artifact that
  does not exist anywhere in this codebase today (`ObjectStoragePort` has no presign
  method, confirmed in the architecture audit). Any such URL is a bearer credential:
  anyone who obtains it before expiry can read the private source image without further
  authentication.
- **Mitigation requirement for Stage 1, if this path is needed**: shortest viable expiry,
  single-use where the storage backend supports it, scoped to exactly one object key,
  never logged (see §8), and never exposed to the mobile client under any circumstance —
  it would flow API-server → provider only.
- **Preferred alternative**: push bytes to the provider directly from the API server
  (the shape all three benchmarked candidates' APIs actually expect — request-body image
  upload, not provider-side fetch), which avoids this threat entirely. This should be the
  default assumption for Stage 1 unless a specific selected provider requires otherwise.

### 3. Provider secrets

- **Threat**: a provider API key leaking to the mobile client, to logs, to error
  messages, or to a third party.
- **Existing mitigation**: the mission's non-negotiable rule 4 ("mobile must never hold
  provider secrets") is already structurally satisfied by the current architecture —
  `SmileSimulationProviderPort` is only ever constructed and called from
  `apps/api/src`; nothing in `apps/mobile` references a provider key, and the existing
  auth model gives mobile only an opaque session token, never infrastructure credentials.
- **Required for Stage 1**: store the real provider key using the same discipline already
  used for other API secrets in this codebase (environment configuration, never
  committed — consistent with `.env.example`'s existing pattern), and ensure the
  provider adapter's error handling never echoes the key or the raw request into a log
  line or an API error response surfaced to the client (see §8 for the existing logging
  discipline this must match).

### 4. Webhooks (if a webhook-based provider is selected)

- **Threat**: a forged webhook request (no provider selected in this session accepts
  webhooks by verified fact, but several async image-generation providers in general use
  them) could be used to inject a fake "succeeded" result, poison the immutable
  `GenerationVersion` record, or trigger unbounded processing.
- **Mitigation requirement, if applicable**: signature verification on every inbound
  webhook (per the selected provider's own signing scheme), replay-window rejection (see
  §5), and — critically — the webhook handler must independently re-fetch or otherwise
  verify the claimed result rather than trusting the webhook payload's content
  unconditionally, mirroring the existing discipline where `process()` re-verifies source
  media integrity from the database rather than trusting the queue message's claims about
  content.
- **Current state**: zero webhook endpoints exist in this codebase (confirmed in the
  architecture audit) — this entire threat class is currently inapplicable and stays that
  way unless a webhook-based provider is chosen.

### 5. Replay

- **Threat**: a duplicate or replayed request (queue message, webhook, or client retry)
  causing a second real provider call — and a second real charge — for work already done.
- **Existing mitigation** (verified, already correctly implemented): idempotency keys on
  the request path (`createOrFindByIdempotency`, unique per `[ownerUserId, projectId,
  idempotencyKey]`), atomic claim-for-processing preventing double-execution of the same
  job, and the queue message re-validation (`jobBeforeClaim.correlationId !==
  message.correlationId` check) rejecting stale messages.
- **Gap for Stage 1**: this correctly prevents replay at the *local* queue/claim layer,
  but does **not** yet prevent replay at the *provider call* layer specifically — the
  "lost-success recovery" gap already identified in the architecture doc (a crash after
  the provider call succeeds but before local commit could cause a resumed worker to call
  the provider a second time for the same logical attempt). This is the single most
  security-and-cost-relevant open item carried from the architecture doc into this threat
  model.

### 6. Cross-account isolation

- **Threat**: User A's generation job, source media, or generated output becoming visible
  to User B.
- **Existing mitigation** (verified, already correctly implemented, and load-bearing
  throughout the entire schema): every generation-related table and repository method is
  `ownerUserId`-scoped, with composite foreign keys and unique constraints enforcing that
  scoping at the database level, not just in application code (`GenerationJob`,
  `GenerationVersion` schema, confirmed in the architecture audit). This is the same
  pattern already verified correct for Creation/media isolation in prior phases and
  extends unchanged to generation.
- **New surface for Smile AI**: the provider itself now has (transiently) both users' data
  across different requests. Cross-account isolation *within the provider's own systems*
  is outside this codebase's control and depends entirely on the provider's own
  architecture — this is not a gap this codebase can close, only a dependency to record:
  the chosen provider's own isolation guarantees (per-request, no cross-tenant data
  mixing) should be part of the Stage 1 provider selection write-up, not assumed.

### 7. Logs

- **Threat**: patient image bytes, base64, private storage keys, or full document
  payloads ending up in application logs, crash reports, or provider error responses
  surfaced to the client.
- **Existing mitigation** (verified in the Stage 2 native-error-logging audit and
  re-confirmed here): every sampled log call site across this codebase logs only opaque
  identifiers, error names/codes, and non-sensitive metadata — never bytes, never
  document payloads. The `DomainError.safeMessage` / raw-`message` split already
  separates what's safe to return to a client from what's safe to log internally.
- **Required for Stage 1**: the new provider adapter must be held to exactly this same
  standard — provider request/response logging (useful for debugging integration issues)
  must log status codes, timing, and the existing opaque `generationJobId`/
  `correlationId`, and must never log the image bytes sent to or received from the
  provider, and never log the raw provider API key or request headers.

### 8. EXIF

- **Threat**: GPS/location or device-identifying metadata in a source photo propagating
  into a generated/exported image and being shared externally.
- **Existing mitigation** (verified in the Stage 2 metadata/privacy audit): the mobile
  app's `ImagePicker` options already set `exif: false` at the point of ingestion — EXIF
  is never read from the source in the first place, so it cannot leak into anything
  downstream, including a future generated image.
- **New surface for Smile AI**: the provider's own output format may embed its own
  metadata (OpenAI's C2PA content-provenance metadata, verified in the benchmark doc, is
  one confirmed example). This is a **new** metadata source this codebase does not
  currently have to think about for the existing mock/composition-export paths.
  **Required for Stage 1**: inspect whatever metadata the selected provider's actual
  output contains and confirm it carries nothing beyond content-provenance/AI-disclosure
  information before it reaches export/share — this cannot be fully verified until a real
  provider is integrated and its actual output is inspected.

### 9. Retention / deletion

- **Threat**: a user deletes their case/account, but a copy of their photo persists
  somewhere outside this codebase's control — specifically, at the provider, if the
  provider retains input/output beyond the single request.
- **Provider-specific findings** (from the benchmark, directly relevant here): Google
  (paid tier) logs prompts/responses "for a limited period of time" for abuse-detection
  purposes even though it doesn't train on them — some transient retention exists.
  OpenAI's policy as fetched in this session did not specify a retention window beyond
  "never train by default." Black Forest Labs explicitly retains content already used for
  training even after an opt-out request. **None of the three candidates offers a
  contractually-guaranteed zero-retention API in what this session verified** — this is
  a real, unresolved gap that must be either accepted as a documented product risk,
  negotiated contractually (enterprise-tier zero-retention agreements exist at some
  providers but were not confirmed available at this product's likely scale), or
  mitigated by preferring the self-hosted FLUX Dev path where retention is entirely
  within the operator's own control.
- **This codebase's own side**: existing deletion behavior for `MediaAsset` rows uses
  `onDelete: Restrict` (verified in the architecture audit) — deletion is not yet
  cascading/self-service anywhere in the generation subsystem, consistent with the rest
  of the codebase's conservative approach to destructive operations. A user-initiated
  "delete my generated image" flow does not yet exist and would need explicit design
  (out of scope for Stage 0).

### 10. Accidental model training

- Covered in depth in the benchmark doc's privacy/data-retention findings per candidate.
  Restated here as the threat-model framing: **the single largest privacy risk
  identified in this entire Stage 0 exercise** is a provider silently incorporating a
  user's face photo into its training data by default, with no reliable way to later
  remove it. This is a confirmed, verified property of Black Forest Labs' hosted Kontext
  API absent an explicit opt-out obtained in advance, and is the primary driver behind
  that candidate's rejection-threshold flag in the benchmark doc.

### 11. Generated-asset ownership

- **Threat/ambiguity**: who "owns" a generated smile-simulation image — the user, this
  product, or (per most providers' terms) nobody exclusively, since providers generally
  reserve the right to generate similar output for others and do not grant exclusivity.
- **Existing precedent in this codebase**: `GenerationVersion` records are immutable,
  owner-scoped, and provenance-complete — the *record* of who generated what, from what
  source, when, is unambiguous and already correct. What's unresolved is the
  *commercial/legal* ownership question of the pixels themselves, which is a product/legal
  decision (what the product's own terms of service tell the end user about their rights
  to a generated image), not a technical one, and is explicitly out of scope for this
  Stage 0 technical decision gate.

## Summary of open items feeding the decision document

The threat model surfaces three items that materially affect the READY/BLOCKED decision:

1. Retry-safe provider-call idempotency (lost-success recovery) is unresolved for every
   candidate — an architecture gap, not a provider-specific one.
2. No candidate offers verified zero-retention; Black Forest Labs is the only one with a
   **verified** by-default training risk, which the self-hosted `Dev` variant fully
   avoids.
3. OpenAI's Yemen regional availability is UNKNOWN and must be resolved before OpenAI can
   be treated as viable for this product's actual operating context.

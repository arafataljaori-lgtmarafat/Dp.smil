# Phase 4 Closure — Stage 2 Native Validation Matrix

Updated during the Stage 2 execution session (continuation of the Stage 1 Final
Micro-Closure forensic validation). Re-probed fresh in this session, not carried over
assumption from Stage 1.

Environment: sandboxed Ubuntu 24.04 Linux container (`uname -a`: `Linux ... x86_64 GNU/Linux`),
restricted network egress (allowlist: npm/pip/crates/github/ubuntu-archive registries only —
no Docker Hub, no Prisma binary CDN, no Expo registry API, and — newly confirmed this
session — no Android SDK repository either, see below).

## Section 0 preflight — toolchain / environment availability

| Requirement | Status | Evidence |
|---|---|---|
| Android SDK | UNAVAILABLE — ENVIRONMENTAL | no `$ANDROID_HOME`/`$ANDROID_SDK_ROOT`; no `sdkmanager` |
| Java/JDK | AVAILABLE | OpenJDK 21.0.10 present (insufficient alone without the rest of the toolchain) |
| Gradle / Expo Android build toolchain | UNAVAILABLE — ENVIRONMENTAL | no `gradle` on PATH; no `android/` directory committed (managed Expo workflow — would need `expo prebuild` first, which itself needs template/package downloads) |
| Android emulator | UNAVAILABLE — ENVIRONMENTAL | no `emulator` binary |
| connected Android device | UNAVAILABLE — ENVIRONMENTAL | no `adb`, no device |
| adb | UNAVAILABLE — ENVIRONMENTAL | not installed |
| macOS | UNAVAILABLE — ENVIRONMENTAL | host OS is Linux, confirmed via `uname -a` |
| Xcode | UNAVAILABLE — ENVIRONMENTAL | requires macOS |
| iOS simulator | UNAVAILABLE — ENVIRONMENTAL | requires macOS/Xcode |
| connected iPhone | UNAVAILABLE — ENVIRONMENTAL | no physical device access from sandbox |
| CocoaPods | UNAVAILABLE — ENVIRONMENTAL | requires macOS toolchain |
| Expo CLI / project tooling | AVAILABLE | `expo` CLI runs via workspace deps; JS-bundle `expo export` verified working for all three platforms (android/ios/web) this session |
| **New this session:** Android SDK repository reachability (`dl.google.com`) | UNAVAILABLE — ENVIRONMENTAL | `curl -s -o /dev/null -w "%{http_code}"` → `403` (egress-blocked, same as Prisma binary host) — confirms the Android SDK could not even be provisioned from within this sandbox if attempted, not merely that it isn't pre-installed |

## Adjacent infrastructure blockers (carried from Stage 1, re-confirmed unchanged)

| Requirement | Status | Evidence |
|---|---|---|
| Prisma engine binaries (`binaries.prisma.sh`) | UNAVAILABLE — ENVIRONMENTAL | re-probed this session: `403` again |
| Docker | UNAVAILABLE — ENVIRONMENTAL | not installed; blocks CI's MinIO container steps |
| `expo install --check` (dependency compatibility API) | UNAVAILABLE — ENVIRONMENTAL | requires Expo registry API, not on allowlist |

## Section 1 — Native dependency integrity (best-effort static check, unchanged from Stage 1)

`@shopify/react-native-skia@2.2.12`, `react-native-gesture-handler@~2.28.0`,
`react-native-reanimated@~4.1.7`, `react-native-worklets@0.5.1`,
`expo-file-system@~19.0.21`, `expo-media-library@~18.2.1`, `expo-sharing@~14.0.8`,
`expo-image-picker@~17.0.10`, `expo-secure-store@~15.0.8` against
`expo@~54.0.29` / `react-native@0.81.5` / `react@19.1.0`. No internal version
contradiction found. The official `expo install --check`/`expo-doctor` compatibility
check against Expo's live registry could not run (network-blocked, see above).

## Sections 2–20 — Native build / on-device runtime gates

Every one of these requires an actual Android/iOS toolchain, emulator/simulator, or
physical device, none of which exist in, or are reachable from, this sandbox. Marked
honestly per the Stage 2 spec's own required vocabulary — no fake pass recorded for any:

| Section | Gate | Status |
|---|---|---|
| 2 | Android Native Build Gate | `UNAVAILABLE — EXTERNAL ANDROID BUILD GATE REQUIRED` |
| 3 | iOS Native Build Gate | `UNAVAILABLE — EXTERNAL XCODE/IPHONE GATE REQUIRED` |
| 4 | Real Android Editor Flow | `UNAVAILABLE — EXTERNAL ANDROID BUILD GATE REQUIRED` |
| 5 | Real iPhone Flow | `UNAVAILABLE — EXTERNAL XCODE/IPHONE GATE REQUIRED` |
| 6 | High-Resolution Media Stress Matrix (on-device) | `UNAVAILABLE — EXTERNAL DEVICE GATE REQUIRED` |
| 7 | Memory Stability Test (on-device) | `UNAVAILABLE — EXTERNAL DEVICE GATE REQUIRED` |
| 8 | Main-Thread/UI-Blocking Gate (on-device profiling) | `UNAVAILABLE — EXTERNAL DEVICE GATE REQUIRED` |
| 9 | Gesture Performance (on-device latency) | `UNAVAILABLE — EXTERNAL DEVICE GATE REQUIRED`; **coalesced-autosave correctness** (the code/config half of this gate) is PASSED — see `phase4c-editor-autosave.test.ts` |
| 10 | Export Runtime Integrity (on-device dimension read-back) | `UNAVAILABLE — EXTERNAL DEVICE GATE REQUIRED`; preset math itself is PASSED via `phase4c-composition-export.test.ts` / `phase4-closure-offscreen-export.test.ts` |
| 11 | Save-to-Gallery Permission Discipline (runtime grant/deny/limited) | `UNAVAILABLE — EXTERNAL DEVICE GATE REQUIRED`; **static config discipline** PASSED — see Stage 2 execution report §Permission audit |
| 12 | Share Sheet Runtime | `UNAVAILABLE — EXTERNAL DEVICE GATE REQUIRED`; `Sharing.isAvailableAsync()` guard confirmed present in code |
| 13 | HEIC/HEIF iPhone Path | `UNAVAILABLE — EXTERNAL XCODE/IPHONE GATE REQUIRED` |
| 14 | Android Process/Lifecycle Recovery | `UNAVAILABLE — EXTERNAL ANDROID BUILD GATE REQUIRED` |
| 15 | iOS Lifecycle | `UNAVAILABLE — EXTERNAL XCODE/IPHONE GATE REQUIRED` |
| 16 | Network Failure Matrix (on native runtime) | `UNAVAILABLE — EXTERNAL DEVICE GATE REQUIRED` for true native-runtime conditions; **bounded-retry code/config discipline** PASSED — see `phase3c-media-upload-orchestrator.test.ts` |
| 17 | Identity Isolation Runtime Gate | `UNAVAILABLE — EXTERNAL DEVICE GATE REQUIRED` for on-filesystem device inspection; **cache-clearing wiring** PASSED — see `createSessionInvalidator` in `auth-provider.tsx` + `phase4-closure-auth-cache-invalidation.test.ts` |
| 18 | Disk Cache Boundedness (on-device) | `UNAVAILABLE — EXTERNAL DEVICE GATE REQUIRED`; **bounded eviction logic** PASSED — see Stage 2 execution report |
| 19 | Corrupt/Unexpected Media Behavior (on-device) | `UNAVAILABLE — EXTERNAL DEVICE GATE REQUIRED`; existing error-boundary/preview-cache tests cover the code-level fault containment |
| 20 | Accessibility & Mobile Ergonomics (on-device) | `UNAVAILABLE — EXTERNAL DEVICE GATE REQUIRED` |

## Sections 21–24 — Static/code-level audits (executed this session, no device required)

| Section | Gate | Status | Evidence |
|---|---|---|---|
| 21 | Android/iOS Platform Divergence Audit | **PASSED** | Only one true iOS-vs-Android branch exists in the whole app (`KeyboardAvoidingView` `behavior` prop), justified by standard RN keyboard-lifecycle handling. All other `Platform.OS` branches are web-vs-native (justified: `SecureStore` availability, native Skia availability). Zero divergence in template math, document schema, or creation semantics. |
| 22 | Background Export — Decision | **DECISION RECORDED: not needed for Phase 4** | Export is a single bounded in-memory JPEG composite (max 1920×1080 target, ≤2 source images) driven by an awaited `onPress` handler with no task-manager/background-fetch involved anywhere in the codebase — see Stage 2 execution report. |
| 23 | Metadata & Privacy (EXIF) | **PASSED** | `ImagePicker` options set `exif: false` at source ingestion (`media-picker.ts`); no code path anywhere writes EXIF into an export. GPS/device-identifier propagation is structurally impossible, not just avoided by convention. |
| 24 | Native Error Logging | **PASSED** | All sampled log call sites (`composition-error-boundary.tsx`, `[creationId].tsx`, API's `ApiExceptionFilter`, `media-upload-recovery.bootstrap.ts`) log only `component`/`errorName`/`errorCode`/`requestId` — never document payloads, image bytes, or storage keys. `DomainError.safeMessage` is a deliberate safe/unsafe message split. |

## Section 25 — CI Hardening

The one proven CI defect (workflow step ordering — `Local object-storage contract tests`
ran before `@dentpilot/domain`/`@dentpilot/contracts`/`@dentpilot/application` were built)
is fixed minimally in `.github/workflows/ci.yml`; see the Stage 2 execution report for the
reproduction and fix verification. No other CI steps were added or removed — all gates
listed in Section 25 of the Stage 2 spec (lint/typecheck/unit/integration/PostgreSQL/MinIO/
HTTP/Expo config-export/Phase 3-4 regressions) were already present in CI before this
session and remain unchanged.

## Section 26 — External Device Gate Artifact

Required and produced: `docs/phase-4-external-device-acceptance-checklist.md`.

# Phase 4 Closure — Stage 2 Execution Report

Native Android/iOS Runtime, Performance, Resource-Safety & Device Acceptance Gate.
Continuation of the Stage 1 Final Micro-Closure forensic validation (code verified,
MC-A/MC-B correct and wired, all sandbox-executable gates passed — see
`docs/phase-4-stage-1-forensic-validation-execution-report.md`).

## 0. Preflight

Fresh toolchain probe this session (not assumed from Stage 1): no Android SDK/adb/
emulator/Gradle; sandbox OS is Linux, so macOS/Xcode/CocoaPods/iOS simulator are
categorically absent, not merely uninstalled; no Docker. Newly confirmed this session:
the Android SDK repository (`dl.google.com`) is also not reachable from this sandbox
(`403`), so the toolchain could not even be provisioned here if attempted. Full detail in
`docs/phase-4-native-validation-matrix.md`.

## 1. Proven CI defect fixed: workspace-package build ordering

**Defect (as reported):** `Local object-storage contract tests` in
`.github/workflows/ci.yml` ran `pnpm --filter @dentpilot/api test:storage:local` before
any step built `@dentpilot/domain`/`@dentpilot/contracts`/`@dentpilot/application` (those
packages were first built later, inside the `Phase 2B mobile authentication verification`
step). `@dentpilot/api` depends on all three via `workspace:*`, resolved through their
`exports` field to `./dist/index.js` — which does not exist before a build.

**Reproduced locally, cleanly (no stale caches):**
```bash
find packages -name "*.tsbuildinfo" -delete   # match a real fresh checkout (gitignored)
rm -rf packages/{domain,contracts,application}/dist
pnpm --filter @dentpilot/api test:storage:local
```
```text
FAIL  test/storage/local-object-storage.contract.test.ts
Error: Failed to resolve entry for package "@dentpilot/domain". The package may have
incorrect main/module/exports specified in its package.json.
  File: apps/api/src/infrastructure/storage/local-object-storage.adapter.ts:7:54
```
This exactly reproduces the reported CI failure and confirms it is a pure build-ordering
issue — the `LocalObjectStorage` adapter's own code is not implicated (the failure occurs
at module resolution, before any adapter logic runs).

**Fix (minimal, CI-only, no application code touched):** inserted one step in
`.github/workflows/ci.yml`, immediately before `Local object-storage contract tests`:
```yaml
      - name: Build shared workspace packages required by API tests
        run: |
          pnpm --filter @dentpilot/domain build
          pnpm --filter @dentpilot/contracts build
          pnpm --filter @dentpilot/application build
```
No other CI step was reordered, removed, or refactored. The later, pre-existing build
calls inside `Phase 2B mobile authentication verification` are left exactly as they were
(idempotent rebuild — harmless, and touching them was not necessary to fix the defect).

**Fix verified, same clean-tree method:**
```bash
pnpm --filter @dentpilot/domain build
pnpm --filter @dentpilot/contracts build
pnpm --filter @dentpilot/application build
pnpm --filter @dentpilot/api test:storage:local
```
```text
✓ test/storage/local-object-storage.contract.test.ts (3 tests) 22ms
Test Files  1 passed (1)
     Tests  3 passed (3)
```

No deterministic in-repo test was added for the CI ordering itself — there is no
meaningful unit-testable surface for "does this YAML step run in the right order" other
than CI running it, which is what the fix directly addresses. The before/after
reproduction above is the deterministic proof requested.

## 2. Sections 21–24: static/code-level Stage 2 audits (executed, no device required)

**Section 21 — Android/iOS Platform Divergence Audit (PASSED).** Full-repo search for
platform-specific files (`*.ios.*`/`*.android.*`) and `Platform.OS` branches in
`apps/mobile`. Result: one true iOS-vs-Android branch exists in the entire app —
`Platform.OS === 'ios' ? 'padding' : undefined` for `KeyboardAvoidingView` behavior in
`app/creations/[creationId].tsx` — a standard, justified React Native keyboard-lifecycle
pattern. Every other `Platform.OS` branch found is web-vs-native (`SecureStore`
availability, native Skia rendering availability, export availability), each with a
concrete justification per the spec's own list. Zero divergence found in template math,
document schema, or creation semantics between platforms.

**Section 22 — Background Export decision (RECORDED: not needed for Phase 4).**
`exportImage` in `app/creations/[creationId]/export.tsx` is a plain awaited async
callback triggered by a button press; it renders one bounded offscreen composite (max
target 1920×1080, at most 2 source images) and writes one JPEG. No task-manager,
background-fetch, or any backgrounding infrastructure exists anywhere in the codebase.
Given the bounded, single-image nature of the operation, background export
infrastructure is not required for Phase 4. Real on-device timing under load remains an
external-checklist item (`docs/phase-4-external-device-acceptance-checklist.md`, A15/A29)
in case a specific low-end device proves materially slower than expected.

**Section 23 — Metadata & Privacy / EXIF (PASSED).** `apps/mobile/src/media/media-picker.ts`
sets `exif: false` on the `ImagePicker` options — EXIF (including GPS) is never read from
the source image at ingestion, so it cannot leak into any downstream export by
construction. Repo-wide search found no other EXIF-related code path (no EXIF is ever
written back into an export either).

**Section 24 — Native Error Logging (PASSED).** Sampled every `console.error`/logger call
site: `composition-error-boundary.tsx` and `[creationId].tsx` log only
`{ component, errorName }`; the API's `ApiExceptionFilter` sends `exception.safeMessage`
(a deliberately separate safe/unsafe message split on `DomainError`) for all known domain
errors and only falls through to a generic `err`-serialized log for truly unclassified
500s; `media-upload-recovery.bootstrap.ts` logs only `error.name`. No patient image bytes,
base64, storage keys, or full document payloads found logged anywhere.

## 3. Sections 9, 16, 17, 18 — code/config half already proven by existing tests

These sections have both a runtime-device half (external) and a code/config half. The
code/config half is already covered by the 81/81-passing mobile Jest suite re-run fresh
this session:
- **Gesture → coalesced autosave (Section 9):** `phase4c-editor-autosave.test.ts` —
  "marks a gesture-end edit dirty and saves only through the scheduled checkpoint";
  "never lets an older save response mark a newer local edit clean and coalesces the
  latest document."
- **Bounded network retry (Section 16):** `phase3c-media-upload-orchestrator.test.ts` —
  exactly-once idempotent retry, finite central retry budget, no duplicate content/session
  on lost success response, bounded status-recovery polling instead of resend.
- **Identity isolation wiring (Section 17):** `createSessionInvalidator` in
  `auth-provider.tsx` clears `queryClient`, `clearCompositionExportCache()`,
  `clearPrivatePreviewCache()`, and `clearPrivateExportSourceCache()` together on every
  logout/session-invalidation path; covered by `phase4-closure-auth-cache-invalidation.test.ts`.
- **Bounded disk cache (Section 18):** `protected-preview-cache.ts`
  (`MAX_PREVIEWS_PER_ACCOUNT = 12`, oldest-first eviction) and `composition-export.ts`
  (`MAX_EXPORTS = 6`, same pattern) — both deterministic, bounded, already exercised by
  existing tests.

## 4. Section 11 — permission discipline (static audit, PASSED)

`apps/mobile/app.json`: `expo-media-library` plugin configured with
`"granularPermissions": ["photo"]` (photo-only, not video/audio) and
`savePhotosPermission` (add-only, not broad library read). `expo-image-picker` plugin
explicitly sets `"microphonePermission": false`. `saveCompositionToLibrary()` in
`composition-export.ts` calls `MediaLibrary.requestPermissionsAsync(true, ['photo'])`
(write-only, photo-scoped) and throws a clear, UI-surfaced error on denial rather than
silently claiming success. No broader permission is requested anywhere. Runtime
grant/deny/limited-state UX (actual OS prompts) remains an external-device gate — see
checklist items A17/A18, C26.

## Report (per Stage 2 Section 29 required items)

1. **Available native toolchains:** None. OpenJDK 21 only (insufficient alone). No
   Android SDK/Gradle/adb/emulator; no macOS/Xcode/CocoaPods/iOS simulator; no Docker.
   Android SDK repository network access also blocked (`403`), so provisioning was not
   possible either.
2. **Android native build result:** `UNAVAILABLE — EXTERNAL ANDROID BUILD GATE REQUIRED`.
3. **Android runtime/device result:** `UNAVAILABLE — EXTERNAL ANDROID BUILD GATE REQUIRED`.
4. **iOS native build result:** `UNAVAILABLE — EXTERNAL XCODE/IPHONE GATE REQUIRED`.
5. **iOS runtime/device result:** `UNAVAILABLE — EXTERNAL XCODE/IPHONE GATE REQUIRED`.
6. **Memory stress result:** `UNAVAILABLE — EXTERNAL DEVICE GATE REQUIRED` (no device to
   measure on). External checklist items A29–A31/C28 cover this.
7. **UI blocking/profile result:** `UNAVAILABLE — EXTERNAL DEVICE GATE REQUIRED`.
8. **Gesture performance result:** on-device latency `UNAVAILABLE — EXTERNAL DEVICE GATE
   REQUIRED`; coalesced-autosave code/config correctness `PASSED` (§3 above).
9. **High-resolution export result:** on-device dimension read-back
   `UNAVAILABLE — EXTERNAL DEVICE GATE REQUIRED`; preset math itself `PASSED` via existing
   composition/export tests (unchanged from Stage 1, re-run clean this session).
10. **Gallery save result:** runtime grant/deny `UNAVAILABLE — EXTERNAL DEVICE GATE
    REQUIRED`; permission-request discipline `PASSED` (§4 above).
11. **Share sheet result:** runtime `UNAVAILABLE — EXTERNAL DEVICE GATE REQUIRED`;
    `Sharing.isAvailableAsync()` guard confirmed present in code.
12. **HEIC/HEIF result:** `UNAVAILABLE — EXTERNAL XCODE/IPHONE GATE REQUIRED` (requires a
    real iPhone-originated HEIC file and iOS runtime).
13. **Lifecycle/recovery result:** `UNAVAILABLE — EXTERNAL DEVICE GATE REQUIRED` for both
    platforms.
14. **Identity/cache isolation result:** on-filesystem device inspection
    `UNAVAILABLE — EXTERNAL DEVICE GATE REQUIRED`; cache-clearing wiring `PASSED` (§3
    above).
15. **Metadata/privacy result:** `PASSED` (§2, Section 23 above — structural, not
    device-dependent).
16. **Commands actually executed** (this session, in addition to the CI-fix reproduction
    in §1):
    ```bash
    java -version; echo $ANDROID_HOME $ANDROID_SDK_ROOT
    which adb emulator sdkmanager gradle xcodebuild xcrun pod docker
    curl -s -o /dev/null -w "%{http_code}" https://binaries.prisma.sh/
    curl -s -o /dev/null -w "%{http_code}" https://dl.google.com/android/repository/repository2-3.xml
    pnpm --filter @dentpilot/domain typecheck && pnpm --filter @dentpilot/domain test
    pnpm --filter @dentpilot/contracts typecheck && pnpm --filter @dentpilot/contracts test
    pnpm --filter @dentpilot/application typecheck && pnpm --filter @dentpilot/application test
    pnpm --filter @dentpilot/mobile lint
    pnpm --filter @dentpilot/mobile typecheck
    pnpm --filter @dentpilot/mobile test
    pnpm --filter @dentpilot/api run lint   # unchanged 565 Prisma-cascade errors, re-confirmed not a regression
    EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000/api/v1 pnpm exec expo export --platform android --output-dir /tmp/s2-android
    EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000/api/v1 pnpm exec expo export --platform ios --output-dir /tmp/s2-ios
    EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3000/api/v1 pnpm exec expo export --platform web --output-dir /tmp/s2-web
    pnpm exec expo config --type public --json   # scheme/plugin/intent-filter/bundle-id assertions, all pass
    ```
    Results: domain 9/9, contracts 17/17, application 19/19, mobile 19 suites/81 tests —
    all passed, identical to Stage 1 with zero regressions. All three Expo exports
    succeeded; all config assertions passed.
17. **Prisma drift result:** Not obtainable in this sandbox — `prisma migrate diff`
    itself cannot run without the blocked `binaries.prisma.sh` schema-engine binary,
    unchanged from Stage 1. No drift claim is made either way. Migration count remains 13;
    Stage 2 introduced no schema or migration change.
18. **Remaining external gate:** The entirety of
    `docs/phase-4-external-device-acceptance-checklist.md` — real Android device/emulator
    and real iPhone device/simulator runtime validation, to be executed by a human tester
    on hardware/toolchains this sandbox does not have and cannot provision.

## Final Phase 4 status (Stage 2 Section 27 vocabulary — only legitimate outcome that applies)

```text
PHASE 4 CODE COMPLETE — EXTERNAL ANDROID/iOS DEVICE GATE REMAINS
```

No real native/code defect was found in this session beyond the CI ordering issue, which
is now fixed and verified. Every gate genuinely executable without native
toolchains/devices was executed and passed, including the newly-added static Sections
21–24 audits. Phase 5 has not been started.

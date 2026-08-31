# Phase 4 Closure — Stage 2 External Device Acceptance Checklist

Required by Stage 2 Section 26: this sandbox has no Android SDK/emulator/device and no
macOS/Xcode/iPhone/simulator (confirmed in `docs/phase-4-native-validation-matrix.md`), so
full runtime validation could not be performed internally. This checklist is executable by
a human tester on real hardware/toolchains. Fill in the Result column for every row; do not
mark PASS without actually performing the step.

## 0. Setup

```bash
pnpm install --frozen-lockfile
pnpm --filter @dentpilot/domain build && pnpm --filter @dentpilot/contracts build && pnpm --filter @dentpilot/application build
pnpm --filter @dentpilot/api exec prisma generate
pnpm --filter @dentpilot/api dev            # against a real PostgreSQL ($DATABASE_URL)
cd apps/mobile && npx expo run:android      # or: npx expo run:ios
```

Register two test accounts (Account A, Account B) before starting. Use realistic
high-resolution dental-style photos (not tiny fixtures) at these dimensions somewhere in
the set: 3024×4032, 4032×3024, 4000×6000, 6000×4000.

---

## A. Android — physical device

| # | Step | Expected | Result (PASS/FAIL) | Notes |
|---|---|---|---|---|
| A1 | Install & launch on a physical Android device (not just emulator) | App launches without crash | | |
| A2 | Register/login as Account A | Success, lands on cases list | | |
| A3 | Create a case, upload high-res Before photo | Upload completes, preview renders | | |
| A4 | Upload high-res After photo | Upload completes | | |
| A5 | Create `before_after_image` creation, choose a template | Editor opens with composition rendered | | |
| A6 | Edit title/labels | Text updates live in preview | | |
| A7 | Pan the Before slot | Smooth, no dropped frames perceptible | | |
| A8 | Pinch-zoom the Before slot | Smooth, responsive | | |
| A9 | Reset the slot transform | Returns to default instantly | | |
| A10 | Switch template mid-edit | Composition re-renders correctly, no crash | | |
| A11 | Change theme (if template allows) | Applies immediately | | |
| A12 | Wait for autosave after a gesture | Editor shows saved state; no visible snap-back to stale server state | | |
| A13 | Tap "Save version" | New immutable revision created | | |
| A14 | Edit again after saving | New dirty state tracked correctly | | |
| A15 | Export | Encoded JPEG produced; open Export screen immediately after Save — confirm it shows the just-saved document, not a stale one | | |
| A16 | Check actual exported image dimensions (open the file outside the app, e.g. via a file manager) | Matches the selected aspect preset exactly (1080×1080 / 1080×1350 / 1080×1920 / 1920×1080) | | |
| A17 | Save exported image to gallery | Android permission prompt appears (add-only/limited scope, not broad); on grant, image appears in gallery | | |
| A18 | Deny the save permission (test on a fresh permission state or via Settings) | UI clearly shows failure, does not claim success | | |
| A19 | Share via the system share sheet | Share sheet opens with the file; complete a share to a real target (e.g. Files, Messages) | | |
| A20 | Cancel the share sheet instead | No crash, no false "shared" message | | |
| A21 | Logout | Editor/preview/export caches cleared (see A22) | | |
| A22 | Login as Account B on the same device | Account A's previews/exports are not visible or accessible anywhere in the app or its cache directories | | |
| A23 | Background the app mid-edit (home button), then foreground it | Dirty edit preserved, no duplicate save | | |
| A24 | Rotate the device if the app allows it | No crash, no lost state | | |
| A25 | Start an image-pick, background the app during the OS picker, then return | Picked image resolves via `ImagePicker.getPendingResultAsync()` path, no duplicate upload | | |
| A26 | Turn on airplane mode, then edit and wait for autosave | Save fails gracefully, retry state shown, no infinite retry loop, no duplicate revision | | |
| A27 | Turn airplane mode back on, retry the save | Recovers cleanly | | |
| A28 | Force a genuine 409 (edit the same creation from two logged-in sessions/devices) | Real conflict shown, local edit not silently discarded | | |
| A29 | Repeat A3–A16 for at least 3 different high-resolution source dimensions from the list above | No OOM, no crash, no unbounded memory growth across cycles (watch via `adb shell dumpsys meminfo <package>` before/after) | | |
| A30 | Open/close/reopen the same creation 10+ times in a row | Memory returns toward a stable range after each cycle; no monotonic growth | | |
| A31 | Check exported-file/temp-cache disk usage after ~15 exports across both test accounts | Old temp exports/previews evicted (bounded count), not accumulating indefinitely | | |
| A32 | VoiceOver/TalkBack pass over primary editor controls | Meaningful labels present, touch targets usable | | |

## B. Android — emulator (if a physical device is unavailable, run A1–A32 here too)

| # | Step | Result | Notes |
|---|---|---|---|
| B1 | Repeat the full Android table (A1–A32) on an emulator (e.g. Pixel 7 API 34) | | Emulator-only results must be reported as such, not conflated with physical-device validation |

## C. iPhone — physical device

| # | Step | Expected | Result | Notes |
|---|---|---|---|---|
| C1 | Install & launch on a physical iPhone | App launches without crash | | |
| C2–C21 | Repeat the equivalent of A2–A21 on iPhone | Same expectations, iOS UI conventions | | |
| C22 | Test with a native iPhone-camera HEIC/HEIF photo specifically (not a re-saved JPEG) | Either: (a) preview/edit/export path works correctly end-to-end, or (b) a controlled "unsupported format" message is shown — never a silently-transformed file misrepresented as the original | | |
| C23 | Check Dynamic Island / notch devices specifically | No overlap with editor controls; safe-area respected | | |
| C24 | Trigger the keyboard (editing a label) | View adjusts via padding behavior, no field hidden behind keyboard | | |
| C25 | Return from the system share sheet | App state intact, no dirty document silently discarded | | |
| C26 | Return from the Photos "Add" permission prompt (grant, then test again with deny) | UI accurately reflects grant/deny | | |
| C27 | Background/foreground during an in-progress export | No crash; export either completes or fails cleanly, never silently lost | | |
| C28 | Repeat the memory-stress cycle (A29–A31 equivalent) on iPhone | Same bounded-memory expectations | | |

## D. iOS simulator (if a physical iPhone is unavailable, run C1–C28 here too, noting simulator-only)

| # | Step | Result | Notes |
|---|---|---|---|
| D1 | Repeat the full iPhone table (C1–C28) on iOS Simulator | | Report explicitly as simulator-only — HEIC/HEIF (C22) and real Photos-permission UX (C26) are known to diverge from physical devices and should be re-verified on real hardware when available |

## E. Cross-cutting sign-off

| Check | Result | Notes |
|---|---|---|
| No crash or ANR observed in any step above | | |
| No false "success" for gallery save or share when it did not actually happen | | |
| No monotonic memory growth across repeated cycles (Android + iOS) | | |
| Actual exported pixel dimensions verified outside the app for at least one export per aspect ratio | | |
| Cross-account isolation (A22 / iPhone equivalent) confirmed by direct inspection, not assumption | | |

## Sign-off

```text
Tester name:
Device(s)/OS version(s):
Date:
Overall result: PASS / FAIL / PARTIAL (list which sections)
```

Attach this completed checklist (or its results) to the Phase 4 Stage 2 closure record.
Its outcome determines whether Phase 4 can move from
`PHASE 4 CODE COMPLETE — EXTERNAL ANDROID/iOS DEVICE GATE REMAINS` to
`PHASE 4 VERIFIED — READY FOR PHASE 5`, or whether it instead surfaces a genuine native
blocker requiring `PHASE 4 NOT VERIFIED — NATIVE BLOCKER FOUND`.

# DentPilot — Phase 4B Checklist

## Baseline confirmed before implementation

| Item | Confirmed state |
|---|---|
| Phase boundary | Phase 4A aggregate CAS closure is the accepted baseline. This work implements **Phase 4B only**. |
| `CreationDocument v1` | Strict, versioned document with `templateRef` already present as nullable `{ templateId, templateVersion }`. It can express the required template identity without a document schema migration. |
| Creation ownership and binding contract | Draft and binding mutations share `CreationDraft.revision`; bindings are owner/case scoped and revision provenance is immutable. |
| Expo SDK | `expo ~54.0.29`. |
| React Native | `react-native 0.81.5`. |
| React | `react 19.1.0`. |
| Existing gesture dependencies | No gesture/Reanimated/Worklets dependencies are installed in the mobile package. |
| Existing Phase 3 behavior | Authenticated private media, upload sessions, local/S3 storage, Smile Simulation and mobile upload flow remain out of scope for redesign. |

## Mandatory scope

- [ ] Define strict, code-only, versioned template catalog contracts.
- [ ] Implement six initial dental Before/After templates with immutable `id + version` identity.
- [ ] Validate full catalog structurally and semantically in tests.
- [ ] Implement pure, deterministic platform-neutral composition and image geometry engine.
- [ ] Add exhaustive geometry/compatibility/determinism tests.
- [ ] Add an Expo-compatible Skia renderer adapter for Android/iOS after compatibility resolution.
- [ ] Add an authenticated, bounded, identity-scoped temporary native preview-media cache boundary.
- [ ] Add the minimum mobile flow for opening a creation, selecting a built-in template, and previewing its composition; no gesture-heavy editor.
- [ ] Maintain a safe web fallback that does not white-screen.
- [ ] Prove exact template-version resolution for immutable revisions.
- [ ] Run Phase 4A and Phase 3 PostgreSQL/MinIO/HTTP regressions and all standard gates.

## Explicit exclusions

- [ ] No Phase 4C gesture-heavy editor, continuous persistence, or freeform layer editing.
- [ ] No remote template JSON, arbitrary SVG/HTML/JS/fonts, arbitrary layers, AI, real video, payments, team/clinic features, or framework upgrades.
- [ ] No change to Phase 3 media/auth/generation architecture.

## Native dependency decision

React Native Skia must be installed only through `expo install` after the catalog and pure engine foundation exists. Android is the primary native validation target; iOS configuration/export validation is required. Any unavailable Android NDK or iOS/macOS toolchain must be documented rather than concealed by replacing the native renderer architecture.

import type { RenderPlan } from '@dentpilot/application';

/** Web is intentionally preview-only; native offscreen composition export remains Android/iOS first. */
export function renderCompositionOffscreen(_plan: RenderPlan): Promise<Uint8Array> {
  return Promise.reject(new Error('Native composition export is unavailable on web.'));
}

import { evaluateVideoCompositionAtTime, resolveVideoTemplateDurationMs, resolveVideoTemplateForDocument, type VideoRenderPlanAtTime } from '@dentpilot/application';
import type { CreationRenderAsset, RenderTarget } from '@dentpilot/application';
import type { VideoCompositionDocument, VideoTemplateDefinition } from '@dentpilot/contracts';
import { useEffect, useMemo, useState } from 'react';

import { createVideoPreviewRuntime, type MonotonicClock, type VideoFrameScheduler, type VideoPreviewRuntime } from './video-preview-runtime';

class DefaultClock implements MonotonicClock {
  public nowMs(): number {
    return performance.now();
  }
}

class DefaultScheduler implements VideoFrameScheduler {
  public requestFrame(callback: () => void): number {
    return requestAnimationFrame(callback);
  }
  public cancelFrame(requestId: number): void {
    cancelAnimationFrame(requestId);
  }
}

export type UseVideoPreviewInput = {
  readonly document: VideoCompositionDocument | null;
  readonly template: VideoTemplateDefinition | null;
  readonly assets: readonly CreationRenderAsset[] | null;
  readonly target: RenderTarget | null;
};

export function useVideoPreview(input: UseVideoPreviewInput) {
  const [runtime, setRuntime] = useState<VideoPreviewRuntime | null>(null);
  const [plan, setPlan] = useState<VideoRenderPlanAtTime | null>(null);

  // Derive evaluated static dependencies. Any change recreates the runtime.
  const resolved = useMemo(() => {
    if (input.document === null || input.template === null || input.assets === null || input.target === null) return null;
    try {
      const template = resolveVideoTemplateForDocument({ document: input.document, template: input.template });
      const durationMs = resolveVideoTemplateDurationMs(template);
      return { document: input.document, template, assets: input.assets, target: input.target, durationMs };
    } catch {
      return null;
    }
  }, [input.document, input.template, input.assets, input.target]);

  useEffect(() => {
    if (resolved === null) {
      setRuntime(null);
      setPlan(null);
      return undefined;
    }

    const clock = new DefaultClock();
    const scheduler = new DefaultScheduler();
    const newRuntime = createVideoPreviewRuntime({
      durationMs: resolved.durationMs,
      clock,
      scheduler,
    });

    setRuntime(newRuntime);

    const unsubscribe = newRuntime.subscribe((state) => {
      try {
        const nextPlan = evaluateVideoCompositionAtTime({
          document: resolved.document,
          template: resolved.template,
          assets: resolved.assets,
          timeMs: state.playheadMs,
          target: resolved.target,
        });
        setPlan(nextPlan);
      } catch {
        setPlan(null);
      }
    });

    // Initial evaluation
    try {
      const initialPlan = evaluateVideoCompositionAtTime({
        document: resolved.document,
        template: resolved.template,
        assets: resolved.assets,
        timeMs: newRuntime.getState().playheadMs,
        target: resolved.target,
      });
      setPlan(initialPlan);
    } catch {
      setPlan(null);
    }

    return () => {
      unsubscribe();
      newRuntime.dispose();
    };
  }, [resolved]);

  return { runtime, plan };
}

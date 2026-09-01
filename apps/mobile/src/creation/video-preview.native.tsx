import React, { useEffect, useMemo, useState } from 'react';
import { View, Pressable, Text as RNText, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { Canvas, Group, Image as SkiaImage, Rect, RoundedRect, Text as SkiaText, useFont, useImage, Skia } from '@shopify/react-native-skia';
import { PlaybackClock, PlaybackMetrics, MonotonicClock, FrameScheduler, FrameHandle } from './video-playback-clock';
import { evaluateVideoCompositionAtTime, resolveVideoTemplateDurationMs } from '@dentpilot/application';
import type { NativeVideoPreviewProps } from './video-preview.types';
import type { VideoRenderPlanAtTime, VideoRenderCommand } from '@dentpilot/application';
import type { TemplateStyleToken, CreationBindingKey } from '@dentpilot/contracts';

type Palette = {
  readonly canvas: string;
  readonly surface: string;
  readonly ink: string;
  readonly muted: string;
  readonly accent: string;
  readonly accentSoft: string;
  readonly white: string;
};

const palettes: Record<TemplateStyleToken, Palette> = {
  'clinical-neutral': { canvas: '#F7F8F8', surface: '#EEF1F2', ink: '#172229', muted: '#61717A', accent: '#2F7681', accentSoft: '#B5D2D6', white: '#FFFFFF' },
  'clinical-blue': { canvas: '#F5F9FC', surface: '#E7F0F7', ink: '#132737', muted: '#5E7482', accent: '#1E7196', accentSoft: '#A9D2E5', white: '#FFFFFF' },
  'clinical-warm': { canvas: '#FBF8F3', surface: '#F2EDE3', ink: '#302821', muted: '#7A6B5E', accent: '#A46A42', accentSoft: '#E5C9B3', white: '#FFFFFF' },
};

function color(style: TemplateStyleToken, token: string): string {
  return palettes[style][token as keyof Palette] ?? palettes['clinical-neutral'].ink;
}

function NativeImageCommand({ command, uri }: { readonly command: Extract<VideoRenderCommand, { type: 'image' }>; readonly uri: string | null }): React.JSX.Element | null {
  const image = useImage(uri);
  if (image === null) return null;
  const clip = command.cornerRadius > 0
    ? Skia.RRectXY(Skia.XYWHRect(command.clip.x, command.clip.y, command.clip.width, command.clip.height), command.cornerRadius, command.cornerRadius)
    : Skia.XYWHRect(command.clip.x, command.clip.y, command.clip.width, command.clip.height);
  const center = { x: command.clip.x + command.clip.width / 2, y: command.clip.y + command.clip.height / 2 };
  const transform = [{ rotate: command.transform.rotationDegrees * Math.PI / 180 }];
  return (
    <Group clip={clip} origin={center} transform={transform} opacity={command.opacity}>
      <SkiaImage image={image} x={command.destination.x} y={command.destination.y} width={command.destination.width} height={command.destination.height} />
    </Group>
  );
}

function NativePlanCommand({ command, style, uri }: { readonly command: VideoRenderCommand; readonly style: TemplateStyleToken; readonly uri: string | null }): React.JSX.Element | null {
  const font = useFont(null, command.type === 'text' ? command.fontSize : 12);
  switch (command.type) {
    case 'background':
      return <Rect x={0} y={0} width={Number.MAX_SAFE_INTEGER} height={Number.MAX_SAFE_INTEGER} color={color(style, command.colorToken)} opacity={command.opacity} />;
    case 'image':
      return <NativeImageCommand command={command} uri={uri} />;
    case 'shape':
      return command.cornerRadius > 0
        ? <RoundedRect rect={Skia.RRectXY(Skia.XYWHRect(command.rect.x, command.rect.y, command.rect.width, command.rect.height), command.cornerRadius, command.cornerRadius)} color={color(style, command.fillToken)} opacity={command.opacity} />
        : <Rect x={command.rect.x} y={command.rect.y} width={command.rect.width} height={command.rect.height} color={color(style, command.fillToken)} opacity={command.opacity} />;
    case 'divider':
      return null;
    case 'text': {
      if (font === null) return null;
      const measured = font.measureText(command.text).width;
      const x = command.align === 'center' ? command.rect.x + (command.rect.width - measured) / 2 : command.align === 'right' ? command.rect.x + command.rect.width - measured : command.rect.x;
      return <SkiaText x={x} y={command.rect.y + command.fontSize} text={command.text} font={font} color={color(style, command.colorToken)} opacity={command.opacity} />;
    }
  }
}

class RNFrameScheduler implements FrameScheduler {
  request(callback: (nowMs: number) => void): FrameHandle {
    const id = requestAnimationFrame(callback);
    return { id };
  }
  cancel(handle: FrameHandle): void {
    cancelAnimationFrame(handle.id as number);
  }
}

class RNMonotonicClock implements MonotonicClock {
  nowMs(): number {
    return performance.now();
  }
}

type FrameState = {
  readonly metrics: PlaybackMetrics;
  readonly plan: VideoRenderPlanAtTime | null;
};

export function NativeVideoPreview({ document, template, assets, width, height }: NativeVideoPreviewProps): React.JSX.Element {
  const [frame, setFrame] = useState<FrameState | null>(null);

  const assetUris = useMemo(() => {
    const map = new Map<CreationBindingKey, string>();
    for (const a of assets) map.set(a.bindingKey, a.source);
    return map;
  }, [assets]);

  const clock = useMemo(() => {
    const rClock = new RNMonotonicClock();
    const rScheduler = new RNFrameScheduler();
    
    return new PlaybackClock(rClock, rScheduler, (metrics) => {
      let plan: VideoRenderPlanAtTime | null = null;
      if (metrics.state !== 'IDLE' && metrics.state !== 'LOADING' && metrics.state !== 'ERROR') {
        try {
          plan = evaluateVideoCompositionAtTime({
            document,
            template,
            assets,
            timeMs: metrics.playheadMs,
            target: { width, height }
          });
        } catch (e) {
          // F9: Transition controller to explicit ERROR state
          // The clock will notify again with ERROR state.
          // Since we are inside the callback, we must delay the fail call slightly or return.
          setTimeout(() => clock.fail(e instanceof Error ? e : new Error(String(e))), 0);
          return;
        }
      }
      // F10: One unified state update per tick
      setFrame({ metrics, plan });
    });
  }, [document, template, assets, width, height]);

  const durationMs = useMemo(() => resolveVideoTemplateDurationMs(template), [template]);

  useEffect(() => {
    clock.teardown();
    clock.load(durationMs);
    clock.ready();
    return () => {
      clock.teardown();
    };
  }, [clock, durationMs]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState !== 'active') {
        clock.pause();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [clock]);

  if (!frame) {
    return <View style={[{ width, height, backgroundColor: '#000' }]} />;
  }

  const { metrics, plan } = frame;

  const togglePlayback = () => {
    if (metrics.state === 'READY' || metrics.state === 'PAUSED') {
      clock.play();
    } else if (metrics.state === 'PLAYING') {
      clock.pause();
    } else if (metrics.state === 'ENDED') {
      clock.replay();
    }
  };

  const handleSeek = (e: any) => {
    if (!metrics.durationMs) return;
    const { locationX } = e.nativeEvent;
    const progress = Math.max(0, Math.min(1, locationX / width));
    clock.seek(progress * metrics.durationMs);
  };

  const scale = plan ? Math.min(width / plan.canvas.width, height / plan.canvas.height) : 1;
  const originX = plan ? (width - plan.canvas.width * scale) / 2 : 0;
  const originY = plan ? (height - plan.canvas.height * scale) / 2 : 0;

  return (
    <View style={[styles.container, { width, height }]}>
      {plan && (
        <Canvas style={{ width, height }}>
          <Group transform={[{ translateX: originX }, { translateY: originY }, { scale }]}>
            {plan.commands.map((cmd, i) => (
              <NativePlanCommand 
                key={`${cmd.id}-${i}`} 
                command={cmd} 
                style={plan.styleToken} 
                uri={cmd.type === 'image' ? assetUris.get(cmd.bindingKey) ?? null : null} 
              />
            ))}
          </Group>
        </Canvas>
      )}
      
      {metrics.state === 'ERROR' && (
        <View style={styles.errorOverlay}>
          <RNText style={styles.errorText}>Preview Failed: {metrics.error?.message}</RNText>
        </View>
      )}

      <View style={styles.overlay}>
        {/* F8: Bounded native seek/scrub UI */}
        <Pressable style={styles.scrubberContainer} onPress={handleSeek}>
           <View style={styles.scrubberTrack} />
           <View style={[styles.scrubberFill, { width: `${(metrics.playheadMs / Math.max(1, metrics.durationMs)) * 100}%` }]} />
           <View style={[styles.scrubberThumb, { left: `${(metrics.playheadMs / Math.max(1, metrics.durationMs)) * 100}%` }]} />
        </Pressable>

        <View style={styles.controls}>
          <Pressable onPress={togglePlayback} style={styles.button}>
            <RNText style={styles.buttonText}>
              {metrics.state === 'PLAYING' ? 'Pause' : metrics.state === 'ENDED' ? 'Replay' : 'Play'}
            </RNText>
          </Pressable>
          <RNText style={styles.timeText}>
            {Math.round(metrics.playheadMs)}ms / {metrics.durationMs}ms
          </RNText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#000', overflow: 'hidden' },
  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: 'rgba(0,0,0,0.5)', gap: 16 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  button: { backgroundColor: '#2F7681', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  buttonText: { color: '#FFF', fontWeight: 'bold' },
  timeText: { color: '#FFF', fontVariant: ['tabular-nums'] },
  errorOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)' },
  errorText: { color: 'red', fontWeight: 'bold' },
  scrubberContainer: { height: 24, justifyContent: 'center' },
  scrubberTrack: { height: 4, backgroundColor: '#5E7482', borderRadius: 2 },
  scrubberFill: { position: 'absolute', height: 4, backgroundColor: '#B5D2D6', borderRadius: 2 },
  scrubberThumb: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFF', marginLeft: -6 }
});

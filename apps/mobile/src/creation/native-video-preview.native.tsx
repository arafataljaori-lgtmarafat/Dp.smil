/* eslint-disable */
import type { RenderCommand } from '@dentpilot/application';
import type { CreationBindingKey, TemplateStyleToken, VideoCompositionDocument, VideoTemplateDefinition } from '@dentpilot/contracts';
import { Canvas, Group, Image, Line, Rect, RoundedRect, Skia, Text, useFont, useImage } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useState } from 'react';
import { PanResponder, Pressable, View, Text as RNText } from 'react-native';

import { useVideoPreview } from './use-video-preview';
import type { CreationRenderAsset } from '@dentpilot/application';

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

function color(style: TemplateStyleToken, token: string, opacity: number): string {
  const hex = palettes[style][token as keyof Palette] ?? palettes['clinical-neutral'].ink;
  const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
  return `${hex}${alpha}`;
}

type VideoCommand = RenderCommand & { readonly opacity: number };

function ImageCommand({ command }: { readonly command: Extract<VideoCommand, { type: 'image' }> }): React.JSX.Element | null {
  const image = useImage(command.source);
  if (image === null) return null;
  const clip = command.cornerRadius > 0
    ? Skia.RRectXY(Skia.XYWHRect(command.clip.x, command.clip.y, command.clip.width, command.clip.height), command.cornerRadius, command.cornerRadius)
    : Skia.XYWHRect(command.clip.x, command.clip.y, command.clip.width, command.clip.height);
  const center = { x: command.clip.x + command.clip.width / 2, y: command.clip.y + command.clip.height / 2 };
  const transform = [{ rotate: command.transform.rotationDegrees * Math.PI / 180 }];
  
  return (
    <Group clip={clip} origin={center} transform={transform} opacity={command.opacity}>
      <Image image={image} x={command.destination.x} y={command.destination.y} width={command.destination.width} height={command.destination.height} />
    </Group>
  );
}

function PlanCommand({ command, style }: { readonly command: VideoCommand; readonly style: TemplateStyleToken }): React.JSX.Element | null {
  const font = useFont(null, command.type === 'text' ? command.fontSize : 12);
  switch (command.type) {
    case 'background':
      return <Rect x={0} y={0} width={Number.MAX_SAFE_INTEGER} height={Number.MAX_SAFE_INTEGER} color={color(style, command.colorToken, command.opacity)} />;
    case 'image':
      return <ImageCommand command={command} />;
    case 'shape':
      return command.cornerRadius > 0
        ? <RoundedRect rect={Skia.RRectXY(Skia.XYWHRect(command.rect.x, command.rect.y, command.rect.width, command.rect.height), command.cornerRadius, command.cornerRadius)} color={color(style, command.fillToken, command.opacity)} />
        : <Rect x={command.rect.x} y={command.rect.y} width={command.rect.width} height={command.rect.height} color={color(style, command.fillToken, command.opacity)} />;
    case 'divider':
      return <Line p1={command.start} p2={command.end} color={color(style, command.colorToken, command.opacity)} strokeWidth={command.width} />;
    case 'text': {
      if (font === null) return null;
      const measured = font.measureText(command.text).width;
      const x = command.align === 'center' ? command.rect.x + (command.rect.width - measured) / 2 : command.align === 'right' ? command.rect.x + command.rect.width - measured : command.rect.x;
      return <Text x={x} y={command.rect.y + command.fontSize} text={command.text} font={font} color={color(style, command.colorToken, command.opacity)} />;
    }
  }
}

export type NativeVideoPreviewProps = {
  readonly document: VideoCompositionDocument;
  readonly template: VideoTemplateDefinition;
  readonly assets: readonly CreationRenderAsset[];
  readonly width: number;
  readonly height: number;
  readonly accessibilityLabel?: string;
};

export const NativeVideoPreview = memo(function NativeVideoPreview({ document, template, assets, width, height, accessibilityLabel = 'Video composition preview' }: NativeVideoPreviewProps): React.JSX.Element {
  const target = useMemo(() => ({ width: 720, height: 960 }), []);
  
  const { plan, runtime } = useVideoPreview({ document, template, assets, target });

  const [state, setState] = useState(() => runtime?.getState() ?? { phase: 'paused', playheadMs: 0, durationMs: 1 });

  useEffect(() => {
    if (runtime === null) return;
    setState(runtime.getState());
    return runtime.subscribe(setState);
  }, [runtime]);

  const progress = state.durationMs > 0 ? state.playheadMs / state.durationMs : 0;
  const [trackWidth, setTrackWidth] = useState(1);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      if (!runtime) return;
      runtime.beginScrub();
      runtime.seek(Math.max(0, Math.min(1, evt.nativeEvent.locationX / trackWidth)) * runtime.getState().durationMs);
    },
    onPanResponderMove: (evt) => {
      if (!runtime) return;
      runtime.seek(Math.max(0, Math.min(1, evt.nativeEvent.locationX / trackWidth)) * runtime.getState().durationMs);
    },
    onPanResponderRelease: () => {
      if (!runtime) return;
      runtime.endScrub({ resume: true });
    },
    onPanResponderTerminate: () => {
      if (!runtime) return;
      runtime.endScrub({ resume: true });
    },
  }), [runtime, trackWidth]);

  if (plan === null || runtime === null) {
    return <View accessibilityLabel={accessibilityLabel} style={{ width, height, backgroundColor: '#F2F4F5' }} />;
  }

  const scale = Math.min(width / plan.canvas.width, height / plan.canvas.height);
  const originX = (width - plan.canvas.width * scale) / 2;
  const originY = (height - plan.canvas.height * scale) / 2;

  return (
    <View style={{ width, height, position: 'relative' }}>
      <Canvas accessibilityLabel={accessibilityLabel} style={{ width, height }}>
        <Group transform={[{ translateX: originX }, { translateY: originY }, { scale }]}>
          {plan.commands.map((command) => <PlanCommand key={command.id} command={command} style={plan.styleToken} />)}
        </Group>
      </Canvas>
      <View style={{ position: 'absolute', bottom: 16, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
        <Pressable onPress={() => {
          if (state.phase === 'completed') runtime.replay();
          else if (state.phase === 'playing') runtime.pause();
          else runtime.play();
        }} style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }} accessibilityRole="button" accessibilityLabel={state.phase === 'playing' ? 'Pause' : 'Play'}>
          <RNText style={{ color: '#FFF', fontWeight: 'bold', fontSize: 16 }}>{state.phase === 'completed' ? '↺' : state.phase === 'playing' ? '⏸' : '▶'}</RNText>
        </Pressable>
        <View 
          style={{ flex: 1, height: 44, justifyContent: 'center', marginHorizontal: 8 }} 
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          {...panResponder.panHandlers}
        >
          <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 2, overflow: 'hidden' }}>
            <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: '#FFF' }} />
          </View>
        </View>
      </View>
    </View>
  );
});

import type { RenderCommand } from '@dentpilot/application';
import type { CreationBindingKey, TemplateStyleToken } from '@dentpilot/contracts';
import { Canvas, Group, Image, Line, Rect, RoundedRect, Skia, Text, useFont, useImage } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useDerivedValue, useSharedValue } from 'react-native-reanimated';

import type { EditorGestureCommit, NativeCompositionPreviewProps } from './native-composition-preview.types';

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

type LiveTransform = {
  readonly bindingKey: CreationBindingKey | null;
  readonly panX: ReturnType<typeof useSharedValue<number>>;
  readonly panY: ReturnType<typeof useSharedValue<number>>;
  readonly scale: ReturnType<typeof useSharedValue<number>>;
  readonly rotation: ReturnType<typeof useSharedValue<number>>;
};

function ImageCommand({ command, live }: { readonly command: Extract<RenderCommand, { type: 'image' }>; readonly live: LiveTransform }): React.JSX.Element | null {
  const image = useImage(command.source);
  if (image === null) return null;
  const clip = command.cornerRadius > 0
    ? Skia.RRectXY(Skia.XYWHRect(command.clip.x, command.clip.y, command.clip.width, command.clip.height), command.cornerRadius, command.cornerRadius)
    : Skia.XYWHRect(command.clip.x, command.clip.y, command.clip.width, command.clip.height);
  const center = { x: command.clip.x + command.clip.width / 2, y: command.clip.y + command.clip.height / 2 };
  const selected = live.bindingKey === command.bindingKey;
  const transform = useDerivedValue(() => selected
    ? [{ translateX: live.panX.value }, { translateY: live.panY.value }, { rotate: live.rotation.value }, { scale: live.scale.value }, { rotate: command.transform.rotationDegrees * Math.PI / 180 }]
    : [{ rotate: command.transform.rotationDegrees * Math.PI / 180 }]);
  return (
    <Group clip={clip} origin={center} transform={transform}>
      <Image image={image} x={command.destination.x} y={command.destination.y} width={command.destination.width} height={command.destination.height} />
    </Group>
  );
}

function PlanCommand({ command, style, live }: { readonly command: RenderCommand; readonly style: TemplateStyleToken; readonly live: LiveTransform }): React.JSX.Element | null {
  // The component is keyed by deterministic command id, so useFont caches each command's resolved
  // size across preview renders rather than forcing a canvas-wide fallback typography size.
  const font = useFont(null, command.type === 'text' ? command.fontSize : 12);
  switch (command.type) {
    case 'background':
      return <Rect x={0} y={0} width={Number.MAX_SAFE_INTEGER} height={Number.MAX_SAFE_INTEGER} color={color(style, command.colorToken)} />;
    case 'image':
      return <ImageCommand command={command} live={live} />;
    case 'shape':
      return command.cornerRadius > 0
        ? <RoundedRect rect={Skia.RRectXY(Skia.XYWHRect(command.rect.x, command.rect.y, command.rect.width, command.rect.height), command.cornerRadius, command.cornerRadius)} color={color(style, command.fillToken)} />
        : <Rect x={command.rect.x} y={command.rect.y} width={command.rect.width} height={command.rect.height} color={color(style, command.fillToken)} />;
    case 'divider':
      return <Line p1={command.start} p2={command.end} color={color(style, command.colorToken)} strokeWidth={command.width} />;
    case 'text': {
      if (font === null) return null;
      const measured = font.measureText(command.text).width;
      const x = command.align === 'center' ? command.rect.x + (command.rect.width - measured) / 2 : command.align === 'right' ? command.rect.x + command.rect.width - measured : command.rect.x;
      return <Text x={x} y={command.rect.y + command.fontSize} text={command.text} font={font} color={color(style, command.colorToken)} />;
    }
  }
}

function selectionOverlay(plan: NativeCompositionPreviewProps['plan'], selectedBindingKey: CreationBindingKey | null): React.JSX.Element | null {
  if (selectedBindingKey === null) return null;
  const selected = plan.commands.find((command): command is Extract<RenderCommand, { type: 'image' }> => command.type === 'image' && command.bindingKey === selectedBindingKey);
  if (selected === undefined) return null;
  return <RoundedRect rect={Skia.RRectXY(Skia.XYWHRect(selected.clip.x, selected.clip.y, selected.clip.width, selected.clip.height), selected.cornerRadius, selected.cornerRadius)} color="#2F7681" style="stroke" strokeWidth={3} />;
}

/** Android/iOS Skia adapter. It renders an already-resolved RenderPlan and keeps high-frequency gesture values on the UI thread. */
export const NativeCompositionPreview = memo(function NativeCompositionPreview({ plan, width, height, accessibilityLabel = 'Dental before and after composition preview', editor }: NativeCompositionPreviewProps): React.JSX.Element {
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const pinchScale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const selectedBindingKey = editor?.selectedBindingKey ?? null;
  useEffect(() => {
    panX.value = 0;
    panY.value = 0;
    pinchScale.value = 1;
    rotation.value = 0;
  }, [panX, panY, pinchScale, rotation, selectedBindingKey]);

  const scale = Math.min(width / plan.canvas.width, height / plan.canvas.height);
  const originX = (width - plan.canvas.width * scale) / 2;
  const originY = (height - plan.canvas.height * scale) / 2;
  const live = useMemo<LiveTransform>(() => ({ bindingKey: selectedBindingKey, panX, panY, scale: pinchScale, rotation }), [panX, panY, pinchScale, rotation, selectedBindingKey]);

  const hitTest = (x: number, y: number): void => {
    if (editor === undefined) return;
    const logicalX = (x - originX) / scale;
    const logicalY = (y - originY) / scale;
    const target = plan.commands.slice().reverse().find((command): command is Extract<RenderCommand, { type: 'image' }> => command.type === 'image' && logicalX >= command.clip.x && logicalX <= command.clip.x + command.clip.width && logicalY >= command.clip.y && logicalY <= command.clip.y + command.clip.height);
    if (target !== undefined) editor.onSelectSlot(target.bindingKey);
  };
  const commit = (input: EditorGestureCommit): void => {
    if (editor !== undefined) editor.onGestureCommit(input);
  };
  const reset = (): void => {
    if (editor?.selectedBindingKey !== null && editor?.selectedBindingKey !== undefined) editor.onResetSlot(editor.selectedBindingKey);
  };
  const finalize = (): void => {
    const key = selectedBindingKey;
    if (key !== null) {
      commit({ bindingKey: key, deltaX: panX.value, deltaY: panY.value, scaleFactor: pinchScale.value, rotationDeltaDegrees: rotation.value * 180 / Math.PI });
    }
    panX.value = 0;
    panY.value = 0;
    pinchScale.value = 1;
    rotation.value = 0;
  };

  const gestures = useMemo(() => {
    if (editor === undefined) return null;
    const pan = Gesture.Pan().minDistance(2).onUpdate((event) => { panX.value = event.translationX / scale; panY.value = event.translationY / scale; }).onEnd(() => runOnJS(finalize)());
    const pinch = Gesture.Pinch().onUpdate((event) => { pinchScale.value = event.scale; }).onEnd(() => runOnJS(finalize)());
    const rotate = Gesture.Rotation().onUpdate((event) => { rotation.value = event.rotation; }).onEnd(() => runOnJS(finalize)());
    const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(() => runOnJS(reset)());
    const singleTap = Gesture.Tap().maxDistance(12).onEnd((event) => runOnJS(hitTest)(event.x, event.y));
    return Gesture.Simultaneous(Gesture.Exclusive(doubleTap, singleTap), pan, pinch, rotate);
  }, [editor, finalize, hitTest, panX, panY, pinchScale, rotation, scale]);

  const canvas = (
    <Canvas accessibilityLabel={accessibilityLabel} style={{ width, height }}>
      <Group transform={[{ translateX: originX }, { translateY: originY }, { scale }]}>
        {plan.commands.map((command) => <PlanCommand key={command.id} command={command} style={plan.styleToken} live={live} />)}
        {selectionOverlay(plan, selectedBindingKey)}
      </Group>
    </Canvas>
  );
  return gestures === null ? canvas : <GestureDetector gesture={gestures}><View style={{ width, height }}>{canvas}</View></GestureDetector>;
});

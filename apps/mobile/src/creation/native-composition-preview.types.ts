import type { CreationBindingKey } from '@dentpilot/contracts';
import type { RenderPlan } from '@dentpilot/application';

export type EditorGestureCommit = {
  readonly bindingKey: CreationBindingKey;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly scaleFactor: number;
  readonly rotationDeltaDegrees: number;
};

export type NativeCompositionPreviewProps = {
  readonly plan: RenderPlan;
  readonly width: number;
  readonly height: number;
  readonly accessibilityLabel?: string;
  readonly editor?: {
    readonly selectedBindingKey: CreationBindingKey | null;
    readonly onSelectSlot: (bindingKey: CreationBindingKey) => void;
    readonly onGestureCommit: (input: EditorGestureCommit) => void;
    readonly onResetSlot: (bindingKey: CreationBindingKey) => void;
  };
};

import type { VideoCompositionDocument, VideoTemplateDefinition } from '@dentpilot/contracts';
import type { CreationRenderAsset } from '@dentpilot/application';

export type NativeVideoPreviewProps = {
  readonly document: VideoCompositionDocument;
  readonly template: VideoTemplateDefinition;
  readonly assets: readonly CreationRenderAsset[];
  readonly width: number;
  readonly height: number;
};
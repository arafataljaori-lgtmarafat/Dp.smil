import { createRenderPlanForDocument, type CreationRenderAsset } from '@dentpilot/application';
import type { CreationBindingDto, CreationDocument, MediaAssetDto } from '@dentpilot/contracts';

import { renderCompositionOffscreen } from './composition-offscreen-export';
import { acquirePrivateExportSource, isPrivateExportSourceCurrent, type PrivateExportSource } from './protected-export-source';

/**
 * Creates an encoded native composition from high-quality committed private media. Preview cache is
 * intentionally not imported by this module. All downloaded originals are owned only for this call
 * and released even where planning, decoding, drawing, or JPEG encoding fails.
 */
export async function renderAuthoritativeCompositionExport(input: {
  readonly accountId: string;
  readonly document: CreationDocument;
  readonly bindings: readonly CreationBindingDto[];
  readonly media: readonly MediaAssetDto[];
  readonly target: { readonly width: number; readonly height: number };
}): Promise<Uint8Array> {
  const mediaById = new Map(input.media.map((asset) => [asset.id, asset]));
  // Binding order is authoritative for composition, while ownership is one source per unique media ID.
  const uniqueMediaIds = [...new Set(input.bindings.map((binding) => binding.mediaId))];
  const acquired = new Map<string, PrivateExportSource>();
  try {
    const preparations = await Promise.allSettled(uniqueMediaIds.map(async (mediaId) => [mediaId, await acquirePrivateExportSource({ accountId: input.accountId, mediaId })] as const));
    for (const preparation of preparations) {
      if (preparation.status === 'fulfilled') acquired.set(preparation.value[0], preparation.value[1]);
    }
    const failure = preparations.find((preparation): preparation is PromiseRejectedResult => preparation.status === 'rejected');
    if (failure !== undefined) throw failure.reason;
    const generation = [...acquired.values()][0]?.generation;
    if (generation === undefined || !isPrivateExportSourceCurrent(generation)) throw new Error('The protected export was cancelled because the authenticated identity changed.');
    const assets = input.bindings.map((binding): CreationRenderAsset => {
      const media = mediaById.get(binding.mediaId);
      const source = acquired.get(binding.mediaId);
      if (media === undefined || source === undefined) throw new Error('A committed creation binding cannot be resolved for authoritative export.');
      return { bindingKey: binding.bindingKey, mediaId: media.id, width: media.width, height: media.height, source: source.uri };
    });
    const plan = createRenderPlanForDocument({ document: input.document, bindings: assets, target: input.target });
    const encoded = await renderCompositionOffscreen(plan);
    if (!isPrivateExportSourceCurrent(generation)) throw new Error('The protected export was cancelled because the authenticated identity changed.');
    return encoded;
  } finally {
    await Promise.all([...acquired.values()].map((source) => source.release()));
  }
}

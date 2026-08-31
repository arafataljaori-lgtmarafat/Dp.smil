import type { CreationBindingDto, CreationDocument, MediaAssetDto } from '@dentpilot/contracts';

/** Web remains preview-only; authoritative encoded export is a native Android/iOS operation. */
export function renderAuthoritativeCompositionExport(_input: {
  readonly accountId: string;
  readonly document: CreationDocument;
  readonly bindings: readonly CreationBindingDto[];
  readonly media: readonly MediaAssetDto[];
  readonly target: { readonly width: number; readonly height: number };
}): Promise<Uint8Array> {
  return Promise.reject(new Error('Native composition export is unavailable on web.'));
}

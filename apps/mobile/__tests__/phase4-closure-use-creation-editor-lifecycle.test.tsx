import type { CreationDocument } from '@dentpilot/contracts';
import { act, create } from 'react-test-renderer';

jest.mock('../src/api/client', () => ({
  dentPilotApi: { saveCreationDraft: jest.fn() },
  MobileApiError: class MobileApiError extends Error { code = ''; },
}));

import { dentPilotApi } from '../src/api/client';
import { useCreationEditor } from '../src/creation/use-creation-editor';

const base: CreationDocument = {
  schemaVersion: 1, templateRef: { templateId: 'premium-split', templateVersion: 1 }, canvas: { aspectRatioKey: 'portrait_4_5' },
  slotState: { before: { panX: 0, panY: 0, scale: 1, rotation: 0 }, after: { panX: 0, panY: 0, scale: 1, rotation: 0 } },
  editableTextState: { beforeLabel: 'Before', afterLabel: 'After' }, styleState: { theme: 'clinical-neutral' },
};
type Editor = ReturnType<typeof useCreationEditor>;

function Harness({ identityKey, onEditor, onState }: { readonly identityKey: string | null; readonly onEditor: (editor: Editor) => void; readonly onState: () => void }): React.JSX.Element {
  const editor = useCreationEditor({ creationId: '11111111-1111-4111-8111-111111111111', initialDocument: base, initialRevision: 2, identityKey, onSaved: onState });
  onEditor(editor);
  return <></>;
}

describe('Phase 4 Closure Stage 1 useCreationEditor lifecycle', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  it('mounts, schedules an edit, then unmounts without issuing a save', () => {
    const api = dentPilotApi as unknown as { saveCreationDraft: jest.Mock };
    let editor: Editor | null = null;
    let tree: ReturnType<typeof create>;
    act(() => { tree = create(<Harness identityKey="00000000-0000-4000-8000-000000000001" onEditor={(next) => { editor = next; }} onState={() => undefined} />); });
    act(() => editor!.edit({ ...base, editableTextState: { ...base.editableTextState, beforeLabel: 'changed' } }));
    act(() => tree!.unmount());
    act(() => jest.advanceTimersByTime(1000));
    expect(api.saveCreationDraft).not.toHaveBeenCalled();
  });

  it('ignores a late in-flight save response after unmount', async () => {
    const api = dentPilotApi as unknown as { saveCreationDraft: jest.Mock };
    let resolveSave!: (result: { revision: number; document: CreationDocument; updatedAt: string }) => void;
    api.saveCreationDraft.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    let editor: Editor | null = null;
    let tree: ReturnType<typeof create>;
    act(() => { tree = create(<Harness identityKey="00000000-0000-4000-8000-000000000001" onEditor={(next) => { editor = next; }} onState={() => undefined} />); });
    act(() => editor!.edit({ ...base, editableTextState: { ...base.editableTextState, beforeLabel: 'in flight' } }));
    await act(async () => { jest.advanceTimersByTime(1000); await Promise.resolve(); });
    expect(api.saveCreationDraft).toHaveBeenCalledTimes(1);
    act(() => tree!.unmount());
    await act(async () => { resolveSave({ revision: 3, document: base, updatedAt: '2026-08-28T00:00:03.000Z' }); await Promise.resolve(); });
    expect(editor!.persistence).toMatchObject({ phase: 'saving', serverRevision: 2 });
  });
});

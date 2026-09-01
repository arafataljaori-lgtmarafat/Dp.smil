import React, { useMemo } from 'react';
import { View, StyleSheet, Text as RNText } from 'react-native';
import { useVideoPreviewSession } from './use-video-preview-session';
import { NativeVideoPreview } from './video-preview.native';
import { requireBuiltInVideoTemplate } from '@dentpilot/application';
import type { CreationDetailsDto } from '@dentpilot/contracts';
import type { WorkspaceMediaMetadata } from './use-video-preview-session';

export type VideoCreationPreviewProps = {
  readonly accountId: string;
  readonly creation: CreationDetailsDto;
  readonly workspaceMedia: readonly WorkspaceMediaMetadata[];
  readonly width: number;
  readonly height: number;
};

export function VideoCreationPreview({ accountId, creation, workspaceMedia, width, height }: VideoCreationPreviewProps): React.JSX.Element {
  const { project, draft } = creation;
  const document = draft.document as any;

  const mediaGraph = useMemo(() => {
    const map: Record<string, any> = {};
    for (const media of workspaceMedia) {
      if (media.kind === 'source') {
        map[media.id] = {
          mediaId: media.id,
          originalWidth: media.width,
          originalHeight: media.height
        };
      }
    }
    return map;
  }, [workspaceMedia]);

  const templateRef = document.templateRef;
  const template = useMemo(() => {
    if (!templateRef) return null;
    return requireBuiltInVideoTemplate(templateRef.templateId, templateRef.templateVersion);
  }, [templateRef]);

  const identity = useMemo(() => ({
    projectId: project.id,
    revisionId: draft.revision === 0 ? 'draft' : draft.revision.toString(),
    templateId: templateRef?.templateId ?? '',
    templateVersion: templateRef?.templateVersion ?? 0,
  }), [project.id, draft.revision, templateRef]);

  if (!template) {
    return (
      <View style={[styles.container, { width, height }]}>
        <RNText style={styles.errorText}>No template selected or template not found.</RNText>
      </View>
    );
  }

  const session = useVideoPreviewSession(accountId, identity, document, template, mediaGraph);

  if (session.state === 'LOADING') {
    return (
      <View style={[styles.container, { width, height }]}>
        <RNText style={styles.loadingText}>Loading protected assets...</RNText>
      </View>
    );
  }

  if (session.state === 'ERROR') {
    return (
      <View style={[styles.container, { width, height }]}>
        <RNText style={styles.errorText}>Preview Failed: {session.error.message} ({session.classification})</RNText>
      </View>
    );
  }

  return (
    <NativeVideoPreview
      document={document}
      template={template}
      assets={session.assets}
      width={width}
      height={height}
    />
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  errorText: { color: 'red', fontWeight: 'bold' },
  loadingText: { color: '#FFF' },
});

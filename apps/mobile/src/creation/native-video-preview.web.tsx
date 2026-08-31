import { Text, View } from 'react-native';

import type { NativeVideoPreviewProps } from './native-video-preview.native';

export function NativeVideoPreview({ document, width, height, accessibilityLabel = 'Video composition preview unavailable on web' }: NativeVideoPreviewProps): React.JSX.Element {
  return (
    <View accessibilityLabel={accessibilityLabel} style={{ width, height, borderRadius: 12, backgroundColor: '#F2F4F5', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Text style={{ color: '#172229', fontWeight: '600', textAlign: 'center' }}>Native video preview</Text>
      <Text style={{ color: '#61717A', marginTop: 6, textAlign: 'center' }}>{document.templateRef.templateId} v{document.templateRef.templateVersion} video preview is available in the Android and iOS app.</Text>
    </View>
  );
}

import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { PrimaryButton, Screen, styles } from '../src/components/ui';

export default function HomeScreen(): React.JSX.Element {
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'space-between', paddingVertical: 28 }}>
        <View style={{ gap: 14 }}>
          <Text style={styles.label}>DENTPILOT SMILE STUDIO</Text>
          <Text style={styles.title}>A reliable foundation for visual case workflows.</Text>
          <Text style={styles.body}>
            Your personal account securely owns its cases, media, projects, and clearly labelled non-clinical mock generations.
          </Text>
        </View>
        <View style={{ gap: 10 }}>
          <PrimaryButton label="Open My Cases" onPress={() => router.push('/cases')} testID="open-cases" />
          <PrimaryButton label="Account" onPress={() => router.push('/account')} testID="open-account" />
        </View>
      </View>
    </Screen>
  );
}

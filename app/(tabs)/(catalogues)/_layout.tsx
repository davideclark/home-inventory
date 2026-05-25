import { Stack, router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import SyncButton from '../../../components/SyncButton';

export default function CataloguesLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Catalogues',
          headerLeft: () => <SyncButton />,
          headerRight: () => (
            <Pressable onPress={() => router.push('/catalogue/add')} style={{ marginRight: 16 }}>
              <Text style={{ fontSize: 28, color: '#007AFF', lineHeight: 32 }}>+</Text>
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="items/[catalogueId]" options={{ headerBackTitle: '' }} />
      <Stack.Screen name="catalogue-container/[itemId]" options={{ headerBackTitle: '' }} />
    </Stack>
  );
}

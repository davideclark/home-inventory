import { Tabs, router } from 'expo-router';
import { Pressable, Text } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Catalogues',
          headerRight: () => (
            <Pressable onPress={() => router.push('/catalogue/add')} style={{ marginRight: 16 }}>
              <Text style={{ fontSize: 28, color: '#007AFF', lineHeight: 32 }}>+</Text>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen name="containers" options={{ title: 'Containers' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
    </Tabs>
  );
}

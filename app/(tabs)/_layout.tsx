import { Tabs, router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import SyncButton from '../../components/SyncButton';

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen
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
      <Tabs.Screen name="containers" options={{ title: 'Browse', headerLeft: () => <SyncButton /> }} />
      <Tabs.Screen name="search"     options={{ title: 'Search',     headerLeft: () => <SyncButton /> }} />
      <Tabs.Screen name="settings"   options={{ title: 'Settings',   headerShown: true }} />
    </Tabs>
  );
}

import { Tabs } from 'expo-router';
import SyncButton from '../../components/SyncButton';

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="(catalogues)" options={{ title: 'Catalogues', headerShown: false }} />
      <Tabs.Screen name="(browse)"     options={{ title: 'Browse',     headerShown: false }} />
      <Tabs.Screen name="search"       options={{ title: 'Search',     headerLeft: () => <SyncButton /> }} />
      <Tabs.Screen name="settings"     options={{ title: 'Settings',   headerShown: true }} />
    </Tabs>
  );
}

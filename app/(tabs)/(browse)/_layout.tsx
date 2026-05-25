import { Stack } from 'expo-router';
import SyncButton from '../../../components/SyncButton';

export default function BrowseLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Browse',
          headerLeft: () => <SyncButton />,
        }}
      />
      <Stack.Screen name="container/[itemId]" options={{ headerBackTitle: '' }} />
    </Stack>
  );
}

import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable } from 'react-native';
import { Text } from './Text';
import { sync } from '../sync';

export default function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    setHasError(false);
    try {
      const { pushed, pulled } = await sync();
      Alert.alert('Synced', `↑ ${pushed} pushed  ↓ ${pulled} pulled`);
    } catch (e) {
      setHasError(true);
      Alert.alert('Sync failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  if (syncing) {
    return <ActivityIndicator style={{ marginLeft: 16 }} />;
  }

  return (
    <Pressable onPress={handleSync} hitSlop={12} style={{ marginLeft: 16 }}>
      <Text style={{ fontSize: 26, color: hasError ? '#ff3b30' : '#007AFF' }}>↻</Text>
    </Pressable>
  );
}

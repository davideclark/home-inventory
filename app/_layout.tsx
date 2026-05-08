import { Stack, router } from 'expo-router';
import { Text, View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useEffect } from 'react';
import migrations from '../drizzle/migrations';
import { db } from '../db';
import { sync, isServerConfigured } from '../sync';

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);

  useEffect(() => {
    if (!success) return;
    (async () => {
      const configured = await isServerConfigured();
      if (!configured) {
        router.replace('/setup');
        return;
      }
      sync().catch(() => {});
    })();
  }, [success]);

  if (error) {
    return (
      <View style={styles.centered}>
        <Text>Migration error: {error.message}</Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View style={styles.centered}>
        <Text>Loading…</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, headerBackTitle: '' }} />
        <Stack.Screen name="setup" options={{ headerShown: false }} />
        <Stack.Screen name="catalogue/add" options={{ title: 'Add Catalogue', presentation: 'modal' }} />
        <Stack.Screen name="catalogue/[id]" options={{ title: 'Edit Catalogue', presentation: 'modal' }} />
        <Stack.Screen name="new-item" options={{ title: 'Add Item', presentation: 'modal' }} />
        <Stack.Screen name="edit-item" options={{ title: 'Edit Item', presentation: 'modal' }} />
        <Stack.Screen name="item-detail" options={{ presentation: 'modal' }} />
        <Stack.Screen name="items/[catalogueId]" options={{ title: 'Items' }} />
        <Stack.Screen name="container/[itemId]" options={{ title: 'Container' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

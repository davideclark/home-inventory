import { Stack } from 'expo-router';
import { Text, View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from '../drizzle/migrations';
import { db } from '../db';

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);

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
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="catalogue/add" options={{ title: 'Add Catalogue', presentation: 'modal' }} />
        <Stack.Screen name="catalogue/[id]" options={{ title: 'Edit Catalogue', presentation: 'modal' }} />
        <Stack.Screen name="items/[catalogueId]" options={{ title: 'Items' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

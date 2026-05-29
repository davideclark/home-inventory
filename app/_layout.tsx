import { Stack, router } from 'expo-router';
import { Text, View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useEffect } from 'react';
import { useFonts, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import migrations from '../drizzle/migrations';
import { db } from '../db';
import { sync, checkStartupAuth } from '../sync';

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);
  const [fontsLoaded] = useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold });

  useEffect(() => {
    if (!success) return;
    checkStartupAuth().then(ok => {
      if (!ok) {
        router.replace('/login');
      } else {
        sync().catch(() => {});
      }
    });
  }, [success]);

  if (error) {
    return (
      <View style={styles.centered}>
        <Text>Migration error: {error.message}</Text>
      </View>
    );
  }

  if (!success || !fontsLoaded) {
    return (
      <View style={styles.centered}>
        <Text>Loading…</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <Stack>
        <Stack.Screen name="login" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false, headerBackTitle: '' }} />
        <Stack.Screen name="setup" options={{ headerShown: false }} />
        <Stack.Screen name="catalogue/add" options={{ title: 'Add Catalogue', presentation: 'modal' }} />
        <Stack.Screen name="catalogue/[id]" options={{ title: 'Edit Catalogue', presentation: 'modal' }} />
        <Stack.Screen name="new-item" options={{ title: 'Add Item', presentation: 'modal' }} />
        <Stack.Screen name="edit-item" options={{ title: 'Edit Item', presentation: 'modal' }} />
        <Stack.Screen name="item-detail" options={{ presentation: 'modal' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

import { View, Text, TextInput, StyleSheet, Pressable, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { settings } from '../schema';
import { clearApiConfigCache } from '../sync';

async function saveSetting(key: string, value: string) {
  await db.insert(settings).values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export default function SetupScreen() {
  const [url, setUrl] = useState('http://');
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);

  async function connect() {
    const trimmedUrl = url.trim().replace(/\/$/, '');
    if (!trimmedUrl || trimmedUrl === 'http://') {
      Alert.alert('Missing URL', 'Please enter the server address.');
      return;
    }
    setConnecting(true);
    try {
      // Check server is reachable
      const discoverRes = await fetch(`${trimmedUrl}/api/discover`);
      if (!discoverRes.ok) {
        Alert.alert('Connection failed', `Could not reach server (${discoverRes.status}). Check the URL.`);
        return;
      }
      const { requiresToken } = await discoverRes.json();

      // Validate token if server requires one
      if (requiresToken) {
        if (!token.trim()) {
          Alert.alert('Token required', 'This server requires an access token.');
          return;
        }
        const authRes = await fetch(`${trimmedUrl}/api/catalogues`, {
          headers: { 'X-API-Token': token.trim() },
        });
        if (authRes.status === 401) {
          Alert.alert('Wrong token', 'The token was rejected by the server.');
          return;
        }
      }

      await saveSetting('api_url', trimmedUrl);
      await saveSetting('api_token', token.trim());
      clearApiConfigCache();
      router.replace('/(tabs)');
    } catch {
      Alert.alert('Connection failed', 'Could not reach the server. Check the URL and that the server is running.');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Text style={styles.title}>Connect to Server</Text>
        <Text style={styles.subtitle}>Enter your server address and access token.</Text>

        <Text style={styles.label}>Server URL</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="http://100.x.x.x:3000"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <Text style={styles.label}>Access Token</Text>
        <TextInput
          style={styles.input}
          value={token}
          onChangeText={setToken}
          placeholder="Leave blank if no token set"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />

        <Pressable
          style={[styles.button, connecting && styles.buttonDisabled]}
          onPress={connect}
          disabled={connecting}
        >
          {connecting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Connect</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    padding: 32,
    justifyContent: 'center',
    backgroundColor: '#f2f2f7',
  },
  title: { fontSize: 26, fontWeight: '700', color: '#111', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 32 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111',
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});

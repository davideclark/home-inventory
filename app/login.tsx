import { useState, useEffect } from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { Text, TextInput } from '../components/Text';
import { router } from 'expo-router';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { settings } from '../schema';
import { storeAuthTokens, clearApiConfigCache } from '../sync';

async function getSetting(key: string): Promise<string> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return rows[0]?.value ?? '';
}

async function saveSetting(key: string, value: string): Promise<void> {
  await db.insert(settings).values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export default function LoginScreen() {
  const [url, setUrl]           = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    getSetting('api_url').then(v => { if (v) setUrl(v); });
  }, []);

  async function handleLogin() {
    setError('');
    const trimmedUrl = url.trim().replace(/\/$/, '');
    if (!trimmedUrl) { setError('Enter the server URL'); return; }
    if (!username.trim()) { setError('Enter your username'); return; }
    if (!password) { setError('Enter your password'); return; }

    setLoading(true);
    try {
      const res = await fetch(`${trimmedUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Login failed');
        return;
      }
      const { token, refreshToken, user } = data;
      await saveSetting('api_url', trimmedUrl);
      await storeAuthTokens(token, refreshToken, user.username);
      clearApiConfigCache();
      router.back();
    } catch {
      setError('Could not reach server. Check the URL.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={styles.title}>Home Inventory</Text>
      <Text style={styles.subtitle}>Sign in to enable sync</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Server URL</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={v => { setUrl(v); setError(''); }}
          placeholder="http://100.x.x.x:3000"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="next"
        />
        <View style={styles.divider} />
        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={v => { setUsername(v); setError(''); }}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          returnKeyType="next"
        />
        <View style={styles.divider} />
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={v => { setPassword(v); setError(''); }}
          secureTextEntry
          autoComplete="password"
          returnKeyType="go"
          onSubmitEditing={handleLogin}
        />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Sign In</Text>}
      </Pressable>

      <Pressable style={styles.cancelButton} onPress={() => router.back()} disabled={loading}>
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:    { flexGrow: 1, justifyContent: 'center', padding: 24 },
  title:        { fontSize: 28, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 6 },
  subtitle:     { fontSize: 16, color: '#888', textAlign: 'center', marginBottom: 32 },
  card:         { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 16 },
  label:        { fontSize: 13, color: '#888', marginTop: 12, marginBottom: 4 },
  input:        { fontSize: 16, color: '#111', paddingVertical: 8 },
  divider:      { height: StyleSheet.hairlineWidth, backgroundColor: '#e0e0e0' },
  errorText:    { color: '#ff3b30', fontSize: 14, marginBottom: 12, marginLeft: 4 },
  button:        { backgroundColor: '#007AFF', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  buttonDisabled:{ opacity: 0.6 },
  buttonText:    { color: '#fff', fontSize: 17, fontWeight: '600' },
  cancelButton:  { backgroundColor: '#f2f2f7', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  cancelText:    { color: '#333', fontSize: 17, fontWeight: '500' },
});

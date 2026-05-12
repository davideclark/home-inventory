import { View, StyleSheet, Pressable, ActivityIndicator, ScrollView, Keyboard } from 'react-native';
import { Text, TextInput } from '../../components/Text';
import { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { settings } from '../../schema';
import { clearApiConfigCache } from '../../sync';

type Status = 'idle' | 'testing' | 'ok' | 'error';

async function getSetting(key: string): Promise<string> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return rows[0]?.value ?? '';
}

async function saveSetting(key: string, value: string) {
  await db.insert(settings).values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export default function SettingsScreen() {
  const [url, setUrl]     = useState('');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      setUrl(await getSetting('api_url'));
      setToken(await getSetting('api_token'));
      setStatus('idle');
      setStatusMsg('');
    })();
  }, []));

  async function testAndSave() {
    Keyboard.dismiss();
    const trimmedUrl = url.trim().replace(/\/$/, '');
    setSaving(true);
    setStatus('testing');
    setStatusMsg('Connecting…');
    try {
      const discoverRes = await fetch(`${trimmedUrl}/api/discover`);
      if (!discoverRes.ok) {
        setStatus('error');
        setStatusMsg(`Server returned ${discoverRes.status}`);
        return;
      }
      const { name, requiresToken } = await discoverRes.json();

      if (requiresToken && token.trim()) {
        const authRes = await fetch(`${trimmedUrl}/api/catalogues`, {
          headers: { 'X-API-Token': token.trim() },
        });
        if (authRes.status === 401) {
          setStatus('error');
          setStatusMsg('Wrong token — server rejected it.');
          return;
        }
      }

      await saveSetting('api_url', trimmedUrl);
      await saveSetting('api_token', token.trim());
      clearApiConfigCache();
      setStatus('ok');
      setStatusMsg(`Connected to "${name}"`);
    } catch {
      setStatus('error');
      setStatusMsg('Could not reach server. Check the URL.');
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    await saveSetting('api_url', '');
    await saveSetting('api_token', '');
    clearApiConfigCache();
    setUrl('');
    setToken('');
    setStatus('idle');
    setStatusMsg('');
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionHeader}>SERVER</Text>
      <View style={styles.card}>
        <Text style={styles.label}>URL</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={(v) => { setUrl(v); setStatus('idle'); }}
          placeholder="http://100.x.x.x:3000"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <View style={styles.divider} />
        <Text style={styles.label}>Access Token</Text>
        <TextInput
          style={styles.input}
          value={token}
          onChangeText={(v) => { setToken(v); setStatus('idle'); }}
          placeholder="Leave blank if no token set"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
      </View>

      {statusMsg ? (
        <Text style={[styles.statusMsg, status === 'ok' ? styles.statusOk : status === 'error' ? styles.statusError : styles.statusTesting]}>
          {statusMsg}
        </Text>
      ) : null}

      <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={testAndSave} disabled={saving}>
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Test &amp; Save</Text>}
      </Pressable>

      {url ? (
        <Pressable style={styles.disconnectButton} onPress={disconnect}>
          <Text style={styles.disconnectText}>Disconnect</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 28 },
  sectionHeader: { fontSize: 13, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 12 },
  label: { fontSize: 13, color: '#888', marginTop: 12, marginBottom: 4 },
  input: { fontSize: 16, color: '#111', paddingVertical: 8 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#e0e0e0' },
  statusMsg: { fontSize: 14, marginBottom: 12, marginLeft: 4 },
  statusOk: { color: '#34c759' },
  statusError: { color: '#ff3b30' },
  statusTesting: { color: '#888' },
  button: { backgroundColor: '#007AFF', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  disconnectButton: { alignItems: 'center', paddingVertical: 12 },
  disconnectText: { color: '#ff3b30', fontSize: 16 },
});

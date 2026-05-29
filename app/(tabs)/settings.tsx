import { View, StyleSheet, Pressable, ActivityIndicator, ScrollView, Keyboard, Alert } from 'react-native';
import { Text, TextInput } from '../../components/Text';
import { useState, useCallback } from 'react';
import { useFocusEffect, router } from 'expo-router';
import Constants from 'expo-constants';
import { eq, isNotNull, and } from 'drizzle-orm';
import { db } from '../../db';
import { settings, item } from '../../schema';
import { clearApiConfigCache, clearAuthTokens, getLoggedInUsername, deleteContainer } from '../../sync';

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
  const [url, setUrl]         = useState('');
  const [username, setUsername] = useState('');
  const [status, setStatus]   = useState<Status>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [saving, setSaving]   = useState(false);
  const [cleaning, setCleaning] = useState(false);

  useFocusEffect(useCallback(() => {
    (async () => {
      setUrl(await getSetting('api_url'));
      setUsername((await getLoggedInUsername()) ?? '');
      setStatus('idle');
      setStatusMsg('');
    })();
  }, []));

  async function testConnection() {
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
      const { name } = await discoverRes.json();
      await saveSetting('api_url', trimmedUrl);
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

  async function signOut() {
    const refreshToken = await getSetting('refresh_token');
    const apiUrl = await getSetting('api_url');
    if (refreshToken && apiUrl) {
      fetch(`${apiUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
    await clearAuthTokens();
    clearApiConfigCache();
    router.replace('/login');
  }

  async function removeOrphanedContainers() {
    const allItems = await db.select({ id: item.id }).from(item);
    const allIds = new Set(allItems.map(r => r.id));

    const candidates = await db
      .select({ id: item.id, name: item.name, parentId: item.parentId })
      .from(item)
      .where(and(eq(item.canContain, true), isNotNull(item.parentId)));

    const orphans = candidates.filter(c => c.parentId && !allIds.has(c.parentId));

    if (orphans.length === 0) {
      Alert.alert('No orphans found', 'All containers have valid parents.');
      return;
    }

    Alert.alert(
      `Remove ${orphans.length} orphaned container${orphans.length === 1 ? '' : 's'}?`,
      orphans.map(o => o.name).join(', '),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setCleaning(true);
            try {
              for (const orphan of orphans) {
                await deleteContainer(orphan.id, { cascade: true });
              }
              Alert.alert('Done', `Removed ${orphans.length} orphaned container${orphans.length === 1 ? '' : 's'}.`);
            } finally {
              setCleaning(false);
            }
          },
        },
      ]
    );
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
      </View>

      {statusMsg ? (
        <Text style={[styles.statusMsg, status === 'ok' ? styles.statusOk : status === 'error' ? styles.statusError : styles.statusTesting]}>
          {statusMsg}
        </Text>
      ) : null}

      <Pressable style={[styles.button, saving && styles.buttonDisabled]} onPress={testConnection} disabled={saving}>
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Test Connection</Text>}
      </Pressable>

      <Text style={[styles.sectionHeader, styles.accountHeader]}>ACCOUNT</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.usernameText}>{username || '—'}</Text>
      </View>

      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>

      <Text style={[styles.sectionHeader, styles.maintenanceHeader]}>MAINTENANCE</Text>
      <Pressable
        style={[styles.maintenanceButton, cleaning && styles.buttonDisabled]}
        onPress={removeOrphanedContainers}
        disabled={cleaning}
      >
        {cleaning
          ? <ActivityIndicator color="#555" />
          : <Text style={styles.maintenanceButtonText}>Remove Orphaned Containers</Text>}
      </Pressable>

      <Text style={styles.versionText}>v{Constants.expoConfig?.version ?? '—'}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:            { padding: 20, paddingTop: 28 },
  sectionHeader:        { fontSize: 13, fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginLeft: 4 },
  card:                 { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 4, marginBottom: 12 },
  label:                { fontSize: 13, color: '#888', marginTop: 12, marginBottom: 4 },
  input:                { fontSize: 16, color: '#111', paddingVertical: 8 },
  usernameText:         { fontSize: 16, color: '#111', paddingVertical: 12 },
  statusMsg:            { fontSize: 14, marginBottom: 12, marginLeft: 4 },
  statusOk:             { color: '#34c759' },
  statusError:          { color: '#ff3b30' },
  statusTesting:        { color: '#888' },
  button:               { backgroundColor: '#007AFF', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 12 },
  buttonDisabled:       { opacity: 0.6 },
  buttonText:           { color: '#fff', fontSize: 17, fontWeight: '600' },
  accountHeader:        { marginTop: 24 },
  signOutButton:        { alignItems: 'center', paddingVertical: 12, marginBottom: 4 },
  signOutText:          { color: '#ff3b30', fontSize: 16 },
  maintenanceHeader:    { marginTop: 24 },
  maintenanceButton:    { backgroundColor: '#f2f2f7', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginBottom: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  maintenanceButtonText:{ color: '#333', fontSize: 16, fontWeight: '500' },
  versionText:          { fontSize: 12, color: '#bbb', textAlign: 'center', marginTop: 16 },
});

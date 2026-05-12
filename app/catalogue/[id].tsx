import {
  View, Text, TextInput, StyleSheet, Pressable,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db } from '../../db';
import { catalogue, item } from '../../schema';
import { deleteCatalogue } from '../../sync';

export default function EditCatalogueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data } = useLiveQuery(
    db.select().from(catalogue).where(eq(catalogue.id, id)).limit(1)
  );
  const cat = data?.[0];

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Populate form once the record loads
  useEffect(() => {
    if (cat && !loaded) {
      setName(cat.name);
      setIcon(cat.icon ?? '');
      setDescription(cat.description ?? '');
      setSortOrder(cat.sortOrder != null ? String(cat.sortOrder) : '');
      setLoaded(true);
    }
  }, [cat, loaded]);

  async function save() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a name for this catalogue.');
      return;
    }
    setSaving(true);
    try {
      await db.update(catalogue)
        .set({
          name: name.trim(),
          icon: icon.trim() || null,
          description: description.trim() || null,
          sortOrder: sortOrder ? parseInt(sortOrder, 10) : null,
          lastModified: new Date().toISOString(),
          synced: false,
        })
        .where(eq(catalogue.id, id));
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Save failed', msg);
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const items = await db.select({ id: item.id }).from(item).where(eq(item.catalogueId, id));
    const count = items.length;
    if (count === 0) {
      Alert.alert(
        'Delete Catalogue',
        `Delete "${name}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => handleDelete(true) },
        ]
      );
    } else {
      Alert.alert(
        'Delete Catalogue',
        `"${name}" contains ${count} item${count === 1 ? '' : 's'}. What should happen to them?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Keep Items', onPress: () => handleDelete(false) },
          { text: 'Delete All', style: 'destructive', onPress: () => handleDelete(true) },
        ]
      );
    }
  }

  async function handleDelete(deleteItems: boolean) {
    try {
      await deleteCatalogue(id, { deleteItems });
      router.back();
    } catch (e) {
      Alert.alert('Cannot delete', e instanceof Error ? e.message : String(e));
    }
  }

  if (!loaded) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.flex} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <View style={styles.iconAndName}>
            <View style={styles.iconField}>
              <Text style={styles.label}>Icon</Text>
              <TextInput
                style={styles.iconInput}
                value={icon}
                onChangeText={setIcon}
                placeholder="🖥️"
                maxLength={4}
                textAlign="center"
                selectTextOnFocus
              />
            </View>
            <View style={styles.nameField}>
              <Text style={styles.label}>
                Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Graphics Cards"
                returnKeyType="next"
              />
            </View>
          </View>

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Optional description"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            returnKeyType="next"
          />

          <Text style={styles.label}>Sort Order</Text>
          <TextInput
            style={styles.input}
            value={sortOrder}
            onChangeText={setSortOrder}
            placeholder="Optional — lower numbers appear first"
            keyboardType="numeric"
            returnKeyType="done"
            onSubmitEditing={save}
          />
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            pressed && styles.saveButtonPressed,
            saving && styles.saveButtonDisabled,
          ]}
          onPress={save}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.deleteButton, pressed && styles.deleteButtonPressed]}
          onPress={confirmDelete}
        >
          <Text style={styles.deleteButtonText}>Delete Catalogue</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f2f2f7' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 16, color: '#888' },
  section: {
    backgroundColor: '#fff',
    marginTop: 20,
    marginHorizontal: 16,
    borderRadius: 10,
    padding: 16,
    gap: 12,
  },
  iconAndName: {
    flexDirection: 'row',
    gap: 12,
  },
  iconField: { width: 72 },
  nameField: { flex: 1 },
  label: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  required: { color: '#ff3b30' },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  iconInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 8,
    fontSize: 22,
    backgroundColor: '#fafafa',
    textAlign: 'center',
  },
  multiline: {
    minHeight: 80,
    paddingTop: 8,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    margin: 16,
    marginTop: 24,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonPressed: { backgroundColor: '#0062cc' },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    marginHorizontal: 16,
    marginBottom: 40,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ff3b30',
  },
  deleteButtonPressed: { backgroundColor: '#fff0ee' },
  deleteButtonText: {
    color: '#ff3b30',
    fontSize: 16,
    fontWeight: '600',
  },
});

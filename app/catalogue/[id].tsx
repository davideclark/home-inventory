import {
  View, StyleSheet, Pressable,
  ScrollView, Alert,
} from 'react-native';
import { Text, TextInput } from '../../components/Text';
import { useState, useEffect } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db } from '../../db';
import { catalogue, item } from '../../schema';
import { deleteCatalogue } from '../../sync';
import CatalogueIcon from '../../components/CatalogueIcon';
import IconPicker from '../../components/IconPicker';

type FieldDef = { key: string; label: string; type: 'text' | 'number' | 'textarea'; showInList?: boolean };

function toKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
}

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
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  function addField() {
    setFields(prev => [...prev, { key: '', label: '', type: 'text' }]);
  }
  function removeField(i: number) {
    setFields(prev => prev.filter((_, j) => j !== i));
  }
  function updateField(i: number, k: keyof FieldDef, value: string | boolean) {
    setFields(prev => {
      const next = [...prev];
      const old = next[i];
      const updated = { ...old, [k]: value } as FieldDef;
      if (k === 'label' && typeof value === 'string' && old.key === toKey(old.label)) updated.key = toKey(value);
      next[i] = updated;
      return next;
    });
  }

  // Populate form once the record loads
  useEffect(() => {
    if (cat && !loaded) {
      setName(cat.name);
      setIcon(cat.icon ?? '');
      setDescription(cat.description ?? '');
      setSortOrder(cat.sortOrder != null ? String(cat.sortOrder) : '');
      try {
        setFields(cat.fields ? JSON.parse(cat.fields) : []);
      } catch {
        setFields([]);
      }
      setLoaded(true);
    }
  }, [cat, loaded]);

  async function save() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a name for this catalogue.');
      return;
    }
    if (fields.some(f => !f.label.trim())) {
      Alert.alert('Field label required', 'All custom fields must have a label.');
      return;
    }
    if (fields.some(f => !f.key.trim())) {
      Alert.alert('Field key required', 'All custom fields must have a key.');
      return;
    }
    setSaving(true);
    try {
      // Migrate item spec data for renamed keys (position-matched)
      const oldFields: FieldDef[] = cat?.fields ? JSON.parse(cat.fields) : [];
      for (let i = 0; i < Math.min(oldFields.length, fields.length); i++) {
        const oldKey = oldFields[i]?.key;
        const newKey = fields[i]?.key;
        if (oldKey && newKey && oldKey !== newKey) {
          await db.run(
            sql`UPDATE item SET spec = json_set(json_remove(spec, '$.' || ${oldKey}), '$.' || ${newKey}, json_extract(spec, '$.' || ${oldKey})) WHERE catalogue_id = ${id} AND json_extract(spec, '$.' || ${oldKey}) IS NOT NULL`
          );
        }
      }

      await db.update(catalogue)
        .set({
          name: name.trim(),
          icon: icon.trim() || null,
          description: description.trim() || null,
          sortOrder: sortOrder ? parseInt(sortOrder, 10) : null,
          fields: fields.length > 0 ? JSON.stringify(fields) : null,
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
    <>
      <ScrollView style={styles.flex} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.section}>
          <View style={styles.iconAndName}>
            <View style={styles.iconField}>
              <Text style={styles.label}>Icon</Text>
              <Pressable style={styles.iconButton} onPress={() => setPickerVisible(true)}>
                {icon ? (
                  <CatalogueIcon value={icon} size={26} />
                ) : (
                  <Text style={styles.iconPlaceholder}>📁</Text>
                )}
              </Pressable>
              {icon ? (
                <Pressable onPress={() => setIcon('')} style={styles.iconClear}>
                  <Text style={styles.iconClearText}>remove</Text>
                </Pressable>
              ) : (
                <Text style={styles.iconHint}>tap to set</Text>
              )}
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

        <View style={styles.section}>
          <View style={styles.fieldsHeader}>
            <Text style={styles.label}>Custom Fields</Text>
            <Pressable onPress={addField}>
              <Text style={styles.addFieldBtn}>+ Add Field</Text>
            </Pressable>
          </View>
          {fields.length === 0 && (
            <Text style={styles.fieldsEmpty}>No custom fields. Tap + Add Field to track catalogue-specific attributes.</Text>
          )}
          {fields.map((field, i) => (
            <View key={i} style={styles.fieldRow}>
              <View style={styles.fieldRowTop}>
                <TextInput
                  style={[styles.input, styles.fieldLabelInput]}
                  value={field.label}
                  onChangeText={val => updateField(i, 'label', val)}
                  placeholder="Label (e.g. Speed MHz)"
                  returnKeyType="next"
                />
                <Pressable onPress={() => removeField(i)} hitSlop={8}>
                  <Text style={styles.removeField}>✕</Text>
                </Pressable>
              </View>
              <Text style={styles.fieldKey}>{field.key || '—'}</Text>
              <View style={styles.typeChips}>
                {(['text', 'number', 'textarea'] as const).map(t => (
                  <Pressable
                    key={t}
                    style={[styles.typeChip, field.type === t && styles.typeChipActive]}
                    onPress={() => updateField(i, 'type', t)}
                  >
                    <Text style={[styles.typeChipText, field.type === t && styles.typeChipTextActive]}>{t}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => updateField(i, 'showInList', !field.showInList)} style={styles.showInListToggle}>
                <Text style={field.showInList ? styles.toggleOn : styles.toggleOff}>
                  {field.showInList ? '✓ Show in list' : '○ Show in list'}
                </Text>
              </Pressable>
            </View>
          ))}
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

      <IconPicker
        value={icon}
        visible={pickerVisible}
        onSelect={setIcon}
        onClose={() => setPickerVisible(false)}
      />
    </>
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
  iconButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    borderRadius: 8,
    height: 44,
    backgroundColor: '#fafafa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPlaceholder: { fontSize: 22 },
  iconClear: { marginTop: 4, alignItems: 'center' },
  iconClearText: { fontSize: 11, color: '#aaa' },
  iconHint: { fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 4 },
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
  fieldsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  addFieldBtn: { fontSize: 13, color: '#007AFF', fontWeight: '600' },
  fieldsEmpty: { fontSize: 13, color: '#aaa', fontStyle: 'italic' },
  fieldRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  fieldRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldLabelInput: { flex: 1 },
  fieldKey: { fontSize: 11, color: '#aaa', marginTop: 2, marginLeft: 2 },
  removeField: { fontSize: 16, color: '#ccc' },
  typeChips: { flexDirection: 'row', gap: 6, marginTop: 6 },
  typeChip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeChipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  typeChipText: { fontSize: 12, color: '#555' },
  typeChipTextActive: { color: '#fff', fontWeight: '600' },
  showInListToggle: { marginTop: 6 },
  toggleOn: { fontSize: 12, color: '#007AFF', fontWeight: '600' },
  toggleOff: { fontSize: 12, color: '#aaa' },
});

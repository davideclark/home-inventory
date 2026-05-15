import {
  View, StyleSheet, Pressable,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Text, TextInput } from '../../components/Text';
import { useState } from 'react';
import { router } from 'expo-router';
import { db } from '../../db';
import { catalogue } from '../../schema';
import { getDeviceId } from '../../sync';

type FieldDef = { key: string; label: string; type: 'text' | 'number' | 'textarea' };

function toKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
}

export default function AddCatalogueScreen() {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [saving, setSaving] = useState(false);

  function addField() {
    setFields(prev => [...prev, { key: '', label: '', type: 'text' }]);
  }
  function removeField(i: number) {
    setFields(prev => prev.filter((_, j) => j !== i));
  }
  function updateField(i: number, k: keyof FieldDef, value: string) {
    setFields(prev => {
      const next = [...prev];
      const old = next[i];
      const updated = { ...old, [k]: value } as FieldDef;
      if (k === 'label' && old.key === toKey(old.label)) updated.key = toKey(value);
      next[i] = updated;
      return next;
    });
  }

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
      await db.insert(catalogue).values({
        name: name.trim(),
        icon: icon.trim() || null,
        description: description.trim() || null,
        sortOrder: sortOrder ? parseInt(sortOrder, 10) : null,
        isStructural: false,
        fields: fields.length > 0 ? JSON.stringify(fields) : null,
        deviceId: await getDeviceId(),
      });
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Save failed', msg);
      setSaving(false);
    }
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
                autoFocus
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
          <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save Catalogue'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f2f2f7' },
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
  iconField: {
    width: 72,
  },
  nameField: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  required: {
    color: '#ff3b30',
  },
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
  saveButtonPressed: {
    backgroundColor: '#0062cc',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#fff',
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
});

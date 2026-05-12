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

export default function AddCatalogueScreen() {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a name for this catalogue.');
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
});

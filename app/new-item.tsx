import {
  View, StyleSheet, Pressable, Switch, ScrollView,
  Alert, Modal, FlatList,
} from 'react-native';
import { Text, TextInput } from '../components/Text';
import { useState, useEffect, useMemo } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db } from '../db';
import { item, catalogue } from '../schema';
import { getDeviceId } from '../sync';
import CatalogueIcon from '../components/CatalogueIcon';

type FieldDef = { key: string; label: string; type: 'text' | 'number' | 'textarea' };

function naturalSort(a: string, b: string): number {
  const re = /(\d+)/g;
  const ap = a.split(re);
  const bp = b.split(re);
  for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
    const as = ap[i] ?? '';
    const bs = bp[i] ?? '';
    if (i % 2 === 1) {
      const diff = parseInt(as, 10) - parseInt(bs, 10);
      if (diff !== 0) return diff;
    } else {
      const cmp = as.toLowerCase() < bs.toLowerCase() ? -1 : as.toLowerCase() > bs.toLowerCase() ? 1 : 0;
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

export default function AddItemScreen() {
  const { catalogueId, parentId: initialParentId } = useLocalSearchParams<{ catalogueId?: string; parentId?: string }>();

  const [itemNumber, setItemNumber] = useState('');
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [canContain, setCanContain] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const [parentLabel, setParentLabel] = useState('');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [selectedCatalogueId, setSelectedCatalogueId] = useState<string | null>(catalogueId ?? null);
  const [catalogueLabel, setCatalogueLabel] = useState('');
  const [cataloguePickerVisible, setCataloguePickerVisible] = useState(false);
  const [spec, setSpec] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: rawContainers } = useLiveQuery(
    db.select({ id: item.id, name: item.name, itemNumber: item.itemNumber })
      .from(item)
      .where(eq(item.canContain, true))
  );

  const containers = useMemo(
    () => [...(rawContainers ?? [])].sort((a, b) => naturalSort(a.name, b.name)),
    [rawContainers]
  );

  const { data: catalogues } = useLiveQuery(
    db.select({ id: catalogue.id, name: catalogue.name, icon: catalogue.icon, fields: catalogue.fields })
      .from(catalogue)
      .orderBy(catalogue.name)
  );

  // Set initial catalogue label when launched from a catalogue's item list
  useEffect(() => {
    if (!catalogueId || !catalogues || catalogueLabel) return;
    const cat = catalogues.find(c => c.id === catalogueId);
    if (cat) setCatalogueLabel(cat.name);
  }, [catalogueId, catalogues]);

  // Pre-fill container when launched from a container's + button
  useEffect(() => {
    if (!initialParentId || !containers || parentId) return;
    const pre = containers.find(c => c.id === initialParentId);
    if (pre) {
      setParentId(pre.id);
      setParentLabel(pre.itemNumber != null ? `#${String(pre.itemNumber).padStart(3, '0')} ${pre.name}` : pre.name);
    }
  }, [initialParentId, containers]);

  async function save() {
    let num: number | null = null;
    if (itemNumber.trim()) {
      const parsed = parseInt(itemNumber.trim(), 10);
      if (isNaN(parsed) || parsed <= 0) {
        Alert.alert('Invalid item number', 'Item number must be a positive integer.');
        return;
      }
      num = parsed;
    } else if (!canContain) {
      Alert.alert('Item number required', 'Inventory items must have an item number from the label roll.');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a name for this item.');
      return;
    }
    if (!canContain && !parentId) {
      Alert.alert(
        'Container required',
        'Select a container, or enable "Can contain other items" to save as a root item.'
      );
      return;
    }
    if (num !== null) {
      const existing = await db.select({ id: item.id }).from(item).where(eq(item.itemNumber, num)).limit(1);
      if (existing.length > 0) {
        Alert.alert('Duplicate item number', `#${num} is already in use. Please choose a different number.`);
        return;
      }
    }
    setSaving(true);
    try {
      const selectedCatFields: FieldDef[] = (() => {
        const cat = catalogues?.find(c => c.id === selectedCatalogueId);
        try { return cat?.fields ? JSON.parse(cat.fields) : []; } catch { return []; }
      })();
      const specToSave: Record<string, string | number> = {};
      for (const field of selectedCatFields) {
        const val = spec[field.key] ?? '';
        if (val !== '') specToSave[field.key] = field.type === 'number' ? Number(val) : val;
      }

      await db.insert(item).values({
        itemNumber: num,
        catalogueId: selectedCatalogueId ?? null,
        name: name.trim(),
        notes: notes.trim() || null,
        canContain,
        parentId,
        spec: Object.keys(specToSave).length > 0 ? JSON.stringify(specToSave) : null,
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
    <>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>


          {/* Identity */}
          <View style={styles.section}>
            <View style={styles.twoCol}>
              <View style={styles.colNarrow}>
                <Text style={styles.label}>Item #{!canContain && <Text style={styles.required}> *</Text>}</Text>
                <TextInput
                  style={styles.input}
                  value={itemNumber}
                  onChangeText={setItemNumber}
                  placeholder="166"
                  keyboardType="numeric"
                  autoFocus
                  returnKeyType="next"
                />
              </View>
              <View style={styles.colWide}>
                <Text style={styles.label}>Name <Text style={styles.required}>*</Text></Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Kensington USB Hub"
                  returnKeyType="next"
                />
              </View>
            </View>
          </View>

          {/* Catalogue */}
          <View style={styles.section}>
            <Text style={styles.label}>Catalogue</Text>
            <Pressable style={styles.pickerField} onPress={() => setCataloguePickerVisible(true)}>
              {selectedCatalogueId ? (
                <View style={styles.pickerIconRow}>
                  <CatalogueIcon value={catalogues?.find(c => c.id === selectedCatalogueId)?.icon ?? null} size={18} />
                  <Text style={styles.pickerValue}>{catalogues?.find(c => c.id === selectedCatalogueId)?.name ?? catalogueLabel}</Text>
                </View>
              ) : (
                <Text style={styles.pickerPlaceholder}>Select catalogue…</Text>
              )}
              {selectedCatalogueId ? (
                <Pressable hitSlop={8} onPress={() => { setSelectedCatalogueId(null); setCatalogueLabel(''); }}>
                  <Text style={styles.clearBtn}>✕</Text>
                </Pressable>
              ) : (
                <Text style={styles.chevron}>›</Text>
              )}
            </Pressable>
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional notes"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Photo */}
          <View style={styles.section}>
            <Text style={styles.label}>Photo</Text>
            <Text style={styles.photoHint}>Save this item first to add a photo.</Text>
          </View>

          {/* Custom spec fields */}
          {(() => {
            const cat = catalogues?.find(c => c.id === selectedCatalogueId);
            let catFields: FieldDef[] = [];
            try { catFields = cat?.fields ? JSON.parse(cat.fields) : []; } catch { catFields = []; }
            if (catFields.length === 0) return null;
            return (
              <View style={styles.section}>
                <Text style={styles.label}>Custom Fields</Text>
                {catFields.map(field => (
                  <View key={field.key}>
                    <Text style={[styles.label, styles.mt]}>{field.label}</Text>
                    <TextInput
                      style={[styles.input, field.type === 'textarea' && styles.multiline]}
                      value={spec[field.key] ?? ''}
                      onChangeText={val => setSpec(prev => ({ ...prev, [field.key]: val }))}
                      keyboardType={field.type === 'number' ? 'numeric' : 'default'}
                      multiline={field.type === 'textarea'}
                      numberOfLines={field.type === 'textarea' ? 3 : 1}
                      textAlignVertical={field.type === 'textarea' ? 'top' : 'auto'}
                      returnKeyType="next"
                    />
                  </View>
                ))}
              </View>
            );
          })()}

          {/* Container */}
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Can contain other items</Text>
              <Switch value={canContain} onValueChange={setCanContain} />
            </View>
            <Text style={[styles.label, styles.mt]}>Container</Text>
            <Pressable style={styles.pickerField} onPress={() => setPickerVisible(true)}>
              <Text style={parentId ? styles.pickerValue : styles.pickerPlaceholder}>
                {parentId ? parentLabel : canContain ? 'None — root item' : 'Select container…'}
              </Text>
              {parentId ? (
                <Pressable hitSlop={8} onPress={() => { setParentId(null); setParentLabel(''); }}>
                  <Text style={styles.clearBtn}>✕</Text>
                </Pressable>
              ) : (
                <Text style={styles.chevron}>›</Text>
              )}
            </Pressable>
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
            <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save Item'}</Text>
          </Pressable>

        </ScrollView>

      {/* Catalogue picker */}
      <Modal visible={cataloguePickerVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Catalogue</Text>
            <Pressable onPress={() => setCataloguePickerVisible(false)}>
              <Text style={styles.modalDone}>Done</Text>
            </Pressable>
          </View>
          <FlatList
            data={catalogues}
            keyExtractor={(c) => c.id}
            renderItem={({ item: c }) => (
              <Pressable
                style={[styles.pickerRow, selectedCatalogueId === c.id && styles.pickerRowSelected]}
                onPress={() => {
                  setSelectedCatalogueId(c.id);
                  setCatalogueLabel(c.name);
                  setCataloguePickerVisible(false);
                }}
              >
                <View style={styles.pickerIconRow}>
                  <CatalogueIcon value={c.icon} size={18} />
                  <Text style={styles.pickerRowText}>{c.name}</Text>
                </View>
                {selectedCatalogueId === c.id && <Text style={styles.pickerCheck}>✓</Text>}
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <View style={styles.pickerEmpty}>
                <Text style={styles.pickerEmptyText}>No catalogues available.</Text>
              </View>
            }
          />
        </View>
      </Modal>

      {/* Container picker */}
      <Modal visible={pickerVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Container</Text>
            <Pressable onPress={() => setPickerVisible(false)}>
              <Text style={styles.modalDone}>Done</Text>
            </Pressable>
          </View>
          <FlatList
            data={containers}
            keyExtractor={(c) => c.id}
            renderItem={({ item: c }) => (
              <Pressable
                style={[styles.pickerRow, parentId === c.id && styles.pickerRowSelected]}
                onPress={() => {
                  setParentId(c.id);
                  setParentLabel(c.itemNumber != null ? `#${String(c.itemNumber).padStart(3, '0')} ${c.name}` : c.name);
                  setPickerVisible(false);
                }}
              >
                <Text style={styles.pickerRowText}>
                  {c.itemNumber != null ? `#${String(c.itemNumber).padStart(3, '0')} ` : ''}{c.name}
                </Text>
                {parentId === c.id && <Text style={styles.pickerCheck}>✓</Text>}
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <View style={styles.pickerEmpty}>
                <Text style={styles.pickerEmptyText}>
                  No containers yet. Add a location or container item first.
                </Text>
              </View>
            }
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f2f2f7' },
  scrollContent: { paddingBottom: 16 },
  section: {
    backgroundColor: '#fff',
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 10,
    padding: 16,
  },
  twoCol: { flexDirection: 'row', gap: 12 },
  colNarrow: { width: 90 },
  colWide: { flex: 1 },
  label: { fontSize: 13, color: '#666', marginBottom: 4 },
  required: { color: '#ff3b30' },
  mt: { marginTop: 12, marginBottom: 4 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  multiline: { minHeight: 80, paddingTop: 8 },
  photoHint: { fontSize: 14, color: '#aaa', fontStyle: 'italic' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: 16, color: '#111' },
  pickerField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#fafafa',
  },
  pickerValue: { flex: 1, fontSize: 16, color: '#111' },
  pickerIconRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickerPlaceholder: { flex: 1, fontSize: 16, color: '#aaa' },
  clearBtn: { fontSize: 14, color: '#999', paddingLeft: 8 },
  chevron: { fontSize: 22, color: '#ccc', lineHeight: 24 },
  saveButton: {
    backgroundColor: '#007AFF',
    margin: 16,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonPressed: { backgroundColor: '#0062cc' },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modal: { flex: 1, backgroundColor: '#f2f2f7' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  modalTitle: { fontSize: 17, fontWeight: '600' },
  modalDone: { fontSize: 16, color: '#007AFF' },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  pickerRowSelected: { backgroundColor: '#f0f7ff' },
  pickerRowText: { flex: 1, fontSize: 16, color: '#111' },
  pickerCheck: { fontSize: 16, color: '#007AFF', fontWeight: '600' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#eee', marginLeft: 16 },
  pickerEmpty: { padding: 40, alignItems: 'center' },
  pickerEmptyText: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
});

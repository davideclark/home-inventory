import {
  View, StyleSheet, Pressable, Switch,
  ScrollView, Alert, Modal, FlatList,
} from 'react-native';
import { Text, TextInput } from '../components/Text';
import { useState, useEffect, useMemo } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { asc, eq, and, ne } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db } from '../db';
import { item, catalogue } from '../schema';
import { getDeviceId, deleteItem } from '../sync';
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

const STATUSES = ['active', 'untested', 'tested', 'faulty', 'stored', 'sold', 'donated', 'lost'] as const;
type Status = (typeof STATUSES)[number];

export default function EditItemScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();

  const { data: itemData } = useLiveQuery(
    db.select().from(item).where(eq(item.id, itemId)).limit(1)
  );
  const existing = itemData?.[0];

  const { data: rawContainers } = useLiveQuery(
    db.select({ id: item.id, name: item.name, itemNumber: item.itemNumber })
      .from(item)
      .where(and(eq(item.canContain, true), ne(item.id, itemId)))
  );

  const containers = useMemo(
    () => [...(rawContainers ?? [])].sort((a, b) => naturalSort(a.name, b.name)),
    [rawContainers]
  );

  const { data: catalogues } = useLiveQuery(
    db.select({ id: catalogue.id, name: catalogue.name, icon: catalogue.icon, fields: catalogue.fields })
      .from(catalogue)
      .orderBy(asc(catalogue.name))
  );

  const [itemNumber, setItemNumber] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<Status>('active');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [type, setType] = useState('');
  const [condition, setCondition] = useState('');
  const [colour, setColour] = useState('');
  const [barcode, setBarcode] = useState('');
  const [notes, setNotes] = useState('');
  const [canContain, setCanContain] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const [parentLabel, setParentLabel] = useState('');
  const [catalogueId, setCatalogueId] = useState<string | null>(null);
  const [catalogueLabel, setCatalogueLabel] = useState('');
  const [cataloguePickerVisible, setCataloguePickerVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [spec, setSpec] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Populate form once the item, containers, and catalogues have loaded
  useEffect(() => {
    if (!existing || !containers || !catalogues || loaded) return;
    setItemNumber(existing.itemNumber != null ? String(existing.itemNumber) : '');
    setName(existing.name);
    setStatus((existing.status as Status) ?? 'active');
    setManufacturer(existing.manufacturer ?? '');
    setModel(existing.model ?? '');
    setType(existing.type ?? '');
    setCondition(existing.condition ?? '');
    setColour(existing.colour ?? '');
    setBarcode(existing.barcode ?? '');
    setNotes(existing.notes ?? '');
    setCanContain(existing.canContain);
    setParentId(existing.parentId ?? null);
    if (existing.parentId) {
      const parent = containers.find(c => c.id === existing.parentId);
      if (parent) {
        setParentLabel(parent.itemNumber != null
          ? `#${String(parent.itemNumber).padStart(3, '0')} ${parent.name}`
          : parent.name);
      }
    }
    setCatalogueId(existing.catalogueId ?? null);
    if (existing.catalogueId) {
      const cat = catalogues.find(c => c.id === existing.catalogueId);
      if (cat) {
        setCatalogueLabel(cat.name);
      }
    }
    if (existing.spec) {
      try {
        const parsed = JSON.parse(existing.spec);
        const initial: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          initial[k] = v != null ? String(v) : '';
        }
        setSpec(initial);
      } catch { /* ignore */ }
    }
    setLoaded(true);
  }, [existing, containers, catalogues, loaded]);

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
      const duplicate = await db
        .select({ id: item.id })
        .from(item)
        .where(and(eq(item.itemNumber, num), ne(item.id, itemId)))
        .limit(1);
      if (duplicate.length > 0) {
        Alert.alert('Duplicate item number', `#${num} is already in use. Please choose a different number.`);
        return;
      }
    }
    setSaving(true);
    try {
      const selectedCatFields: FieldDef[] = (() => {
        const cat = catalogues?.find(c => c.id === catalogueId);
        try { return cat?.fields ? JSON.parse(cat.fields) : []; } catch { return []; }
      })();
      // Merge: preserve existing spec keys, overwrite with current catalogue's fields
      const existingSpec: Record<string, string | number> = (() => {
        try { return existing?.spec ? JSON.parse(existing.spec) : {}; } catch { return {}; }
      })();
      const specToSave: Record<string, string | number> = { ...existingSpec };
      for (const field of selectedCatFields) {
        const val = spec[field.key] ?? '';
        if (val === '') {
          delete specToSave[field.key];
        } else {
          specToSave[field.key] = field.type === 'number' ? Number(val) : val;
        }
      }

      await db.update(item)
        .set({
          itemNumber: num,
          catalogueId,
          name: name.trim(),
          status,
          manufacturer: manufacturer.trim() || null,
          model: model.trim() || null,
          type: type.trim() || null,
          condition: condition.trim() || null,
          colour: colour.trim() || null,
          barcode: barcode.trim() || null,
          notes: notes.trim() || null,
          canContain,
          parentId,
          spec: Object.keys(specToSave).length > 0 ? JSON.stringify(specToSave) : null,
          lastModified: new Date().toISOString(),
          synced: false,
          deviceId: await getDeviceId(),
        })
        .where(eq(item.id, itemId));
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Save failed', msg);
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      'Delete Item',
      `Delete "${name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: handleDelete },
      ]
    );
  }

  async function handleDelete() {
    try {
      await deleteItem(itemId);
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
      <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>

        {/* Catalogue */}
        <View style={styles.section}>
          <Text style={styles.label}>Catalogue</Text>
          <Pressable style={styles.pickerField} onPress={() => setCataloguePickerVisible(true)}>
            {catalogueId ? (
              <View style={styles.pickerIconRow}>
                <CatalogueIcon value={catalogues?.find(c => c.id === catalogueId)?.icon ?? null} size={18} />
                <Text style={styles.pickerValue}>{catalogues?.find(c => c.id === catalogueId)?.name ?? catalogueLabel}</Text>
              </View>
            ) : (
              <Text style={styles.pickerPlaceholder}>Select catalogue…</Text>
            )}
            {catalogueId ? (
              <Pressable hitSlop={8} onPress={() => { setCatalogueId(null); setCatalogueLabel(''); }}>
                <Text style={styles.clearBtn}>✕</Text>
              </Pressable>
            ) : (
              <Text style={styles.chevron}>›</Text>
            )}
          </Pressable>
        </View>

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

        {/* Status */}
        <View style={styles.section}>
          <Text style={styles.label}>Status</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {STATUSES.map((s) => (
              <Pressable
                key={s}
                style={[styles.chip, status === s && styles.chipActive]}
                onPress={() => setStatus(s)}
              >
                <Text style={[styles.chipText, status === s && styles.chipTextActive]}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Classification */}
        <View style={styles.section}>
          <Text style={styles.label}>Manufacturer</Text>
          <TextInput style={styles.input} value={manufacturer} onChangeText={setManufacturer} placeholder="e.g. Kensington" returnKeyType="next" />
          <Text style={[styles.label, styles.mt]}>Model</Text>
          <TextInput style={styles.input} value={model} onChangeText={setModel} placeholder="e.g. K33970EU" returnKeyType="next" />
          <Text style={[styles.label, styles.mt]}>Type</Text>
          <TextInput style={styles.input} value={type} onChangeText={setType} placeholder="e.g. USB Hub" returnKeyType="next" />
        </View>

        {/* Details */}
        <View style={styles.section}>
          <Text style={styles.label}>Condition</Text>
          <TextInput style={styles.input} value={condition} onChangeText={setCondition} placeholder="Good / Fair / Poor" returnKeyType="next" />
          <Text style={[styles.label, styles.mt]}>Colour</Text>
          <TextInput style={styles.input} value={colour} onChangeText={setColour} placeholder="e.g. Black" returnKeyType="next" />
          <Text style={[styles.label, styles.mt]}>Barcode</Text>
          <TextInput style={styles.input} value={barcode} onChangeText={setBarcode} placeholder="Optional" returnKeyType="next" />
          <Text style={[styles.label, styles.mt]}>Notes</Text>
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

        {/* Custom spec fields */}
        {(() => {
          const cat = catalogues?.find(c => c.id === catalogueId);
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
          style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed, saving && styles.saveButtonDisabled]}
          onPress={save}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.deleteButton, pressed && styles.deleteButtonPressed]}
          onPress={confirmDelete}
        >
          <Text style={styles.deleteButtonText}>Delete Item</Text>
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
                style={[styles.pickerRow, catalogueId === c.id && styles.pickerRowSelected]}
                onPress={() => {
                  setCatalogueId(c.id);
                  setCatalogueLabel(c.name);
                  setCataloguePickerVisible(false);
                }}
              >
                <View style={styles.pickerIconRow}>
                  <CatalogueIcon value={c.icon} size={18} />
                  <Text style={styles.pickerRowText}>{c.name}</Text>
                </View>
                {catalogueId === c.id && <Text style={styles.pickerCheck}>✓</Text>}
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
                  setParentLabel(c.itemNumber != null
                    ? `#${String(c.itemNumber).padStart(3, '0')} ${c.name}`
                    : c.name);
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
                <Text style={styles.pickerEmptyText}>No containers available.</Text>
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 16, color: '#888' },
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
  chips: { gap: 8, paddingTop: 4 },
  chip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  chipText: { fontSize: 13, color: '#555' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
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
  deleteButtonText: { color: '#ff3b30', fontSize: 16, fontWeight: '600' },
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

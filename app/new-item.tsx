import {
  View, StyleSheet, Pressable, Switch, ScrollView,
  Alert, Modal, FlatList,
} from 'react-native';
import { Text, TextInput } from '../components/Text';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState, useEffect, useMemo } from 'react';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { eq, isNotNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db } from '../db';
import { item, catalogue, generateId } from '../schema';
import { getDeviceId, uploadItemImage, deleteItemImage, getImageUrl } from '../sync';
import CatalogueIcon from '../components/CatalogueIcon';

type FieldDef = { key: string; label: string; type: 'text' | 'number' | 'textarea' };

type ContainerRecord = { id: string; name: string; parentId: string | null; notes: string | null };

function buildPath(id: string, map: Map<string, ContainerRecord>, depth = 0): string {
  if (depth > 10) return '…';
  const c = map.get(id);
  if (!c) return 'Unknown';
  if (!c.parentId) return c.name;
  return `${buildPath(c.parentId, map, depth + 1)} › ${c.name}`;
}

export default function AddItemScreen() {
  const { catalogueId, parentId: initialParentId } = useLocalSearchParams<{ catalogueId?: string; parentId?: string }>();

  const [newItemId] = useState(() => generateId());
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
  const [hasImage, setHasImage] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageHeaders, setImageHeaders] = useState<Record<string, string>>({});
  const [imageCacheBuster, setImageCacheBuster] = useState(0);
  const [imageUploading, setImageUploading] = useState(false);

  const [isSaved, setIsSaved] = useState(false);
  const navigation = useNavigation();
  const isDirty = !isSaved && !!(
    name.trim() || itemNumber.trim() || notes.trim() || hasImage ||
    Object.values(spec).some(v => v.trim())
  );

  usePreventRemove(isDirty, ({ data }) => {
    Alert.alert(
      'Discard changes?',
      'You have unsaved changes. Are you sure you want to go back?',
      [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
      ]
    );
  });

  useEffect(() => {
    if (isSaved) router.back();
  }, [isSaved]);

  const { data: rawContainers } = useLiveQuery(
    db.select({ id: item.id, name: item.name, itemNumber: item.itemNumber, parentId: item.parentId, notes: item.notes })
      .from(item)
      .where(eq(item.canContain, true))
  );

  const containerMap = useMemo(
    () => new Map((rawContainers ?? []).map(c => [c.id, c])),
    [rawContainers]
  );

  const containers = useMemo(
    () => [...(rawContainers ?? [])].sort((a, b) =>
      buildPath(a.id, containerMap).localeCompare(buildPath(b.id, containerMap))
    ),
    [rawContainers, containerMap]
  );

  const { data: catSummaryRows } = useLiveQuery(
    db.select({ parentId: item.parentId, catalogueName: catalogue.name })
      .from(item)
      .leftJoin(catalogue, eq(item.catalogueId, catalogue.id))
      .where(isNotNull(item.parentId))
  );

  const cataloguesByContainer = useMemo(() => {
    const map = new Map<string, string[]>();
    catSummaryRows?.forEach(row => {
      if (!row.parentId || !row.catalogueName) return;
      const existing = map.get(row.parentId);
      if (!existing) { map.set(row.parentId, [row.catalogueName]); return; }
      if (!existing.includes(row.catalogueName)) existing.push(row.catalogueName);
    });
    return map;
  }, [catSummaryRows]);

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
    if (!initialParentId || !rawContainers || parentId) return;
    const pre = rawContainers.find(c => c.id === initialParentId);
    if (pre) {
      setParentId(pre.id);
      setParentLabel(buildPath(pre.id, containerMap));
    }
  }, [initialParentId, rawContainers, containerMap]);

  async function uploadPhoto(uri: string) {
    setImageUploading(true);
    try {
      const { url, headers } = await getImageUrl(newItemId);
      setImageUrl(url);
      setImageHeaders(headers);
      await uploadItemImage(newItemId, uri);
      setHasImage(true);
      setImageCacheBuster(v => v + 1);
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : 'Could not upload photo.');
    } finally {
      setImageUploading(false);
    }
  }

  function pickPhoto() {
    Alert.alert('Add Photo', undefined, [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission required', 'Camera access is needed to take a photo.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
          if (!result.canceled && result.assets[0]) await uploadPhoto(result.assets[0].uri);
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
          if (!result.canceled && result.assets[0]) await uploadPhoto(result.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

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
        id: newItemId,
        itemNumber: num,
        catalogueId: selectedCatalogueId ?? null,
        name: name.trim(),
        notes: notes.trim() || null,
        canContain,
        parentId,
        spec: Object.keys(specToSave).length > 0 ? JSON.stringify(specToSave) : null,
        hasImage,
        deviceId: await getDeviceId(),
      });
      setIsSaved(true);
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
            <View style={styles.imageRow}>
              {hasImage && imageUrl && (
                <ExpoImage
                  source={{ uri: `${imageUrl}?t=${imageCacheBuster}`, headers: imageHeaders }}
                  style={styles.imageThumbnail}
                  contentFit="cover"
                />
              )}
              <View style={styles.imageButtons}>
                <Pressable
                  style={({ pressed }) => [styles.imageBtn, pressed && styles.imageBtnPressed, imageUploading && styles.imageBtnDisabled]}
                  disabled={imageUploading}
                  onPress={pickPhoto}
                >
                  <Text style={styles.imageBtnText}>
                    {imageUploading ? 'Uploading…' : hasImage ? 'Change photo' : '📷 Add photo'}
                  </Text>
                </Pressable>
                {hasImage && (
                  <Pressable
                    style={({ pressed }) => [styles.imageBtnDanger, pressed && styles.imageBtnDangerPressed]}
                    onPress={() => {
                      Alert.alert('Remove photo', 'Remove the photo from this item?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: async () => {
                          await deleteItemImage(newItemId);
                          setHasImage(false);
                        }},
                      ]);
                    }}
                  >
                    <Text style={styles.imageBtnDangerText}>Remove photo</Text>
                  </Pressable>
                )}
              </View>
            </View>
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
            renderItem={({ item: c }) => {
              const cats = cataloguesByContainer.get(c.id);
              const subtitle = cats?.length ? cats.join(', ') : c.notes;
              return (
                <Pressable
                  style={[styles.pickerRow, parentId === c.id && styles.pickerRowSelected]}
                  onPress={() => {
                    setParentId(c.id);
                    setParentLabel(buildPath(c.id, containerMap));
                    setPickerVisible(false);
                  }}
                >
                  <View style={styles.pickerRowBody}>
                    <Text style={styles.pickerRowText}>{buildPath(c.id, containerMap)}</Text>
                    {subtitle ? <Text style={styles.pickerRowNotes} numberOfLines={1}>{subtitle}</Text> : null}
                  </View>
                  {parentId === c.id && <Text style={styles.pickerCheck}>✓</Text>}
                </Pressable>
              );
            }}
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
  imageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 4 },
  imageThumbnail: { width: 80, height: 80, borderRadius: 8 },
  imageButtons: { flex: 1, gap: 8 },
  imageBtn: { backgroundColor: '#f0f0f5', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  imageBtnPressed: { backgroundColor: '#e0e0ea' },
  imageBtnDisabled: { opacity: 0.5 },
  imageBtnText: { fontSize: 15, color: '#007AFF', fontWeight: '500' },
  imageBtnDanger: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#ff3b30' },
  imageBtnDangerPressed: { backgroundColor: '#fff0ee' },
  imageBtnDangerText: { fontSize: 15, color: '#ff3b30' },
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
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  pickerRowSelected: { backgroundColor: '#f0f7ff' },
  pickerRowBody: { flex: 1 },
  pickerRowText: { fontSize: 16, color: '#111' },
  pickerRowNotes: { fontSize: 12, color: '#888', marginTop: 2 },
  pickerCheck: { fontSize: 16, color: '#007AFF', fontWeight: '600', marginLeft: 8 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: '#eee', marginLeft: 16 },
  pickerEmpty: { padding: 40, alignItems: 'center' },
  pickerEmptyText: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
});

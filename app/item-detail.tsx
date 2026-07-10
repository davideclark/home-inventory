import { View, StyleSheet, ScrollView, Pressable, useWindowDimensions, Alert } from 'react-native';
import { Text } from '../components/Text';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useMemo, useEffect, useState, useCallback } from 'react';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db } from '../db';
import { item, catalogue } from '../schema';
import {
  getImageUrl, isServerConfigured,
  listAttachments, uploadAttachment, deleteAttachment, getAttachmentUrl,
  type ItemAttachment,
} from '../sync';
import CatalogueIcon from '../components/CatalogueIcon';
import { parseFields, formatFieldValue } from '../fields';

export default function ItemDetailScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const { width } = useWindowDimensions();
  const [imgSrc, setImgSrc] = useState<{ uri: string; headers?: Record<string, string> } | null>(null);

  const { data: itemData } = useLiveQuery(
    db.select().from(item).where(eq(item.id, itemId)).limit(1)
  );
  const i = itemData?.[0];

  const { data: allCatalogues } = useLiveQuery(
    db.select({ id: catalogue.id, name: catalogue.name, icon: catalogue.icon, fields: catalogue.fields })
      .from(catalogue)
  );
  const cat = allCatalogues?.find(c => c.id === i?.catalogueId);

  const { data: containerItems } = useLiveQuery(
    db.select({ id: item.id, name: item.name, itemNumber: item.itemNumber, parentId: item.parentId })
      .from(item)
      .where(eq(item.canContain, true))
  );

  const containerMap = useMemo(() => {
    const map = new Map<string, { name: string; itemNumber: number | null; parentId: string | null }>();
    containerItems?.forEach(c => map.set(c.id, { name: c.name, itemNumber: c.itemNumber, parentId: c.parentId }));
    return map;
  }, [containerItems]);

  const specFields = useMemo(() => parseFields(cat?.fields), [cat?.fields]);
  const specValues: Record<string, unknown> = useMemo(() => {
    try { return i?.spec ? JSON.parse(i.spec) : {}; }
    catch { return {}; }
  }, [i?.spec]);

  useEffect(() => {
    if (!i?.hasImage) { setImgSrc(null); return; }
    getImageUrl(i.id).then(({ url, headers }) => {
      setImgSrc({ uri: url, headers: Object.keys(headers).length ? headers : undefined });
    });
  }, [i?.id, i?.hasImage]);

  // Attachments — online-only; the section is hidden when the server isn't reachable
  const [attachments, setAttachments] = useState<ItemAttachment[] | null>(null);
  const [photoSrcs, setPhotoSrcs] = useState<Record<string, { uri: string; headers?: Record<string, string> }>>({});
  const [attachmentBusy, setAttachmentBusy] = useState(false);

  const loadAttachments = useCallback(async () => {
    try {
      if (!itemId || !(await isServerConfigured())) { setAttachments(null); return; }
      const rows = await listAttachments(itemId);
      const srcs: Record<string, { uri: string; headers?: Record<string, string> }> = {};
      await Promise.all(rows.filter(a => a.kind === 'photo').map(async a => {
        const { url, headers } = await getAttachmentUrl(a.id);
        srcs[a.id] = { uri: url, headers: Object.keys(headers).length ? headers : undefined };
      }));
      setPhotoSrcs(srcs);
      setAttachments(rows);
    } catch {
      setAttachments(null);
    }
  }, [itemId]);

  useEffect(() => { loadAttachments(); }, [loadAttachments]);

  async function openAttachment(a: ItemAttachment) {
    try {
      const { url, headers } = await getAttachmentUrl(a.id);
      const ext = a.originalFilename.includes('.') ? a.originalFilename.split('.').pop() : 'bin';
      const dest = `${FileSystem.cacheDirectory}attachment-${a.id}.${ext}`;
      const dl = await FileSystem.downloadAsync(url, dest, { headers });
      await Sharing.shareAsync(dl.uri, { mimeType: a.mimeType });
    } catch (e) {
      Alert.alert('Could not open attachment', e instanceof Error ? e.message : String(e));
    }
  }

  async function doUpload(file: { uri: string; name: string; mimeType: string }, kind?: 'photo' | 'document') {
    setAttachmentBusy(true);
    try {
      await uploadAttachment(itemId, file, kind);
      await loadAttachments();
    } catch (e) {
      Alert.alert('Upload failed', e instanceof Error ? e.message : String(e));
    } finally {
      setAttachmentBusy(false);
    }
  }

  function addPhoto() {
    Alert.alert('Add Photo', undefined, [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission required', 'Camera access is needed to take a photo.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
          if (!result.canceled && result.assets[0]) await doUpload({ uri: result.assets[0].uri, name: 'photo.jpg', mimeType: 'image/jpeg' }, 'photo');
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
          if (!result.canceled && result.assets[0]) await doUpload({ uri: result.assets[0].uri, name: 'photo.jpg', mimeType: 'image/jpeg' }, 'photo');
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function addDocument() {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await doUpload(
      { uri: asset.uri, name: asset.name ?? 'document', mimeType: asset.mimeType ?? 'application/octet-stream' },
      'document'
    );
  }

  function confirmDeleteAttachment(a: ItemAttachment) {
    Alert.alert('Remove Attachment', `Remove "${a.originalFilename}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await deleteAttachment(a.id);
            await loadAttachments();
          } catch (e) {
            Alert.alert('Could not remove', e instanceof Error ? e.message : String(e));
          }
        },
      },
    ]);
  }

  if (!i) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  function buildPath(parentId: string | null | undefined): string {
    if (!parentId) return '';
    const parts: string[] = [];
    let id: string | null = parentId;
    while (id) {
      const c = containerMap.get(id);
      if (!c) break;
      parts.unshift(c.itemNumber != null ? `#${String(c.itemNumber).padStart(3, '0')} ${c.name}` : c.name);
      id = c.parentId;
    }
    return parts.join(' › ');
  }

  const containerPath = buildPath(i.parentId);

  return (
    <>
      <Stack.Screen
        options={{
          title: i.itemNumber != null ? `#${String(i.itemNumber).padStart(3, '0')}` : i.name,
          headerRight: () => (
            <Pressable
              onPress={() => router.replace({ pathname: '/edit-item', params: { itemId } })}
              hitSlop={12}
              style={{ paddingHorizontal: 12, paddingVertical: 8, marginRight: 4 }}
            >
              <Text style={{ color: '#007AFF', fontSize: 16 }}>Edit</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>

        {/* Photo */}
        {imgSrc && (
          <Pressable onPress={() => router.replace({ pathname: '/edit-item', params: { itemId } })}>
            <ExpoImage
              source={imgSrc}
              style={{ width, height: width * 0.6 }}
              contentFit="cover"
            />
          </Pressable>
        )}

        {/* Name */}
        <View style={styles.section}>
          <Text style={styles.itemName}>{i.name}</Text>
          {i.itemNumber != null && (
            <Text style={styles.itemNumber}>Item #{String(i.itemNumber).padStart(3, '0')}</Text>
          )}
        </View>

        {/* Catalogue + spec fields */}
        {(cat || specFields.length > 0) && (
          <View style={styles.section}>
            {cat && (
              <View style={styles.row}>
                <Text style={styles.label}>Catalogue</Text>
                <View style={styles.catalogueValue}>
                  <CatalogueIcon value={cat.icon} size={14} />
                  <Text style={styles.value}>{cat.name}</Text>
                </View>
              </View>
            )}
            {specFields.map(field => {
              const val = formatFieldValue(field, specValues[field.key]);
              return val ? <Row key={field.key} label={field.label} value={val} /> : null;
            })}
          </View>
        )}

        {/* Notes */}
        {i.notes && (
          <View style={styles.section}>
            <Text style={styles.label}>Notes</Text>
            <Text style={styles.notes}>{i.notes}</Text>
          </View>
        )}

        {/* Container */}
        {(containerPath || i.canContain) && (
          <View style={styles.section}>
            {containerPath && <Row label="Location" value={containerPath} />}
            {i.canContain && <Row label="Can contain items" value="Yes" />}
          </View>
        )}

        {/* Attachments — photos & receipts (online only) */}
        {attachments !== null && (
          <View style={styles.section}>
            <Text style={styles.label}>Photos & Receipts</Text>
            {attachments.filter(a => a.kind === 'photo').length > 0 && (
              <View style={styles.attachmentGrid}>
                {attachments.filter(a => a.kind === 'photo').map(a => (
                  photoSrcs[a.id] ? (
                    <Pressable key={a.id} onPress={() => openAttachment(a)} onLongPress={() => confirmDeleteAttachment(a)}>
                      <ExpoImage source={photoSrcs[a.id]} style={styles.attachmentThumb} contentFit="cover" />
                    </Pressable>
                  ) : null
                ))}
              </View>
            )}
            {attachments.filter(a => a.kind === 'document').map(a => (
              <View key={a.id} style={styles.attachmentRow}>
                <Pressable style={styles.attachmentName} onPress={() => openAttachment(a)}>
                  <Text style={styles.attachmentNameText} numberOfLines={1}>📄 {a.originalFilename}</Text>
                </Pressable>
                <Pressable hitSlop={8} onPress={() => confirmDeleteAttachment(a)}>
                  <Text style={styles.attachmentDelete}>✕</Text>
                </Pressable>
              </View>
            ))}
            <View style={styles.attachmentButtons}>
              <Pressable
                style={({ pressed }) => [styles.attachmentBtn, pressed && styles.attachmentBtnPressed, attachmentBusy && styles.attachmentBtnDisabled]}
                disabled={attachmentBusy}
                onPress={addPhoto}
              >
                <Text style={styles.attachmentBtnText}>{attachmentBusy ? 'Uploading…' : '📷 Add Photo'}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.attachmentBtn, pressed && styles.attachmentBtnPressed, attachmentBusy && styles.attachmentBtnDisabled]}
                disabled={attachmentBusy}
                onPress={addDocument}
              >
                <Text style={styles.attachmentBtnText}>📎 Add Document</Text>
              </Pressable>
            </View>
            <Text style={styles.attachmentHint}>Tap to open · long-press a photo to remove</Text>
          </View>
        )}

      </ScrollView>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 16, color: '#888' },
  section: {
    backgroundColor: '#fff',
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 10,
    padding: 16,
    gap: 10,
  },
  itemName: { fontSize: 20, fontWeight: '600', color: '#111' },
  itemNumber: { fontSize: 13, color: '#888', marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  label: { fontSize: 13, color: '#888', flex: 1 },
  value: { fontSize: 15, color: '#111', flex: 2, textAlign: 'right' },
  catalogueValue: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 2, justifyContent: 'flex-end' },
  notes: { fontSize: 15, color: '#111', lineHeight: 22 },
  attachmentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  attachmentThumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#f0f0f5' },
  attachmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  attachmentName: { flex: 1 },
  attachmentNameText: { fontSize: 15, color: '#007AFF' },
  attachmentDelete: { fontSize: 14, color: '#ccc', paddingHorizontal: 4 },
  attachmentButtons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  attachmentBtn: { flex: 1, backgroundColor: '#f0f0f5', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  attachmentBtnPressed: { backgroundColor: '#e0e0ea' },
  attachmentBtnDisabled: { opacity: 0.5 },
  attachmentBtnText: { fontSize: 14, color: '#007AFF', fontWeight: '500' },
  attachmentHint: { fontSize: 11, color: '#bbb', textAlign: 'center', marginTop: 2 },
});

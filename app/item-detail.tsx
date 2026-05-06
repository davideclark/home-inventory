import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db } from '../db';
import { item } from '../schema';

const STATUS_COLOURS: Record<string, string> = {
  active:   '#34c759',
  untested: '#ff9500',
  tested:   '#34c759',
  faulty:   '#ff3b30',
  stored:   '#8e8e93',
  sold:     '#5856d6',
  donated:  '#007AFF',
  lost:     '#ff9500',
};

export default function ItemDetailScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();

  const { data: itemData } = useLiveQuery(
    db.select().from(item).where(eq(item.id, itemId)).limit(1)
  );
  const i = itemData?.[0];

  const { data: parentData } = useLiveQuery(
    db.select({ id: item.id, name: item.name, itemNumber: item.itemNumber })
      .from(item)
      .where(eq(item.id, i?.parentId ?? ''))
      .limit(1)
  );
  const parent = parentData?.[0];

  if (!i) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  const statusColour = STATUS_COLOURS[i.status ?? 'active'] ?? '#8e8e93';
  const parentLabel = parent
    ? (parent.itemNumber != null ? `#${String(parent.itemNumber).padStart(3, '0')} ${parent.name}` : parent.name)
    : null;

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

        {/* Name + status */}
        <View style={styles.section}>
          <View style={styles.nameRow}>
            <Text style={styles.itemName}>{i.name}</Text>
            {i.status && (
              <View style={[styles.statusBadge, { backgroundColor: statusColour }]}>
                <Text style={styles.statusText}>{i.status}</Text>
              </View>
            )}
          </View>
          {i.itemNumber != null && (
            <Text style={styles.itemNumber}>Item #{String(i.itemNumber).padStart(3, '0')}</Text>
          )}
        </View>

        {/* Classification */}
        {(i.manufacturer || i.model || i.type) && (
          <View style={styles.section}>
            {i.manufacturer && <Row label="Manufacturer" value={i.manufacturer} />}
            {i.model && <Row label="Model" value={i.model} />}
            {i.type && <Row label="Type" value={i.type} />}
          </View>
        )}

        {/* Details */}
        {(i.condition || i.colour || i.barcode) && (
          <View style={styles.section}>
            {i.condition && <Row label="Condition" value={i.condition} />}
            {i.colour && <Row label="Colour" value={i.colour} />}
            {i.barcode && <Row label="Barcode" value={i.barcode} />}
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
        {(parentLabel || i.canContain) && (
          <View style={styles.section}>
            {parentLabel && <Row label="Container" value={parentLabel} />}
            {i.canContain && <Row label="Can contain items" value="Yes" />}
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
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  itemName: { flex: 1, fontSize: 20, fontWeight: '600', color: '#111' },
  itemNumber: { fontSize: 13, color: '#888', marginTop: 4 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  label: { fontSize: 13, color: '#888', flex: 1 },
  value: { fontSize: 15, color: '#111', flex: 2, textAlign: 'right' },
  notes: { fontSize: 15, color: '#111', lineHeight: 22 },
});

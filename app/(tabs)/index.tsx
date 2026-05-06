import { FlatList, View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useRef } from 'react';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { asc, eq } from 'drizzle-orm';
import { router } from 'expo-router';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { db } from '../../db';
import { catalogue } from '../../schema';
import type { Catalogue } from '../../schema';

export default function CataloguesScreen() {
  const { data: catalogues } = useLiveQuery(
    db.select()
      .from(catalogue)
      .where(eq(catalogue.isStructural, false))
      .orderBy(asc(catalogue.sortOrder), asc(catalogue.name))
  );

  if (!catalogues) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (catalogues.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No catalogues yet</Text>
        <Text style={styles.emptySubtitle}>Add a catalogue to start organising your inventory.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={catalogues}
      keyExtractor={(c) => c.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => <CatalogueRow catalogue={item} />}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );
}

function CatalogueRow({ catalogue: cat }: { catalogue: Catalogue }) {
  const swipeRef = useRef<Swipeable>(null);

  function renderRightActions() {
    return (
      <View style={styles.swipeActions}>
        <Pressable
          style={styles.editAction}
          onPress={() => {
            swipeRef.current?.close();
            router.push(`/catalogue/${cat.id}`);
          }}
        >
          <Text style={styles.actionText}>Edit</Text>
        </Pressable>
        <Pressable
          style={styles.deleteAction}
          onPress={() => {
            swipeRef.current?.close();
            Alert.alert(
              'Delete Catalogue',
              `Delete "${cat.name}"? This cannot be undone.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await db.delete(catalogue).where(eq(catalogue.id, cat.id));
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : String(e);
                      const friendly =
                        msg.includes('FOREIGN KEY') || msg.includes('foreign key')
                          ? 'This catalogue still has items. Remove all items first.'
                          : msg;
                      Alert.alert('Cannot delete', friendly);
                    }
                  },
                },
              ]
            );
          }}
        >
          <Text style={styles.actionText}>Delete</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Swipeable ref={swipeRef} renderRightActions={renderRightActions} friction={2}>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => router.push(`/items/${cat.id}`)}
      >
        <View style={styles.iconCell}>
          {cat.icon
            ? <Text style={styles.icon}>{cat.icon}</Text>
            : <View style={styles.iconPlaceholder} />}
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowName}>{cat.name}</Text>
          {cat.description ? <Text style={styles.rowDesc}>{cat.description}</Text> : null}
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: { fontSize: 16, color: '#888' },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8, color: '#333' },
  emptySubtitle: { fontSize: 14, color: '#888', textAlign: 'center' },
  list: { paddingVertical: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  rowPressed: { backgroundColor: '#f0f0f0' },
  iconCell: { width: 40, alignItems: 'center', marginRight: 12 },
  icon: { fontSize: 24 },
  iconPlaceholder: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e0e0e0' },
  rowBody: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: '500', color: '#111' },
  rowDesc: { fontSize: 13, color: '#666', marginTop: 2 },
  chevron: { fontSize: 20, color: '#ccc', marginLeft: 8 },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#ddd',
    marginLeft: 68,
  },
  swipeActions: { flexDirection: 'row' },
  editAction: {
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  deleteAction: {
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  actionText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});

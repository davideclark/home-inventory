import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { sync as runSync, getLastSyncAt } from '../sync';

type SyncState = {
  syncing: boolean;
  lastSyncAt: string | null;
  error: string | null;
  sync: () => Promise<void>;
};

export const SyncContext = createContext<SyncState>({
  syncing: false,
  lastSyncAt: null,
  error: null,
  sync: async () => {},
});

export function useSyncContext() {
  return useContext(SyncContext);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [syncing, setSyncing]       = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const syncingRef                  = useRef(false);

  useEffect(() => {
    getLastSyncAt().then(setLastSyncAt).catch(() => {});
  }, []);

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setError(null);
    try {
      await runSync();
      const ts = await getLastSyncAt();
      setLastSyncAt(ts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
      syncingRef.current = false;
    }
  }, []);

  // Sync once on startup
  useEffect(() => { sync(); }, []);

  return (
    <SyncContext.Provider value={{ syncing, lastSyncAt, error, sync }}>
      {children}
    </SyncContext.Provider>
  );
}

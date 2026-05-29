'use client';
import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ConfirmDialog from '../../components/ConfirmDialog';

type DiscoverResponse = { name: string; version: string; requiresToken: boolean };

export default function SettingsPage() {
  const qc = useQueryClient();
  const [testing, setTesting]       = useState(false);
  const [result, setResult]         = useState<{ ok: boolean; msg: string } | null>(null);
  const [exporting, setExporting]   = useState(false);
  const [importing, setImporting]   = useState(false);
  const [backupMsg, setBackupMsg]   = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: discover } = useQuery<DiscoverResponse>({
    queryKey: ['discover'],
    queryFn: async () => {
      const res = await fetch('/api/proxy/discover');
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    retry: false,
  });

  async function testConnection() {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch('/api/proxy/health');
      if (res.ok) {
        setResult({ ok: true, msg: `Connected to "${discover?.name ?? 'server'}" — API is healthy.` });
      } else {
        setResult({ ok: false, msg: `Server returned ${res.status}.` });
      }
    } catch {
      setResult({ ok: false, msg: 'Could not reach the API.' });
    } finally {
      setTesting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setBackupMsg(null);
    try {
      const res = await fetch('/api/proxy/backup');
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'home-inventory-backup.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setBackupMsg({ ok: false, msg: e instanceof Error ? e.message : 'Export failed' });
    } finally {
      setExporting(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    e.target.value = '';
  }

  async function confirmRestore() {
    if (!pendingFile) return;
    const file = pendingFile;
    setPendingFile(null);
    setImporting(true);
    setBackupMsg(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/proxy/restore', { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setBackupMsg({ ok: true, msg: `Restored: ${data.catalogues} catalogues, ${data.items} items, ${data.images} images.` });
      qc.invalidateQueries();
    } catch (e) {
      setBackupMsg({ ok: false, msg: e instanceof Error ? e.message : 'Restore failed' });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold mb-4">Settings</h1>

      <div className="card p-5 mb-4 space-y-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Server</h2>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Name</span>
          <span className="font-medium">{discover?.name ?? '—'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">API version</span>
          <span className="font-medium">{discover?.version ?? '—'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Web version</span>
          <span className="font-medium">{process.env.NEXT_PUBLIC_APP_VERSION}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Auth</span>
          <span className="font-medium">{discover ? (discover.requiresToken ? 'JWT required' : 'Open') : '—'}</span>
        </div>
        <p className="text-xs text-gray-400 pt-1">
          API URL is configured via the <code className="bg-gray-100 px-1 rounded">API_URL</code> environment variable in Docker Compose.
        </p>
      </div>

      <button onClick={testConnection} disabled={testing} className="btn-primary w-full mb-4">
        {testing ? 'Testing…' : 'Test Connection'}
      </button>

      {result && (
        <p className={`mb-4 text-sm px-3 py-2 rounded-lg ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {result.msg}
        </p>
      )}

      <div className="card p-5 space-y-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Backup & Restore</h2>
        <p className="text-xs text-gray-400">
          Export all data and images as a ZIP file, or restore from a previous backup.
          Restore is a full wipe-and-replace — all existing data will be deleted.
        </p>
        <div className="flex gap-3">
          <button onClick={handleExport} disabled={exporting || importing} className="btn-primary flex-1">
            {exporting ? 'Exporting…' : 'Export Backup'}
          </button>
          <label className={`btn-secondary flex-1 text-center cursor-pointer ${importing || exporting ? 'opacity-50 pointer-events-none' : ''}`}>
            {importing ? 'Restoring…' : 'Import Backup'}
            <input ref={fileInputRef} type="file" accept=".zip" className="hidden" onChange={handleFileSelect} />
          </label>
        </div>
        {backupMsg && (
          <p className={`text-sm px-3 py-2 rounded-lg ${backupMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {backupMsg.msg}
          </p>
        )}
      </div>

      {pendingFile && (
        <ConfirmDialog
          message={`Restore from "${pendingFile.name}"? This will wipe all existing data and replace it with the backup contents.`}
          confirmLabel="Restore"
          onConfirm={confirmRestore}
          onCancel={() => setPendingFile(null)}
        />
      )}
    </div>
  );
}

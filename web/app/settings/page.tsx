'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

type DiscoverResponse = { name: string; version: string; requiresToken: boolean };

export default function SettingsPage() {
  const [testing, setTesting] = useState(false);
  const [result, setResult]   = useState<{ ok: boolean; msg: string } | null>(null);

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
          <span className="text-gray-500">Version</span>
          <span className="font-medium">{discover?.version ?? '—'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Auth</span>
          <span className="font-medium">{discover ? (discover.requiresToken ? 'Token required' : 'Open') : '—'}</span>
        </div>
        <p className="text-xs text-gray-400 pt-1">
          API URL and token are configured via the <code className="bg-gray-100 px-1 rounded">API_URL</code> and{' '}
          <code className="bg-gray-100 px-1 rounded">API_TOKEN</code> environment variables in Docker Compose.
        </p>
      </div>

      <button onClick={testConnection} disabled={testing} className="btn-primary w-full">
        {testing ? 'Testing…' : 'Test Connection'}
      </button>

      {result && (
        <p className={`mt-3 text-sm px-3 py-2 rounded-lg ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {result.msg}
        </p>
      )}
    </div>
  );
}

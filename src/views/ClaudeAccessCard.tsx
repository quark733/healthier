import React, { useEffect, useState } from 'react';
import { t } from '../i18n';
import { formatCivilLong } from '../i18n/format';
import { api } from '../lib/api';
import { SectionCard } from './DataCards';

/**
 * Settings: the read key that lets Claude read this account's data over MCP (server/mcp.ts).
 * Made here, shown once as the connector address, replaceable and revocable. Read-only.
 */
export function ClaudeAccessCard({ demo }: { demo: boolean }) {
  const [state, setState] = useState<{ hasKey: boolean; createdAt: string | null } | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (demo) return;
    api<{ hasKey: boolean; createdAt: string | null }>('/api/mcp-key').then(setState).catch(() => setState({ hasKey: false, createdAt: null }));
  }, [demo]);

  const make = async () => {
    setBusy(true);
    try {
      const r = await api<{ key: string }>('/api/mcp-key', { method: 'POST' });
      setUrl(`${window.location.origin}/mcp/${r.key}`);
      setState({ hasKey: true, createdAt: new Date().toISOString() });
    } finally {
      setBusy(false);
    }
  };
  const revoke = async () => {
    setBusy(true);
    try {
      await api('/api/mcp-key', { method: 'DELETE' });
      setUrl(null);
      setState({ hasKey: false, createdAt: null });
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <SectionCard title={t('data.claude.title')} hint={t('data.claude.hint')}>
      <div className="px-5 pt-1 pb-5 space-y-3">
        {demo ? (
          <p className="text-caption text-zinc-500">{t('data.claude.demo')}</p>
        ) : (
          <>
            <p className="text-caption text-zinc-300">
              {state?.hasKey
                ? t('data.claude.on', { date: state.createdAt ? formatCivilLong(state.createdAt.slice(0, 10)) : '' })
                : t('data.claude.off')}
            </p>
            {url && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                <p className="text-caption text-amber-200">{t('data.claude.once')}</p>
                <code className="block break-all text-note text-zinc-200 bg-zinc-900 rounded p-2">{url}</code>
                <button type="button" onClick={copy} className="rounded-lg bg-zinc-100 text-zinc-900 px-3 py-1.5 text-caption font-medium">
                  {t('data.claude.copy', { copied: copied ? 'yes' : 'no' })}
                </button>
                <ol className="list-decimal pl-4 text-caption text-zinc-400 space-y-0.5">
                  <li>{t('data.claude.step1')}</li>
                  <li>{t('data.claude.step2')}</li>
                  <li>{t('data.claude.step3')}</li>
                </ol>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={make} className="rounded-lg border border-zinc-600 px-3 py-1.5 text-caption text-zinc-200 disabled:opacity-40">
                {t('data.claude.make', { has: state?.hasKey ? 'yes' : 'no' })}
              </button>
              {state?.hasKey && (
                <button type="button" disabled={busy} onClick={revoke} className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-caption text-rose-300 disabled:opacity-40">
                  {t('data.claude.revoke')}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </SectionCard>
  );
}

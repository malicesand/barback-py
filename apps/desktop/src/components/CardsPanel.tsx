import { useEffect, useState } from 'react';
import { type Card, type DcimFolder } from '../global.d.ts'


function formatBytes(n?: number | null) {
  if (n == null) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)} ${u[i]}`;
}

export default function CardsPanel() {
  const [cards, setCards] = useState<Card[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({}); // volume_path -> busy
  const [loadingFolders, setLoadingFolders] = useState<Record<string, boolean>>({}); // dcim_path -> loading
  const [foldersByDcim, setFoldersByDcim] = useState<Record<string, DcimFolder[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({}); // dcim_path -> expanded

  useEffect(() => {
     const off = window.pybridge.onPythonEvent((msg: any) => {
      switch (msg?.type) {
        case 'dcim_snapshot':
        case 'cards/snapshot':
          setCards(Array.isArray(msg.cards) ? msg.cards : []);
          return;
        
        case 'rename_started':
          if (msg.volume_path) {
            setBusy(b => ({ ...b, [msg.volume_path]: true }));
          }
          return;
        
        case 'rename_finished':
          if (msg.volume_path) {
            setBusy(({ [msg.volume_path]: _, ...rest }) => rest);
          }
          return;

        case 'cards/list_dcim': {
          const dcim = msg.dcim_path as string;
          const folders = (msg.folders ?? []) as DcimFolder[];
          setFoldersByDcim(prev => ({ ...prev, [dcim]: folders }));
          setLoadingFolders(prev => {
            const { [dcim]: _, ...rest } = prev;
            return rest;
          });
          setExpanded(prev => ({ ...prev, [dcim]: true }));
          return;
        }

        case 'error':
          console.warn('Python error:', msg.message ?? msg.detail ?? msg);
          return;

        default:
          return;
      } 
  });

  // Initial fetch (support new + legacy)
  window.pybridge.sendToPython({ cmd: 'cards/snapshot' }).catch(() => {});
  window.pybridge.sendToPython({ cmd: 'list_dcim' }).catch(() => {});

  // Surface stderr for debugging
  const offErr = window.pybridge.onPythonStderr?.((chunk) => {
    if (chunk) console.debug('[py:stderr]', chunk);
  }) ?? (() => {});

  return () => { off(); offErr(); };
}, []);

  useEffect(() => {
  return window.pybridge.onPythonStderr((line) => {
    console.log('[py:stderr]', line); // check DevTools console
  });
}, []);

  // Actions 
  const runRename = (c: Card) =>
    window.pybridge.sendToPython({ cmd: 'run_rename', volume_path: c.volume_path});

  const ignore = (c: Card) =>
    window.pybridge.sendToPython({ cmd: 'mark_ignored', volume_name: c.volume_name });

  const toggleOrLoadFolders = (c: Card) => {
    const dcim = c.dcim_path;
    // If already loaded, just toggle for visibility 
    if (foldersByDcim[dcim]) {
      setExpanded(e => ({ ...e, [dcim]: !e[dcim] }));

      return;
    }
    // Otherwise fetch from Python
    setLoadingFolders(m => ({ ...m, [dcim]: true }));
    window.pybridge
      .sendToPython({
        cmd: 'cards/list_dcim',
        dcim_path: dcim,
        include_counts: true,
        request_id: dcim, 
      })
      .catch(() => {
        setLoadingFolders(m => {
          const { [dcim]: _, ...rest } = m;
          return rest;
        });
      });
  };

   return (
    <div style={{ padding: 12 }}>
      <h3>Connected Cards (DCIM)</h3>
      {cards.length === 0 && <div>No cards detected.</div>}

      <div style={{
        display: 'grid',
        gap: 12,
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))'
      }}>
        {cards.map(c => {
          const isLoading = !!loadingFolders[c.dcim_path];
          const isExpanded = !!expanded[c.dcim_path];
          const folders = foldersByDcim[c.dcim_path];

          return (
            <div key={c.volume_path}
                 style={{ border: '1px solid #999', borderRadius: 8, padding: 12 }}>
              <div style={{ fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span>{c.volume_name}</span>
                {typeof c.folder_count === 'number' && (
                  <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.7 }}>
                    {c.folder_count} folder{c.folder_count === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }} title={c.dcim_path}>
                {c.dcim_path}
              </div>

              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => toggleOrLoadFolders(c)} disabled={isLoading}>
                  {isLoading
                    ? 'Loading DCIM…'
                    : folders
                      ? (isExpanded ? 'Hide folders' : 'Show folders')
                      : 'Show folders'}
                </button>

                <button onClick={() => runRename(c)} disabled={!!busy[c.volume_path]}>
                  {busy[c.volume_path] ? 'Renaming…' : 'Run rename'}
                </button>

                <button onClick={() => ignore(c)}>Ignore</button>
              </div>

              {/* Folder list */}
              {isExpanded && folders && (
                <div style={{
                  marginTop: 10,
                  padding: 8,
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)'
                }}>
                  {folders.length === 0 && (
                    <div style={{ opacity: 0.7 }}>No folders inside DCIM.</div>
                  )}
                  {folders.map(f => (
                    <div key={f.path} style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(140px,1fr) 100px 120px 180px',
                      gap: 8,
                      padding: '6px 0',
                      borderBottom: '1px dashed rgba(255,255,255,0.1)'
                    }}>
                      <span>{f.name}</span>
                      <span>{typeof f.file_count === 'number' ? `${f.file_count} files` : '—'}</span>
                      <span>{formatBytes(f.bytes)}</span>
                      <span style={{ opacity: 0.7 }}>
                        {new Date(f.mtime * 1000).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

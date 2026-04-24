'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

// ── Design tokens (matches War Room) ──────────────────────────────────────────
const BG     = '#F8F9FB';
const CARD   = '#FFFFFF';
const BORDER = '#E5E7EB';
const SHADOW = '0 1px 4px rgba(0,0,0,0.07)';
const TEXT   = '#111827';
const MUTED  = '#6B7280';
const G_GREEN = '#16A34A';
const G_BLUE  = '#2563EB';
const G_RED   = '#DC2626';
const INDIGO  = '#6366F1';
const AMBER   = '#D97706';

// Status → badge config
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  winner:             { label: '🏆 Winner',          color: G_GREEN, bg: '#F0FDF4' },
  gaining_traction:   { label: '📈 Gaining Traction', color: INDIGO,  bg: '#EEF2FF' },
  needs_reinforcement:{ label: '🔧 Reinforce',        color: AMBER,   bg: '#FFFBEB' },
  waiting_for_index:  { label: '⏳ Indexing',          color: MUTED,   bg: '#F9FAFB' },
  stalled:            { label: '📉 Stalled',           color: G_RED,   bg: '#FEF2F2' },
  new:                { label: '🆕 New',               color: G_BLUE,  bg: '#EFF6FF' },
};

const MOVE_CONFIG: Record<string, { label: string; color: string }> = {
  mark_winner:    { label: 'Top Performer',    color: G_GREEN },
  expand_cluster: { label: 'Expand Cluster',   color: INDIGO },
  reinforce:      { label: 'Reinforce',        color: AMBER },
  hold:           { label: 'Monitor',          color: MUTED },
  kill:           { label: 'Deprioritise',     color: G_RED },
};

const TREND_ICON: Record<string, string> = {
  rising: '📈', falling: '📉', stable: '➡️', unknown: '⏳',
};

const EVO_ICON: Record<string, string> = {
  winner: '🏆', gaining_traction: '📈', building: '🔨', stalled: '📉', killed: '💀',
};

export default function PilotViewPage() {
  const params = useParams();
  const tenantId = params?.tenantId as string;

  const [data,         setData]         = useState<any>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [evoRunning,   setEvoRunning]   = useState(false);
  const [cycleRunning, setCycleRunning] = useState(false);
  const [expandingCluster, setExpandingCluster] = useState<string | null>(null);
  const [reinforcingPage,  setReinforcingPage]  = useState<string | null>(null);
  const [clusterProgress,  setClusterProgress]  = useState<Record<string, any>>({});
  const [activeTab,    setActiveTab]    = useState<'overview'|'clusters'|'pages'|'feed'|'repair'>('overview');
  const [fixingLinks,  setFixingLinks]  = useState(false);
  const [fixLinksMsg,  setFixLinksMsg]  = useState<string | null>(null);
  const [gscSyncing,   setGscSyncing]   = useState(false);
  const [gscSyncMsg,   setGscSyncMsg]   = useState<string | null>(null);
  const [gscJustLinked, setGscJustLinked] = useState(false);
  const [imgScanning,  setImgScanning]  = useState(false);
  const [imgScanMsg,   setImgScanMsg]   = useState<string | null>(null);

  // Detect ?gscConnected=true from OAuth callback redirect
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('gscConnected') === 'true') {
        setGscJustLinked(true);
        setActiveTab('repair');
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/admin/seo/evolution-loop?tenantId=${tenantId}`, { cache: 'no-store' });
      if (res.ok) setData(await res.json());
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const runEvolutionLoop = async () => {
    setEvoRunning(true);
    try {
      await fetch('/api/admin/seo/sync-page-metrics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      const res = await fetch('/api/admin/seo/evolution-loop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      await res.json();
      await load();
    } catch {}
    finally { setEvoRunning(false); }
  };

  const runSeoCycle = async () => {
    setCycleRunning(true);
    try {
      await fetch('/api/admin/seo/autonomous-cycle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
    } catch {}
    finally { setCycleRunning(false); }
  };

  const executeCluster = async (clusterGroupId: string) => {
    setExpandingCluster(clusterGroupId);
    try {
      const res = await fetch('/api/admin/seo/execute-cluster', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, clusterGroupId }),
      });
      const d = await res.json();
      setClusterProgress(prev => ({ ...prev, [clusterGroupId]: d.plan }));
      await load();
    } catch {}
    finally { setExpandingCluster(null); }
  };

  const reinforcePage = async (keyword: string) => {
    setReinforcingPage(keyword);
    try {
      await fetch('/api/admin/seo/reinforce-page', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, clusterId: keyword }),
      });
      await load();
    } catch {}
    finally { setReinforcingPage(null); }
  };

  const runFixLinks = async () => {
    setFixingLinks(true);
    setFixLinksMsg(null);
    try {
      const res = await fetch('/api/admin/seo/fix-links', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      const d = await res.json();
      setFixLinksMsg(d.message || `${d.linked} pages queued for re-publish`);
    } catch (e: any) { setFixLinksMsg('Error: ' + e.message); }
    finally { setFixingLinks(false); }
  };

  const runGscSync = async () => {
    setGscSyncing(true);
    setGscSyncMsg(null);
    try {
      const res = await fetch('/api/admin/gsc/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      const d = await res.json();
      if (d.needsAuth) {
        setGscSyncMsg('GSC not connected — click Connect Search Console first');
      } else {
        setGscSyncMsg(d.message || `Synced ${d.synced} pages`);
        await load();
      }
    } catch (e: any) { setGscSyncMsg('Error: ' + e.message); }
    finally { setGscSyncing(false); }
  };

  const runImageScan = async () => {
    setImgScanning(true);
    setImgScanMsg(null);
    try {
      const res = await fetch('/api/admin/seo/scan-images', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      const d = await res.json();
      setImgScanMsg(d.message || `Scanned ${d.scanned} pages`);
      await load();
    } catch (e: any) { setImgScanMsg('Error: ' + e.message); }
    finally { setImgScanning(false); }
  };

  // ── Computed ─────────────────────────────────────────────────────────────────
  const winners     = data?.winners     || [];
  const expanding   = data?.expanding   || [];
  const reinforcing = data?.reinforcing || [];
  const holding     = data?.holding     || [];
  const waitingIdx  = data?.waitingIndex || [];
  const killed      = data?.killed      || [];
  const allPublished = data?.allPublished || [];
  const groups      = data?.clusterGroups || [];
  const feed        = data?.activityLog  || [];
  const liveCount   = data?.liveCount    || 0;
  const draftCount  = data?.draftCount   || 0;

  // Compute top next moves
  const nextMoves: Array<{ type: string; label: string; subtext: string; action: () => void; actionLabel: string }> = [];
  const topExpand   = [...expanding].sort((a, b) => (b.pageScore || 0) - (a.pageScore || 0))[0];
  const topReinforce = reinforcing[0];
  const unlinked    = allPublished.filter((c: any) => !c.liveUrl).length;

  if (topExpand) nextMoves.push({
    type: 'expand',
    label: `Expand "${topExpand.keyword}"`,
    subtext: `Score ${topExpand.pageScore}/100 — ${topExpand.pageMetrics?.trend === 'rising' ? 'rising trend' : 'gaining traction'}, position ${topExpand.pageMetrics?.avgPosition?.toFixed(0) ?? '—'}`,
    action: () => topExpand.clusterGroupId && executeCluster(topExpand.clusterGroupId),
    actionLabel: '🚀 Expand Cluster',
  });
  if (topReinforce) nextMoves.push({
    type: 'reinforce',
    label: `Reinforce "${topReinforce.keyword}"`,
    subtext: topReinforce.nextMoveReason || 'Indexed but low impressions — needs content upgrade',
    action: () => reinforcePage(topReinforce.keyword),
    actionLabel: '🔧 Reinforce Page',
  });
  if (unlinked > 3) nextMoves.push({
    type: 'links',
    label: `${unlinked} pages need internal links`,
    subtext: 'Improve cluster authority by connecting support pages',
    action: runFixLinks,
    actionLabel: '🔗 Fix Links',
  });
  if (draftCount > 0 && nextMoves.length < 3) nextMoves.push({
    type: 'draft',
    label: `${draftCount} pages ready to publish`,
    subtext: 'Run a cycle to push draft clusters to live',
    action: runSeoCycle,
    actionLabel: '🚀 Run Cycle',
  });

  const isRunning = liveCount > 0 || draftCount > 0;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: MUTED, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div>
        <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>✈️</div>
        <div style={{ fontSize: 14 }}>Loading Pilot View…</div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', background: BG, minHeight: '100vh', padding: '0 0 60px' }}>

      {/* ── TOP BAR ───────────────────────────────────────────────────────────── */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, letterSpacing: -0.3 }}>
              ✈️ AI Pilot — <span style={{ color: INDIGO }}>{data?.clientName || tenantId}</span>
            </div>
            <div style={{ fontSize: 11, color: MUTED, marginTop: 1, display: 'flex', gap: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: isRunning ? G_GREEN : MUTED, display: 'inline-block' }} />
                {isRunning ? 'Running' : 'Standby'}
              </span>
              <span>{liveCount} live pages</span>
              {draftCount > 0 && <span>{draftCount} drafts queued</span>}
              {data?.lastPublished && <span>Last cycle: {new Date(data.lastPublished).toLocaleDateString()}</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Link href={`/admin/${tenantId}/war-room`} style={{ fontSize: 11, color: MUTED, textDecoration: 'none', padding: '6px 12px', borderRadius: 6, border: `1px solid ${BORDER}` }}>
            ← War Room
          </Link>
          <button onClick={runEvolutionLoop} disabled={evoRunning} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', cursor: evoRunning ? 'wait' : 'pointer', background: evoRunning ? '#F1F3F4' : INDIGO, color: evoRunning ? MUTED : '#fff', fontSize: 12, fontWeight: 600 }}>
            {evoRunning ? '⚙️ Evaluating…' : '⚙️ Run Evolution'}
          </button>
          <button onClick={runSeoCycle} disabled={cycleRunning} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', cursor: cycleRunning ? 'wait' : 'pointer', background: cycleRunning ? '#F1F3F4' : G_GREEN, color: cycleRunning ? MUTED : '#fff', fontSize: 12, fontWeight: 700 }}>
            {cycleRunning ? 'Running…' : '🚀 Run Cycle'}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 20px 0' }}>

        {/* ── TAB NAV ────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 18, background: CARD, borderRadius: 8, border: `1px solid ${BORDER}`, padding: 4, width: 'fit-content' }}>
          {(['overview', 'clusters', 'pages', 'feed', 'repair'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: activeTab === tab ? (tab === 'repair' ? G_RED : INDIGO) : 'transparent',
              color: activeTab === tab ? '#fff' : MUTED,
              fontSize: 12, fontWeight: activeTab === tab ? 700 : 500, textTransform: 'capitalize',
            }}>{tab === 'repair' ? '🔧 Repair Bay' : tab}</button>
          ))}
        </div>

        {/* ── OVERVIEW TAB ───────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (<>

          {/* System Snapshot */}
          <div style={{ borderRadius: 10, background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW, marginBottom: 16, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 }}>System Snapshot</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 12 }}>
              {[
                { label: 'Winners',         count: winners.length,     color: G_GREEN, icon: '🏆' },
                { label: 'Gaining Traction',count: expanding.length,   color: INDIGO,  icon: '📈' },
                { label: 'Reinforcing',     count: reinforcing.length, color: AMBER,   icon: '🔧' },
                { label: 'Waiting Index',   count: waitingIdx.length,  color: MUTED,   icon: '⏳' },
                { label: 'Ready to Expand', count: expanding.length,   color: INDIGO,  icon: '🚀' },
                { label: 'Stalled',         count: killed.length,      color: G_RED,   icon: '📉' },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: 'center', padding: '10px 6px', borderRadius: 8, background: '#FAFAFA', border: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: 22 }}>{s.icon}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color, marginTop: 2 }}>{s.count}</div>
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 2, lineHeight: 1.3 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Next Moves */}
          {nextMoves.length > 0 && (
            <div style={{ borderRadius: 10, background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW, marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>🧠 Next Moves</div>
                  <div style={{ fontSize: 11, color: MUTED }}>Nova's recommendations</div>
                </div>
              </div>
              <div style={{ padding: '0 20px 16px' }}>
                {nextMoves.map((move, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < nextMoves.length - 1 ? `1px solid ${BORDER}` : 'none', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>
                        <span style={{ color: MUTED, marginRight: 6 }}>{i + 1}.</span>
                        {move.label}
                      </div>
                      <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{move.subtext}</div>
                    </div>
                    <button
                      onClick={move.action}
                      disabled={!!expandingCluster || !!reinforcingPage}
                      style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${BORDER}`, background: CARD, color: TEXT, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {move.actionLabel}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cluster Quick View */}
          {groups.length > 0 && (
            <div style={{ borderRadius: 10, background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW, marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>📦 Cluster Overview</div>
              </div>
              <div style={{ padding: '12px 20px' }}>
                {groups.map((g: any, i: number) => {
                  const groupPages = allPublished.filter((c: any) => c.clusterGroupId === g.id);
                  const draftPages = (data?.allPublished ? [] : []);
                  const pubCount   = groupPages.length;
                  const progress   = clusterProgress[g.id] || [];
                  const icon = EVO_ICON[g.evolutionState] || '📦';
                  return (
                    <div key={i} style={{ padding: '10px 0', borderBottom: i < groups.length - 1 ? `1px solid ${BORDER}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>{icon}</span> {g.label}
                          <span style={{ fontSize: 9, fontWeight: 600, color: MUTED, background: '#F3F4F6', borderRadius: 99, padding: '1px 7px', textTransform: 'capitalize' }}>{g.evolutionState || 'building'}</span>
                        </div>
                        <div style={{ fontSize: 10, color: MUTED, marginTop: 3 }}>{g.primaryKeyword} • {pubCount} live pages</div>
                        {/* Progress dots */}
                        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                          {(progress.length > 0 ? progress : groupPages.slice(0, 6)).map((_: any, j: number) => (
                            <div key={j} style={{ width: 10, height: 10, borderRadius: '50%', background: _.status === 'published' || _.status === 'Live' ? G_GREEN : _.status === 'queued' ? AMBER : BORDER }} title={_.keyword} />
                          ))}
                          {pubCount === 0 && <div style={{ fontSize: 10, color: MUTED, fontStyle: 'italic' }}>No published pages yet</div>}
                        </div>
                      </div>
                      <button
                        onClick={() => executeCluster(g.id)}
                        disabled={expandingCluster === g.id}
                        style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${BORDER}`, background: expandingCluster === g.id ? '#F1F3F4' : CARD, color: expandingCluster === g.id ? MUTED : INDIGO, fontSize: 11, fontWeight: 600, cursor: expandingCluster === g.id ? 'wait' : 'pointer' }}
                      >
                        {expandingCluster === g.id ? 'Queuing…' : '▶ Execute'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>)}

        {/* ── CLUSTERS TAB ───────────────────────────────────────────────────── */}
        {activeTab === 'clusters' && (
          <div style={{ borderRadius: 10, background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>📦 All Clusters</div>
            </div>
            <div style={{ padding: '12px 20px' }}>
              {groups.length === 0 && <div style={{ color: MUTED, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No clusters yet — run the intelligence pipeline from the War Room.</div>}
              {groups.map((g: any, i: number) => {
                const groupPages = allPublished.filter((c: any) => c.clusterGroupId === g.id);
                const clProg = clusterProgress[g.id] || groupPages;
                return (
                  <div key={i} style={{ marginBottom: 20, padding: 14, borderRadius: 8, border: `1px solid ${BORDER}`, background: '#FAFAFA' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{EVO_ICON[g.evolutionState] || '📦'} {g.label}</div>
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{g.primaryKeyword} • {g.intent} • gap {g.gapScore || 0}/100</div>
                        {g.angle && <div style={{ fontSize: 10, color: INDIGO, marginTop: 3, fontStyle: 'italic' }}>"{g.angle}"</div>}
                      </div>
                      <button onClick={() => executeCluster(g.id)} disabled={expandingCluster === g.id} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: INDIGO, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        {expandingCluster === g.id ? 'Queuing…' : '▶ Execute Cluster'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(clProg.length > 0 ? clProg : groupPages).map((p: any, j: number) => {
                        const isLive = ['published', 'Live'].includes(p.status);
                        const sc = STATUS_CONFIG[p.performanceStatus || ''] || STATUS_CONFIG['new'];
                        return (
                          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 6, background: CARD, border: `1px solid ${BORDER}` }}>
                            <span style={{ fontSize: 14 }}>{isLive ? '✅' : p.status === 'draft' ? '⏳' : '⬜'}</span>
                            <span style={{ fontSize: 11, fontWeight: 500, color: TEXT, flex: 1 }}>{p.keyword}</span>
                            <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'capitalize', color: MUTED }}>{p.role || 'supporting'}</span>
                            {isLive && p.pageScore != null && <span style={{ fontSize: 10, fontWeight: 700, color: p.pageScore > 70 ? G_GREEN : p.pageScore > 40 ? AMBER : G_RED }}>{p.pageScore}/100</span>}
                            {isLive && p.performanceStatus && <span style={{ fontSize: 9, fontWeight: 700, color: sc.color, background: sc.bg, padding: '2px 6px', borderRadius: 99 }}>{sc.label}</span>}
                            {p.liveUrl && <a href={p.liveUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: G_BLUE }}>↗</a>}
                          </div>
                        );
                      })}
                      {clProg.length === 0 && groupPages.length === 0 && (
                        <div style={{ fontSize: 11, color: MUTED, fontStyle: 'italic', padding: '4px 0' }}>No pages yet — click Execute Cluster</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── PAGES TAB ──────────────────────────────────────────────────────── */}
        {activeTab === 'pages' && (
          <div style={{ borderRadius: 10, background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>📄 All Pages</div>
              <div style={{ fontSize: 11, color: MUTED }}>{allPublished.length} published pages</div>
            </div>
            {allPublished.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: MUTED, fontSize: 13 }}>No published pages yet. Execute a cluster to start.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB', borderBottom: `1px solid ${BORDER}` }}>
                      {['Keyword', 'Score', 'Indexed', 'Imps', 'Pos', 'Trend', 'Status', 'Next Move', ''].map((h, i) => (
                        <th key={i} style={{ padding: '8px 12px', textAlign: 'left', color: MUTED, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...allPublished].sort((a, b) => (b.pageScore || 0) - (a.pageScore || 0)).map((c: any, i: number) => {
                      const sc = STATUS_CONFIG[c.performanceStatus || ''] || STATUS_CONFIG['new'];
                      const mv = MOVE_CONFIG[c.nextMove || ''] || MOVE_CONFIG['hold'];
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
                          <td style={{ padding: '8px 12px', maxWidth: 220 }}>
                            <div style={{ fontWeight: 500, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.keyword}</div>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <span style={{ fontWeight: 700, color: (c.pageScore || 0) > 70 ? G_GREEN : (c.pageScore || 0) > 40 ? AMBER : G_RED }}>{c.pageScore ?? '—'}</span>
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>{c.pageMetrics?.indexed ? '✅' : '⏳'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', color: MUTED }}>{c.pageMetrics?.impressions ?? '—'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', color: MUTED }}>{c.pageMetrics?.avgPosition ? c.pageMetrics.avgPosition.toFixed(1) : '—'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>{TREND_ICON[c.pageMetrics?.trend || 'unknown']}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: sc.color, background: sc.bg, padding: '2px 7px', borderRadius: 99, whiteSpace: 'nowrap' }}>{sc.label}</span>
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: mv.color }}>{mv.label}</span>
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {c.nextMove === 'reinforce' && (
                              <button onClick={() => reinforcePage(c.keyword)} disabled={reinforcingPage === c.keyword} style={{ padding: '3px 9px', borderRadius: 5, border: `1px solid ${BORDER}`, background: '#FFFBEB', color: AMBER, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                                {reinforcingPage === c.keyword ? '…' : 'Reinforce'}
                              </button>
                            )}
                            {c.nextMove === 'expand_cluster' && c.clusterGroupId && (
                              <button onClick={() => executeCluster(c.clusterGroupId)} disabled={!!expandingCluster} style={{ padding: '3px 9px', borderRadius: 5, border: `1px solid ${BORDER}`, background: '#EEF2FF', color: INDIGO, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                                {expandingCluster ? '…' : 'Expand'}
                              </button>
                            )}
                            {c.liveUrl && <a href={c.liveUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: G_BLUE, marginLeft: 4 }}>↗</a>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── REPAIR BAY TAB ─────────────────────────────────────────────────── */}
        {activeTab === 'repair' && (
          <div>
            {/* GSC connected success banner */}
            {gscJustLinked && (
              <div style={{ marginBottom: 14, borderRadius: 10, background: '#F0FDF4', border: '1px solid #86EFAC', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>✅</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: G_GREEN }}>Google Search Console connected!</div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Click "Run GSC Sync" to pull real indexing data for all your pages.</div>
                </div>
              </div>
            )}

            {/* Header */}
            <div style={{ borderRadius: 10, background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW, marginBottom: 16, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>🔧 Repair Bay</div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>
                    Fully autonomous — runs every 24h. Links, image health, and GSC repairs happen automatically. Buttons below force an immediate run.
                  </div>
                  <div style={{ marginTop: 5, display: 'inline-flex', alignItems: 'center', gap: 5, background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 99, padding: '2px 10px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: G_GREEN, display: 'inline-block', animation: 'pulse 2s infinite' }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: G_GREEN }}>Drone active — next sweep in 24h</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a
                    href={`/api/admin/gsc/auth?tenantId=${tenantId}`}
                    style={{ padding: '7px 14px', borderRadius: 7, border: `1px solid #BAE6FD`, background: '#EFF6FF', color: G_BLUE, fontSize: 10, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    📡 Connect GSC
                  </a>
                  <button onClick={runGscSync} disabled={gscSyncing} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${BORDER}`, background: CARD, color: MUTED, fontSize: 10, fontWeight: 600, cursor: gscSyncing ? 'wait' : 'pointer' }}>
                    {gscSyncing ? '📡 Syncing…' : '📡 GSC Now'}
                  </button>
                  <button onClick={runImageScan} disabled={imgScanning} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${BORDER}`, background: CARD, color: MUTED, fontSize: 10, fontWeight: 600, cursor: imgScanning ? 'wait' : 'pointer' }}>
                    {imgScanning ? '🖼️ Scanning…' : '🖼️ Scan Now'}
                  </button>
                  <button onClick={runFixLinks} disabled={fixingLinks} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${BORDER}`, background: CARD, color: MUTED, fontSize: 10, fontWeight: 600, cursor: fixingLinks ? 'wait' : 'pointer' }}>
                    {fixingLinks ? '🔗 Linking…' : '🔗 Links Now'}
                  </button>
                </div>
              </div>
              {fixLinksMsg && (
                <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: '#F0FDF4', border: '1px solid #86EFAC', fontSize: 11, color: G_GREEN, fontWeight: 600 }}>
                  ✅ {fixLinksMsg}
                </div>
              )}
              {gscSyncMsg && (
                <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, background: '#EFF6FF', border: '1px solid #BAE6FD', fontSize: 11, color: G_BLUE, fontWeight: 600 }}>
                  📡 {gscSyncMsg}
                </div>
              )}
              {imgScanMsg && (
                <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, background: '#FAF5FF', border: '1px solid #DDD6FE', fontSize: 11, color: '#7C3AED', fontWeight: 600 }}>
                  🖼️ {imgScanMsg}
                </div>
              )}
            </div>

            {/* Phase status tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
              {[
                { icon: '🔗', label: 'Internal Links',  status: allPublished.filter((c: any) => !c.internalLinksPreGenerated).length > 0 ? 'action' : 'ok', detail: `${allPublished.filter((c: any) => !c.internalLinksPreGenerated).length} pages unlinked` },
                { icon: '📡', label: 'GSC Inspection',  status: 'pending', detail: 'Connect GSC to activate' },
                { icon: '🧹', label: 'Crawl Errors',    status: 'pending', detail: 'Connect GSC to activate' },
                { icon: '🏎️', label: 'Core Web Vitals', status: 'pending', detail: 'Connect GSC to activate' },
                (() => {
                  const broken = allPublished.filter((c: any) => c.imageHealth?.status === 'broken').length;
                  const unscanned = allPublished.filter((c: any) => !c.imageHealth?.lastScanned).length;
                  return {
                    icon: '🖼️',
                    label: 'Image Health',
                    status: broken > 0 ? 'action' : unscanned === allPublished.length ? 'pending' : 'ok',
                    detail: broken > 0 ? `${broken} pages have broken images` : unscanned > 0 ? 'Click Scan Images' : 'All images healthy',
                  };
                })()
              ].map((tile, i) => (
                <div key={i} style={{ borderRadius: 10, background: CARD, border: `1px solid ${tile.status === 'action' ? '#FCA5A5' : tile.status === 'ok' ? '#86EFAC' : BORDER}`, padding: '14px 16px', boxShadow: SHADOW }}>
                  <div style={{ fontSize: 22 }}>{tile.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, marginTop: 6 }}>{tile.label}</div>
                  <div style={{ fontSize: 11, color: tile.status === 'action' ? G_RED : tile.status === 'ok' ? G_GREEN : MUTED, marginTop: 3 }}>
                    {tile.status === 'action' ? '⚠️ ' : tile.status === 'ok' ? '✅ ' : '⏳ '}{tile.detail}
                  </div>
                </div>
              ))}
            </div>

            {/* Page-level repair table */}
            <div style={{ borderRadius: 10, background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW, overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>📋 Page Health — {allPublished.length} live pages</div>
                <div style={{ fontSize: 10, color: MUTED }}>GSC data activates after connecting Search Console</div>
              </div>
              {allPublished.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: MUTED, fontSize: 13 }}>No published pages yet.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: '#F9FAFB', borderBottom: `1px solid ${BORDER}` }}>
                        {['Page', 'Internal Links', 'Images', 'Indexed', 'GSC Errors', 'Repair'].map((h, i) => (
                          <th key={i} style={{ padding: '8px 14px', textAlign: 'left', color: MUTED, fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allPublished.map((c: any, i: number) => {
                        const hasLinks     = c.internalLinksPreGenerated;
                        const linksPayload = c.internalLinksPayload ? JSON.parse(c.internalLinksPayload) : [];
                        const repairStatus = c.repairStatus || 'healthy';
                        return (
                          <tr key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
                            <td style={{ padding: '9px 14px', maxWidth: 220 }}>
                              <div style={{ fontWeight: 500, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.keyword}</div>
                              {c.slug && <div style={{ fontSize: 9, color: MUTED }}>/{c.slug}</div>}
                            </td>
                            <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                              {hasLinks
                                ? <span style={{ color: G_GREEN, fontWeight: 600 }}>✅ {linksPayload.length} links</span>
                                : <span style={{ color: G_RED, fontWeight: 600 }}>⚠️ None</span>
                              }
                            </td>
                            {/* Images column */}
                            <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                              {!c.imageHealth?.lastScanned
                                ? <span style={{ color: MUTED, fontSize: 10 }}>Scan to check</span>
                                : c.imageHealth.broken > 0
                                  ? <span style={{ color: G_RED, fontWeight: 600 }}>⚠️ {c.imageHealth.broken}/{c.imageHealth.total}</span>
                                  : <span style={{ color: G_GREEN, fontWeight: 600 }}>✅ {c.imageHealth.total} ok</span>
                              }
                            </td>
                            <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                              {c.pageMetrics?.indexed ? '✅' : <span style={{ color: MUTED }}>⏳</span>}
                            </td>
                            <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                              <span style={{ color: MUTED, fontSize: 10 }}>—</span>
                            </td>
                            <td style={{ padding: '9px 14px' }}>
                              {repairStatus === 'repairing'
                                ? <span style={{ fontSize: 9, background: '#FFFBEB', color: AMBER, borderRadius: 99, padding: '2px 8px', fontWeight: 700 }}>🔃 Queued</span>
                                : c.imageHealth?.broken > 0
                                  ? <span style={{ fontSize: 9, background: '#FEF2F2', color: G_RED, borderRadius: 99, padding: '2px 8px', fontWeight: 700 }}>🖼️ Broken Images</span>
                                  : !hasLinks
                                    ? <span style={{ fontSize: 9, background: '#FEF2F2', color: G_RED, borderRadius: 99, padding: '2px 8px', fontWeight: 700 }}>Needs Links</span>
                                    : <span style={{ fontSize: 9, background: '#F0FDF4', color: G_GREEN, borderRadius: 99, padding: '2px 8px', fontWeight: 700 }}>✅ Healthy</span>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* GSC Coming Soon banner */}
            <div style={{ marginTop: 16, borderRadius: 10, background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 28 }}>📡</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: G_BLUE }}>Google Search Console — Phase 2</div>
                <div style={{ fontSize: 11, color: '#3B82F6', marginTop: 3 }}>Once connected, this bay will pull real indexing errors, crawl issues, and page-level GSC data. Each problem page will get an automated repair queued.</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'feed' && (
          <div style={{ borderRadius: 10, background: CARD, border: `1px solid ${BORDER}`, boxShadow: SHADOW, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>📡 Activity Feed</div>
            </div>
            <div style={{ padding: '12px 20px' }}>
              {feed.length === 0 && <div style={{ color: MUTED, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No activity yet — run a cycle or evolution loop to start the feed.</div>}
              {feed.map((ev: any, i: number) => {
                const typeConfig: Record<string, { icon: string; color: string }> = {
                  page_published:      { icon: '🚀', color: G_GREEN },
                  gaining_traction:    { icon: '📈', color: INDIGO },
                  reinforcement_queued:{ icon: '🔧', color: AMBER },
                  cluster_expanded:    { icon: '🚀', color: INDIGO },
                  marked_winner:       { icon: '🏆', color: G_GREEN },
                };
                const tc = typeConfig[ev.type] || { icon: '📌', color: MUTED };
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0', borderBottom: i < feed.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                    <span style={{ fontSize: 16, lineHeight: 1 }}>{tc.icon}</span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: tc.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{ev.type?.replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: 12, color: TEXT, marginTop: 1 }}>{ev.message}</div>
                      <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{ev.at ? new Date(ev.at).toLocaleString() : ''}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

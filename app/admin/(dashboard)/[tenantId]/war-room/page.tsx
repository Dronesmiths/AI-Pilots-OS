'use client';

/**
 * app/admin/(dashboard)/[tenantId]/war-room/page.tsx
 *
 * Tenant War Room — surfaces the full Nova intelligence loop:
 *   Voice Insights → Action Proposals → Approve → Execute
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams }                         from 'next/navigation';
import Link                                  from 'next/link';
// confetti removed — replaced with drone animation

const BG      = '#F8F9FA';
const CARD    = '#FFFFFF';
const BORDER  = '#E8EAED';
const TEXT    = '#202124';
const MUTED   = '#80868B';

/**
 * Converts raw milliseconds to a live countdown string.
 * Called every second via countdownTick. Shows HH:MM:SS once under 1h,
 * "Xh Ym" under 24h, "Xd Yh" for longer spans.
 */
function fmtLiveMs(ms: number): string {
  if (ms <= 0) return 'any moment';
  const secs  = Math.floor(ms / 1000);
  const mins  = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days >= 1)  return `${days}d ${hours % 24}h`;
  if (hours >= 1) return `${hours}h ${mins % 60}m`;
  const m = mins % 60;
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
const FONT    = "'Google Sans','Roboto','Google Sans','Roboto','Inter',sans-serif";
const SHADOW  = '0 1px 3px rgba(60,64,67,.15), 0 1px 2px rgba(60,64,67,.10)';
const SHADOW_MD = '0 2px 6px rgba(60,64,67,.12), 0 1px 4px rgba(60,64,67,.08)';

// Google brand colors
const G_BLUE   = '#1A73E8';
const G_GREEN  = '#34A853';
const G_RED    = '#D93025';
const G_YELLOW = '#F9AB00';
const G_PURPLE = '#9334E6';
const G_TEAL   = '#00897B';

const TYPE_COLOR: Record<string, string> = {
  faq_gap:             G_YELLOW,
  missed_opportunity:  G_RED,
  conversion_signal:   G_GREEN,
  negative_pattern:    G_RED,
  high_intent_cluster: G_PURPLE,
};

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  pending:   { color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
  approved:  { color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0' },
  executing: { color: '#1D4ED8', bg: '#EFF6FF', border: '#BFDBFE' },
  completed: { color: '#065F46', bg: '#ECFDF5', border: '#A7F3D0' },
  rejected:  { color: '#991B1B', bg: '#FEF2F2', border: '#FECACA' },
  failed:    { color: '#991B1B', bg: '#FEF2F2', border: '#FECACA' },
};

type Insight       = { _id: string; type: string; title: string; description: string; confidence: number; recommendedAction: string; reviewed: boolean; createdAt: string; };
type Action        = { _id: string; type: string; title: string; description: string; status: string; confidence: number; createdAt: string; result?: any; };
type Call          = { _id: string; from: string; to: string; source: string; outcome: string; durationSec: number; summary: string; };
type VoiceDecision = { _id: string; type: string; message: string; level: string; metadata: any; timestamp: string; };

export default function TenantWarRoomPage() {
  const params   = useParams();
  const tenantId = (params?.tenantId as string) ?? '';

  const [wrData,        setWrData]        = useState<any>(null);
  const [insights,      setInsights]      = useState<Insight[]>([]);
  const [actions,       setActions]       = useState<Action[]>([]);
  const [calls,         setCalls]         = useState<Call[]>([]);
  const [voiceDecisions,setVoiceDecisions]= useState<VoiceDecision[]>([]);
  const [clientVoice,   setClientVoice]   = useState<any>(null);
  const [loading,       setLoading]       = useState(true);
  const [analyzing,     setAnalyzing]     = useState(false);
  const [seoRunning,    setSeoRunning]    = useState(false);
  const [dronesLaunched, setDronesLaunched] = useState(false);
  const [seoMsg,        setSeoMsg]        = useState<string | null>(null);
  const [seoQueued,     setSeoQueued]     = useState<number | null>(null);
  const [discoveryRunning, setDiscoveryRunning] = useState(false);
  const [discoveryMsg,  setDiscoveryMsg]  = useState<string | null>(null);
  const [intelRunning,  setIntelRunning]  = useState(false);
  const [intelData,     setIntelData]     = useState<any>(null);
  const [evolutionData, setEvolutionData] = useState<any>(null);
  const [evoRunning,    setEvoRunning]    = useState(false);
  const [pipelineData,  setPipelineData]  = useState<any>(null);
  const [upcomingData,  setUpcomingData]  = useState<any>(null);
  const [provisioning,  setProvisioning]  = useState(false);
  const [provisionMsg,  setProvisionMsg]  = useState<string | null>(null);
  const [globalIntel,   setGlobalIntel]   = useState<any>(null);
  const [compIntel,     setCompIntel]     = useState<any>(null);
  const [compKeyword,   setCompKeyword]   = useState('');
  const [compRunning,   setCompRunning]   = useState(false);
  const [busy,          setBusy]          = useState<string | null>(null);
  const [error,         setError]         = useState<string | null>(null);
  const [repairPhase,   setRepairPhase]   = useState<string | null>(null);
  const [repairMsg,     setRepairMsg]     = useState<Record<string, string>>({});
  const [countdownTick, setCountdownTick] = useState(0);   // increments every second
  const fetchedAtRef = useRef<number>(Date.now());          // when upcoming data last arrived
  const [launchingCategory, setLaunchingCategory] = useState<string | null>(null);
  const [launchSuccess, setLaunchSuccess] = useState<string | null>(null);
  const [showDrones, setShowDrones] = useState(false);

  const load = useCallback(() => {
    setLoading(false); setError(null);
    try {
      Promise.allSettled([
        fetch(`/api/admin/${tenantId}/war-room`,                               { cache: 'no-store' }).then(async r => { if (r.ok) setWrData(await r.json()) }),
        fetch(`/api/admin/voice/analyze?tenantId=${tenantId}`,                 { cache: 'no-store' }).then(async r => { if (r.ok) setInsights((await r.json()).insights ?? []) }),
        fetch(`/api/admin/actions/propose?tenantId=${tenantId}`,               { cache: 'no-store' }).then(async r => { if (r.ok) setActions((await r.json()).actions ?? []) }),
        fetch(`/api/admin/voice/calls?tenantId=${tenantId}&limit=8`,           { cache: 'no-store' }).then(async r => { if (r.ok) setCalls((await r.json()).calls ?? []) }),
        fetch(`/api/admin/voice/decisions?tenantId=${tenantId}&limit=8`,       { cache: 'no-store' }).then(async r => { if (r.ok) setVoiceDecisions((await r.json()).decisions ?? []) }),
        fetch(`/api/admin/voice/provision-client-voice?tenantId=${tenantId}`,  { cache: 'no-store' }).then(async r => { if (r.ok) setClientVoice((await r.json()).clientVoice) }),
      ]);
    } catch (e: any) { setError(e.message); }

    // ── Background: slower intelligence + drone data loads in parallel ──────
    // These update state as they complete without blocking the initial render.
    Promise.allSettled([
      fetch(`/api/admin/global-intelligence/ingest?tenantId=${tenantId}`,   { cache: 'no-store' })
        .then(r => r.ok && r.json()).then(d => d && setGlobalIntel(d)).catch(() => {}),
      fetch(`/api/admin/competitive/snapshot?tenantId=${tenantId}`,         { cache: 'no-store' })
        .then(r => r.ok && r.json()).then(d => d && setCompIntel(d)).catch(() => {}),
      fetch(`/api/admin/seo/intelligence-pipeline?tenantId=${tenantId}`,    { cache: 'no-store' })
        .then(r => r.ok && r.json()).then(d => d && setIntelData(d)).catch(() => {}),
      fetch(`/api/admin/seo/evolution-loop?tenantId=${tenantId}`,           { cache: 'no-store' })
        .then(r => r.ok && r.json()).then(d => d && setEvolutionData(d)).catch(() => {}),
      fetch(`/api/admin/seo/pipeline-status?tenantId=${tenantId}`,          { cache: 'no-store' })
        .then(r => r.ok && r.json()).then(d => d && setPipelineData(d)).catch(() => {}),
      fetch(`/api/admin/seo/upcoming?tenantId=${tenantId}`,                 { cache: 'no-store' })
        .then(r => r.ok && r.json()).then(d => {
          if (!d) return;
          setUpcomingData(d);
          fetchedAtRef.current = Date.now();
          const everRan = d.upcoming?.some((item: any) => item.lastSeen && item.lastSeen !== 'never');
          if (everRan) {
            setDronesLaunched(true);
            localStorage.setItem(`drones_launched_${tenantId}`, '1');
          }
        }).catch(() => {}),
    ]);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  // ── Live pipeline — auto-refresh every 10 seconds ──────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/admin/seo/pipeline-status?tenantId=${tenantId}`, { cache: 'no-store' });
        if (res.ok) setPipelineData(await res.json());
      } catch {}
    };
    const t = setInterval(poll, 10000);
    return () => clearInterval(t);
  }, [tenantId]);

  // ── Next Launches — auto-refresh every 30 seconds ──────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/admin/seo/upcoming?tenantId=${tenantId}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setUpcomingData(data);
          fetchedAtRef.current = Date.now();  // stamp when we got fresh numbers
          // Auto-detect past launch: if any drone has ever logged activity, mark as launched
          const everRan = data.upcoming?.some((item: any) => item.lastSeen && item.lastSeen !== 'never');
          if (everRan) {
            setDronesLaunched(true);
            localStorage.setItem(`drones_launched_${tenantId}`, '1');
          }
        }
      } catch {}
    };
    poll(); // run immediately on mount
    const t = setInterval(poll, 30000);
    return () => clearInterval(t);
  }, [tenantId]);

  // ── Live countdown tick — fires every second ────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setCountdownTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  /* ── Actions ──────────────────────────────────────────────────── */
  // Load dronesLaunched from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`drones_launched_${tenantId}`);
    if (stored === '1') setDronesLaunched(true);
  }, [tenantId]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    await fetch('/api/admin/voice/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId }) });
    await load(); setAnalyzing(false);
  };

  const propose = async (insightId: string) => {
    setBusy(insightId);
    await fetch('/api/admin/actions/propose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ insightId }) });
    await load(); setBusy(null);
  };

  const approve = async (actionId: string) => {
    setBusy(actionId);
    await fetch('/api/admin/actions/propose', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId, status: 'approved' }) });
    await load(); setBusy(null);
  };

  const reject = async (actionId: string) => {
    setBusy(actionId);
    await fetch('/api/admin/actions/propose', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId, status: 'rejected' }) });
    await load(); setBusy(null);
  };

  const execute = async (actionId: string) => {
    setBusy(actionId);
    await fetch('/api/admin/actions/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId }) });
    await load(); setBusy(null);
  };

  const runSeoCycle = async () => {
    setSeoRunning(true); setSeoMsg(null); setSeoQueued(null);
    try {
      const res = await fetch('/api/admin/seo/autonomous-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      const d = await res.json().catch(() => ({}));
      setSeoQueued(d?.queued ?? null);
      setSeoMsg(d?.message ?? (res.ok ? 'SEO cycle triggered.' : 'Check server logs.'));
    } catch {
      setSeoMsg('Could not reach SEO cycle endpoint.');
      setSeoQueued(null);
    } finally {
      setSeoRunning(false);
    }
  };

  const runDiscovery = async () => {
    setDiscoveryRunning(true); setDiscoveryMsg(null);
    try {
      const res = await fetch('/api/admin/seo/run-discovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.success) {
        setDiscoveryMsg(`✓ ${d.discovered} keyword clusters loaded (${d.source === 'dataforseo' ? 'DataForSEO' : 'AI fallback'}). Added to queue.`);
        setSeoQueued(null); setSeoMsg(null);
        await runSeoCycle();
      } else {
        setDiscoveryMsg(`⚠ ${d.error || 'Discovery failed'}`);
      }
    } catch {
      setDiscoveryMsg('⚠ Could not reach discovery endpoint.');
    } finally {
      setDiscoveryRunning(false);
    }
  };

  const runEvolutionLoop = async () => {
    setEvoRunning(true);
    try {
      // Step 1: sync GSC/DFS metrics into pageMetrics fields
      await fetch('/api/admin/seo/sync-page-metrics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      // Step 2: run decision engine
      const res = await fetch('/api/admin/seo/evolution-loop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.success) {
        await load(); // Refresh the panel
      }
    } catch { /* silent */ }
    finally { setEvoRunning(false); }
  };

  const runRepairPhase = async (phase: 'links' | 'images' | 'gsc') => {
    setRepairPhase(phase);
    setRepairMsg(prev => ({ ...prev, [phase]: '' }));
    try {
      const res = await fetch('/api/admin/seo/repair-phase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, phase }),
      });
      const d = await res.json().catch(() => ({}));
      setRepairMsg(prev => ({ ...prev, [phase]: d?.message ?? (res.ok ? 'Done ✅' : 'Failed — check logs.') }));
      // Refresh the upcoming panel so counts update
      const up = await fetch(`/api/admin/seo/upcoming?tenantId=${tenantId}`, { cache: 'no-store' });
      if (up.ok) setUpcomingData(await up.json());
    } catch {
      setRepairMsg(prev => ({ ...prev, [phase]: 'Could not reach repair endpoint.' }));
    } finally {
      setRepairPhase(null);
    }
  };

  const provisionClientVoice = async (agentName?: string) => {
    setProvisioning(true); setProvisionMsg(null);
    try {
      const res = await fetch('/api/admin/voice/provision-client-voice', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tenantId, agentName }),
      });
      const d = await res.json();
      setProvisionMsg(d?.message ?? (res.ok ? 'Client voice agent provisioned!' : 'Failed — check logs.'));
      await load();
    } catch {
      setProvisionMsg('Could not provision client voice agent.');
    } finally {
      setProvisioning(false);
    }
  };

  const handleLaunchDrones = async (category: string): Promise<number> => {
    setLaunchingCategory(category);
    try {
      const r = await fetch('/api/admin/seo/launch-drones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: tenantId, category })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to launch drones');

      setShowDrones(true);
      setTimeout(() => setShowDrones(false), 3000);
      setLaunchSuccess(data.message);
      setTimeout(() => setLaunchSuccess(null), 5000);

      // Refresh pipeline data
      fetch(`/api/admin/seo/pipeline-status?tenantId=${tenantId}`, { cache: 'no-store' })
        .then(r => r.json())
        .then(d => { if (d) setPipelineData(d); });

      return data.injected ?? 0;
    } catch (e: any) {
      alert(e.message);
      return 0;
    } finally {
      setLaunchingCategory(null);
    }
  };

  // Targets per category for a full 60-day calendar
  const CATEGORY_TARGETS: Record<string, number> = {
    qa: 180, location: 30, blog: 30, cornerstone: 8
  };

  // Self-healing master launch: fires all 4, retries any category that came up short (up to 3 cycles total)
  const handleLaunchAll = async () => {
    const categories = ['qa', 'location', 'blog', 'cornerstone'];
    const totals: Record<string, number> = { qa: 0, location: 0, blog: 0, cornerstone: 0 };
    const MAX_CYCLES = 3;

    for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
      const shortfall = categories.filter(cat => totals[cat] < CATEGORY_TARGETS[cat]);
      if (shortfall.length === 0) break;

      setLaunchSuccess(`🔄 Cycle ${cycle}/${MAX_CYCLES} — filling: ${shortfall.map(c => c.toUpperCase()).join(', ')}...`);

      for (const cat of shortfall) {
        const added = await handleLaunchDrones(cat);
        totals[cat] += added;
        await new Promise(res => setTimeout(res, 1500));
      }
    }

    // Final status summary
    const summary = categories.map(cat => {
      const got = totals[cat];
      const target = CATEGORY_TARGETS[cat];
      return `${cat.toUpperCase()}: ${got}/${target}${got >= target ? ' ✅' : ' ⚠️'}`;
    }).join(' · ');

    setLaunchSuccess(`🚁 Launch complete — ${summary}`);
    setTimeout(() => setLaunchSuccess(null), 10000);

    // Final pipeline refresh
    fetch(`/api/admin/seo/pipeline-status?tenantId=${tenantId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d) setPipelineData(d); });
  };


  /* ── Loading / error states ───────────────────────────────────── */
  if (loading) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontFamily: FONT }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${BORDER}`, borderTop: `3px solid ${G_BLUE}`, borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ fontSize: 14, color: MUTED }}>Loading War Room…</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ textAlign: 'center', background: CARD, borderRadius: 12, padding: '32px 40px', boxShadow: SHADOW_MD }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 14, color: G_RED, marginBottom: 16 }}>{error}</div>
        <button onClick={load} style={{ padding: '8px 20px', borderRadius: 6, border: `1px solid ${G_BLUE}`, background: '#fff', color: G_BLUE, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>Retry</button>
      </div>
    </div>
  );

  const pending  = actions.filter(a => a.status === 'pending').length;
  const approved = actions.filter(a => a.status === 'approved').length;

  /* ── shared micro-styles ─────────────────────────────────────── */
  const chip = (label: string, color: string, bg: string, border: string) => (
    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 12, fontSize: 10, fontWeight: 600, color, background: bg, border: `1px solid ${border}`, letterSpacing: 0.2 }}>{label}</span>
  );

  const panelHeader = (title: string, subtitle?: string, action?: React.ReactNode) => (
    <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <span style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{title}</span>
        {subtitle && <span style={{ fontSize: 11, color: MUTED, marginLeft: 8 }}>{subtitle}</span>}
      </div>
      {action}
    </div>
  );

  const gBtn = (label: string, onClick: () => void, disabled = false, variant: 'primary'|'secondary'|'success'|'danger' = 'primary') => {
    const styles = {
      primary:   { bg: G_BLUE,  color: '#fff' },
      secondary: { bg: '#fff',  color: G_BLUE },
      success:   { bg: G_GREEN, color: '#fff' },
      danger:    { bg: G_RED,   color: '#fff' },
    }[variant];
    return (
      <button onClick={onClick} disabled={disabled} style={{ padding: '7px 16px', borderRadius: 6, border: variant === 'secondary' ? `1px solid ${G_BLUE}` : 'none', cursor: disabled ? 'not-allowed' : 'pointer', background: disabled ? '#F1F3F4' : styles.bg, color: disabled ? MUTED : styles.color, fontSize: 12, fontWeight: 500, letterSpacing: 0.25, transition: 'box-shadow .15s', boxShadow: disabled ? 'none' : SHADOW }}>{label}</button>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: FONT, padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: G_BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⚔️</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: TEXT }}>War Room</div>
            <div style={{ fontSize: 11, color: MUTED, fontFamily: 'monospace' }}>{tenantId}</div>
          </div>
          {wrData?.isPlatformOwner && <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: G_PURPLE, background: '#F3E8FF', border: '1px solid #DDD6FE' }}>👑 Platform Owner</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {wrData?.stats?.openAnomalies > 0 && (
            <span style={{ fontSize: 12, color: G_RED, background: '#FEF2F2', padding: '3px 10px', borderRadius: 12, border: '1px solid #FECACA' }}>⚠️ {wrData.stats.openAnomalies} alerts</span>
          )}
          <button onClick={load} style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid ${BORDER}`, background: CARD, color: MUTED, cursor: 'pointer', fontSize: 12, boxShadow: SHADOW }}>↻ Refresh</button>
          <Link href={`/admin/${tenantId}/pilot-view`} style={{ padding: '6px 14px', borderRadius: 6, border: `1px solid #6366F1`, background: '#EEF2FF', color: '#6366F1', cursor: 'pointer', fontSize: 12, fontWeight: 600, textDecoration: 'none', boxShadow: SHADOW }}>📊 Pilot View</Link>
        </div>
      </div>



      {/* ── NEXT LAUNCHES ────────────────────────────────────────────── */}
      {upcomingData?.upcoming?.length > 0 && (
        <div style={{ borderRadius: 12, background: CARD, boxShadow: SHADOW, border: `1px solid ${BORDER}`, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14 }}>🔮</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Next Launches</span>
              <span style={{ fontSize: 10, color: MUTED }}>predictive</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {upcomingData?.mode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 99, padding: '3px 10px' }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#0369A1', textTransform: 'uppercase', letterSpacing: 0.8 }}>Mode: {upcomingData.mode.name}</span>
                  <span style={{ fontSize: 9, color: '#64748B' }}>·</span>
                  <span style={{ fontSize: 9, color: '#64748B' }}>{upcomingData.mode.description}</span>
                </div>
              )}
              <span style={{ fontSize: 10, color: MUTED }}>refreshes every 30s</span>
            </div>
          </div>
          {/* ── Drone cards: clean and simple ─────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 1, background: BORDER }}>
            {upcomingData.upcoming.filter((item: any) => item.stage !== 'repair').map((item: any, i: number) => {
              return (
                <div key={i} style={{ background: CARD, padding: '14px 16px' }}>
                  {/* Header: icon + label */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: 18 }}>{item.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: item.color }}>{item.label}</span>
                  </div>

                  {/* Queue count */}
                  <div style={{ fontSize: 28, fontWeight: 800, color: TEXT, lineHeight: 1, marginBottom: 6 }}>
                    {item.queued > 0 ? item.queued : '—'}
                    <span style={{ fontSize: 11, fontWeight: 500, color: MUTED, marginLeft: 4 }}>queued</span>
                  </div>

                  {/* Next publish */}
                  <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>
                    {item.queued > 0 && item.nextIn
                      ? <>Publishes on schedule</>
                      : <span style={{ fontStyle: 'italic' }}>Idle</span>
                    }
                  </div>

                  {/* Sample keywords */}
                  {item.samples && item.samples.length > 0 && (
                    <div style={{ paddingTop: 8, borderTop: '1px solid #F3F4F6' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 }}>
                        Pages in Queue (Sample)
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {item.samples.map((s: any, si: number) => (
                          <div key={si} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 6px', borderRadius: 4, background: '#F9FAFB', border: '1px solid #F3F4F6', gap: 6 }}>
                            {s.liveUrl ? (
                              <a href={s.liveUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#2563EB', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }} title={s.keyword}>
                                ↗ {s.keyword}
                              </a>
                            ) : (
                              <div style={{ fontSize: 10, color: TEXT, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.keyword}>
                                {s.keyword}
                              </div>
                            )}
                            <span style={{ fontSize: 8, fontWeight: 700, color: '#D97706', background: '#FFFBEB', padding: '1px 4px', borderRadius: 4, textTransform: 'uppercase' }}>
                              {s.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

          </div>

          {/* ── Drone Launch Control Panel ────────────── */}
          <div key="launch-control" style={{ background: CARD, borderTop: `1px solid ${BORDER}` }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>🚀</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Launch Controls</span>
                </div>
                {/* ── MASTER LAUNCH: 1 press fills the full 60-day calendar ── */}
                <button
                  disabled={!!launchingCategory}
                  onClick={handleLaunchAll}
                  style={{
                    padding: '8px 18px', borderRadius: 8,
                    background: launchingCategory ? '#6366F1' : 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                    color: '#fff', border: 'none', cursor: launchingCategory ? 'not-allowed' : 'pointer',
                    fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
                    boxShadow: '0 2px 8px rgba(79,70,229,0.4)', transition: 'all 0.2s',
                    opacity: launchingCategory ? 0.7 : 1
                  }}
                >
                  {launchingCategory ? (
                    <><div style={{ width: 10, height: 10, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    Launching {launchingCategory?.toUpperCase()}...</>
                  ) : (
                    <>🚁 LAUNCH FULL CALENDAR</>
                  )}
                </button>
              </div>
              <div style={{ fontSize: 10, color: MUTED }}>1 press → 180 QA + 30 Location + 30 Blog + 8 Cornerstone Pillars → full 60-day calendar</div>
            </div>
            

            <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>

              {/* Button 1: Location & Services */}
              {(() => {
                const isLaunching = launchingCategory === 'location';
                const count = (pipelineData?.queued || []).filter((c: any) => c.category === 'location' || c.category === 'service').length;
                return (
                  <button disabled={isLaunching} onClick={() => handleLaunchDrones('location')}
                    style={{ padding: '12px', borderRadius: 8, border: '1px solid #FCD34D', background: '#FFFBEB',
                      cursor: isLaunching ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', gap: 6, transition: 'all 0.2s', opacity: isLaunching ? 0.7 : 1 }}>
                    <div style={{ fontSize: 18 }}>{isLaunching ? '⏳' : '📍'}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#D97706' }}>Location & Services</div>
                    <div style={{ fontSize: 9, color: '#92400E', textAlign: 'center', lineHeight: 1.4 }}>Geo pages → Jules Engine queue</div>
                    {count > 0 && (
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#065F46', padding: '2px 8px', background: '#D1FAE5', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                        {count} FEEDING CALENDAR
                      </div>
                    )}
                    <div style={{ fontSize: 9, fontWeight: 600, color: '#B45309', padding: '2px 8px', background: '#FEF3C7', borderRadius: 99 }}>
                      {isLaunching ? 'BOOTING...' : 'LAUNCH DRONES'}
                    </div>
                  </button>
                );
              })()}

              {/* Button 2: Blog Posts → PAA Daily Update Queue */}
              {(() => {
                const isLaunching = launchingCategory === 'blog';
                const count = (pipelineData?.queued || []).filter((c: any) => c.category === 'blog' || c.category === 'paa').length;
                return (
                  <button disabled={isLaunching} onClick={() => handleLaunchDrones('blog')}
                    style={{ padding: '12px', borderRadius: 8, border: '1px solid #A7F3D0', background: '#F0FDF4',
                      cursor: isLaunching ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
                    <div style={{ fontSize: 18 }}>{isLaunching ? '⏳' : '📝'}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>Blog Posts</div>
                    <div style={{ fontSize: 9, color: '#065F46', textAlign: 'center', lineHeight: 1.4 }}>PAA articles → Daily Update Queue</div>
                    {count > 0 && (
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#065F46', padding: '2px 8px', background: '#D1FAE5', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                        {count} FEEDING CALENDAR
                      </div>
                    )}
                    <div style={{ fontSize: 9, fontWeight: 600, color: '#047857', padding: '2px 8px', background: '#D1FAE5', borderRadius: 99 }}>
                      {isLaunching ? 'BOOTING...' : 'LAUNCH DRONES'}
                    </div>
                  </button>
                );
              })()}

              {/* Button 3: Cornerstone Pillars → Deep Cornerstone Pillars */}
              {(() => {
                const isLaunching = launchingCategory === 'cornerstone';
                const count = (pipelineData?.queued || []).filter((c: any) => c.category === 'cornerstone').length;
                return (
                  <button disabled={isLaunching} onClick={() => handleLaunchDrones('cornerstone')}
                    style={{ padding: '12px', borderRadius: 8, border: '1px solid #FECACA', background: '#FFF1F2',
                      cursor: isLaunching ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
                    <div style={{ fontSize: 18 }}>{isLaunching ? '⏳' : '🏛️'}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#DC2626' }}>Cornerstone Pillars</div>
                    <div style={{ fontSize: 9, color: '#991B1B', textAlign: 'center', lineHeight: 1.4 }}>4000+ word hubs → Deep Cornerstone Pillars</div>
                    {count > 0 && (
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#065F46', padding: '2px 8px', background: '#D1FAE5', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                        {count} PILLAR{count !== 1 ? 'S' : ''} SCHEDULED
                      </div>
                    )}
                    <div style={{ fontSize: 9, fontWeight: 600, color: '#B91C1C', padding: '2px 8px', background: '#FEE2E2', borderRadius: 99 }}>
                      {isLaunching ? 'BOOTING...' : 'LAUNCH DRONES'}
                    </div>
                  </button>
                );
              })()}

              {/* Button 4: LLM QA → LLM QA Manufacturing Queue */}
              {(() => {
                const isLaunching = launchingCategory === 'qa';
                const count = (pipelineData?.queued || []).filter((c: any) => c.category === 'qa').length;
                return (
                  <button disabled={isLaunching} onClick={() => handleLaunchDrones('qa')}
                    style={{ padding: '12px', borderRadius: 8, border: '1px solid #C7D2FE', background: '#EEF2FF',
                      cursor: isLaunching ? 'not-allowed' : 'pointer', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', gap: 6, transition: 'all 0.2s' }}>
                    <div style={{ fontSize: 18 }}>{isLaunching ? '⏳' : '🤖'}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#4F46E5' }}>LLM / QA Answers</div>
                    <div style={{ fontSize: 9, color: '#3730A3', textAlign: 'center', lineHeight: 1.4 }}>PAA questions → QA Manufacturing Queue</div>
                    {count > 0 && (
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#065F46', padding: '2px 8px', background: '#D1FAE5', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                        {count} FEEDING CALENDAR
                      </div>
                    )}
                    <div style={{ fontSize: 9, fontWeight: 600, color: '#4338CA', padding: '2px 8px', background: '#E0E7FF', borderRadius: 99 }}>
                      {isLaunching ? 'BOOTING...' : 'LAUNCH DRONES'}
                    </div>
                  </button>
                );
              })()}

            </div>
          </div>
        </div>
      )}


      {/* ── MASTER DEPLOYMENT CALENDAR ──────────────────────────────────────────── */}
      {(() => {
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - today.getDay());
        const calendarDays = Array.from({ length: 35 }).map((_, i) => {
          const d = new Date(startDate);
          d.setDate(startDate.getDate() + i);
          return d;
        });
        
        const scheduledItems = new Map();
        
        // Simple: every queued item has a scheduledTime from the DB — just plot it
        (pipelineData?.queued || []).forEach((c: any) => {
          if (!c.scheduledTime) return;
          const dateStr = new Date(c.scheduledTime).toISOString().split('T')[0];
          if (!scheduledItems.has(dateStr)) scheduledItems.set(dateStr, []);
          const isQa = ['qa', 'llm', 'paa'].includes(c.category);
          scheduledItems.get(dateStr).push({ ...c, isQa });
        });

        // Category color map
        const catStyle = (c: any) => {
          const cat = c.category || 'service';
          if (['qa', 'llm', 'paa'].includes(cat)) return { badge: '#6366F1', border: '#E2E8F0', bg: '#F8FAFC', label: 'LLM QA' };
          if (cat === 'blog')        return { badge: '#059669', border: '#A7F3D0', bg: '#F0FDF4', label: 'BLOG' };
          if (cat === 'cornerstone') return { badge: '#DC2626', border: '#FECACA', bg: '#FFF1F2', label: 'CORNERSTONE' };
          return { badge: '#D97706', border: '#FCD34D', bg: '#FFFBEB', label: (cat).toUpperCase() };
        };

        return (
          <div style={{ borderRadius: 12, background: CARD, boxShadow: SHADOW, border: `1px solid ${BORDER}`, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>🗓️</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Master Deployment Calendar</span>
                <span style={{ fontSize: 10, color: MUTED, background: '#F3F4F6', padding: '2px 8px', borderRadius: 99 }}>{(pipelineData?.queued || []).length} scheduled</span>
              </div>
              <span style={{ fontSize: 10, color: MUTED, fontWeight: 500 }}>Pace: 3 QA automated/day · 1 manual Location/48h</span>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', background: BORDER, gap: 1, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
                {/* Header row for days of week */}
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: MUTED, padding: '8px 4px', background: '#F8FAFC' }}>{day}</div>
                ))}
                
                {/* Calendar cells */}
                {calendarDays.map((date, i) => {
                  const isToday = date.toDateString() === today.toDateString();
                  const isCurrentMonth = date.getMonth() === today.getMonth();
                  const dateStr = date.toISOString().split('T')[0];
                  const rawItems = scheduledItems.get(dateStr) || [];
                  // Show blogs/locations/cornerstone FIRST, then QA
                  const items = [...rawItems].sort((a, b) => (a.isQa ? 1 : 0) - (b.isQa ? 1 : 0));
                  
                  return (
                    <div key={i} style={{ 
                      minHeight: 90, 
                      padding: 6, 
                      background: isToday ? '#EEF2FF' : '#fff', 
                    }}>
                      <div style={{ fontSize: 11, fontWeight: isToday ? 800 : 600, color: isCurrentMonth ? TEXT : '#9CA3AF', marginBottom: 4 }}>
                        {date.getDate()}
                        {date.getDate() === 1 ? ` ${date.toLocaleString('default', { month: 'short' })}` : ''}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {items.slice(0, 5).map((c: any, j: number) => {
                          const s = catStyle(c);
                          
                          return (
                            <div key={j} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 4, padding: '4px 5px', fontSize: 8, lineHeight: 1.2 }}>
                              <div style={{ color: s.badge, fontWeight: 800, marginBottom: 1, fontSize: 7 }}>{s.label}</div>
                              <div style={{ color: TEXT, fontWeight: 500, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.keyword}</div>
                            </div>
                          );
                        })}
                        {items.length > 5 && (
                          <div style={{ fontSize: 8, color: MUTED, fontWeight: 600, textAlign: 'center' }}>+{items.length - 5} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── LIVE PIPELINE ──────────────────────────────────────────── */}
      {(pipelineData?.totalQueued > 0 || pipelineData?.totalPublished > 0) && (
        <div style={{ borderRadius: 12, background: CARD, boxShadow: SHADOW, border: `1px solid ${BORDER}`, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16A34A', display: 'inline-block', boxShadow: '0 0 6px #16A34A' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Live Pipeline</span>
              {pipelineData.totalQueued > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#D97706', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 99, padding: '1px 8px' }}>
                  {pipelineData.totalQueued} queued
                </span>
              )}
              {pipelineData.totalPublished > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#16A34A', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 99, padding: '1px 8px' }}>
                  {pipelineData.totalPublished} live
                </span>
              )}
            </div>
            <span style={{ fontSize: 10, color: MUTED }}>auto-refreshes every 10s</span>
          </div>



          {/* Published rows — color-coded by drone */}
          {pipelineData.published?.length > 0 && (() => {
              // Drone color map — matches Next Launches cards
              const DRONE_COLORS: Record<string, { color: string; bg: string; border: string; label: string; icon: string }> = {
                service:      { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', label: 'LLM',         icon: '🧠' },
                location:     { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: 'GEO',         icon: '📍' },
                paa:          { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', label: 'QA',          icon: '🧠' },
                qa:           { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', label: 'QA',          icon: '🧠' },
                blog:         { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', label: 'BLOG',        icon: '📝' },
                cornerstone:  { color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', label: 'CORNERSTONE', icon: '🏛️' },
              };
              const DEFAULT_DRONE = { color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', label: 'OTHER', icon: '📄' };

              // Sort: cornerstone first, then blog, geo, llm
              const catOrder: Record<string, number> = { cornerstone: 0, blog: 1, location: 2, service: 3, paa: 4, qa: 5 };
              
              const grouped: Record<string, any[]> = {};
              for (const p of pipelineData.published) {
                  const cat = (p.category === 'paa' || p.category === 'qa') ? 'qa' : p.category;
                  if (!grouped[cat]) grouped[cat] = [];
                  if (grouped[cat].length < 5) grouped[cat].push(p);
              }

              const sortedCategories = Object.entries(grouped).sort(([catA], [catB]) => 
                  (catOrder[catA] ?? 99) - (catOrder[catB] ?? 99)
              );

              return (
                <div style={{ padding: '8px 20px 20px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12, marginTop: pipelineData.queued?.length > 0 ? 10 : 0 }}>✅ Live pages</div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                    {sortedCategories.map(([category, pages]) => {
                      const drone = DRONE_COLORS[category] || DEFAULT_DRONE;
                      return (
                        <div key={category} style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden', background: '#FAFAFA' }}>
                          <div style={{ background: drone.bg, borderBottom: `1px solid ${drone.border}`, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 14 }}>{drone.icon}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: drone.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{drone.label}</span>
                          </div>
                          <div style={{ padding: '4px 12px 12px' }}>
                            {pages.map((p: any, i: number) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < pages.length - 1 ? `1px dashed ${BORDER}` : 'none' }}>
                                <span style={{ fontSize: 12, color: TEXT, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '75%' }}>{p.keyword}</span>
                                {p.liveUrl ? (
                                  <a href={p.liveUrl} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: '#2563EB', fontWeight: 600, textDecoration: 'none' }}>View Live</a>
                                ) : (
                                  <span style={{ fontSize: 10, color: MUTED, fontStyle: 'italic' }}>Pending</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
        </div>
      )}

      {/* ── DISCOVER KEYWORDS ─────────────────────────────── */}
      <div style={{ borderRadius: 12, background: CARD, boxShadow: SHADOW, border: `1px solid ${BORDER}`, marginBottom: 16, overflow: 'hidden' }}>
        {panelHeader(
          '🔍 Keyword Discovery', 
          'DataForSEO Integration', 
          <button
            onClick={runDiscovery}
            disabled={discoveryRunning}
            style={{
              padding: '6px 12px', borderRadius: 6, border: `1px solid ${discoveryRunning ? BORDER : '#C7D2FE'}`,
              background: discoveryRunning ? '#F9FAFB' : '#EEF2FF',
              color: discoveryRunning ? MUTED : '#4F46E5',
              fontSize: 11, fontWeight: 700, cursor: discoveryRunning ? 'wait' : 'pointer'
            }}
          >
            {discoveryRunning ? '⚡ SCANNING...' : '🔍 DISCOVER NEW KEYWORDS'}
          </button>
        )}
        <div style={{ padding: '0 20px 20px' }}>
          {discoveryMsg && <div style={{ fontSize: 13, color: '#059669', marginBottom: 16 }}>{discoveryMsg}</div>}
          <div style={{ fontSize: 13, color: MUTED }}>
            This will fetch low-competition keywords for your niche using the DataForSEO API and add them to your queue.
          </div>
        </div>
      </div>
      {/* ── OPTIMIZATION LOOP ──────────────────────────────────────── */}
      {(() => {
        const hasPublished = evolutionData && (
          (evolutionData.winners?.length || 0) +
          (evolutionData.reinforcing?.length || 0) +
          (evolutionData.expanding?.length || 0) +
          (evolutionData.holding?.length || 0) > 0
        );
        if (!hasPublished && !evoRunning) return null;
        const trendIcon = (t: string) => t === 'rising' ? '📈' : t === 'falling' ? '📉' : t === 'stable' ? '➡️' : '⏳';
        const PageCard = ({ c }: { c: any }) => (
          <div style={{ padding: 10, borderRadius: 8, border: `1px solid ${BORDER}`, background: '#FAFAFA', marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: TEXT, marginBottom: 3, lineHeight: 1.3 }}>{c.keyword}</div>
            <div style={{ display: 'flex', gap: 10, fontSize: 10, color: MUTED, marginBottom: 3 }}>
              <span>{trendIcon(c.pageMetrics?.trend)} {c.pageMetrics?.impressions ?? 0} imps</span>
              <span>↗ {c.pageMetrics?.clicks ?? 0} clicks</span>
              <span>#{c.pageMetrics?.avgPosition ? c.pageMetrics.avgPosition.toFixed(0) : '—'}</span>
            </div>
            {c.nextMoveReason && <div style={{ fontSize: 9, color: '#6366F1', fontStyle: 'italic', lineHeight: 1.3 }}>{c.nextMoveReason}</div>}
            {c.reinforcementPlan?.actions?.length > 0 && !c.reinforcementPlan.applied && (
              <div style={{ marginTop: 4, fontSize: 9, color: '#D97706', fontWeight: 600 }}>
                Plan: {c.reinforcementPlan.actions.join(' · ')}
              </div>
            )}
          </div>
        );
        const Col = ({ title, icon, items, accent }: { title: string; icon: string; items: any[]; accent: string }) => (
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: accent, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>{icon}</span> {title}
              <span style={{ fontSize: 9, fontWeight: 500, color: MUTED, marginLeft: 4 }}>({items.length})</span>
            </div>
            {items.length === 0
              ? <div style={{ fontSize: 10, color: MUTED, fontStyle: 'italic' }}>None yet</div>
              : items.slice(0, 5).map((c: any, i: number) => <PageCard key={i} c={c} />)
            }
          </div>
        );
        return (
          <div style={{ borderRadius: 12, background: CARD, boxShadow: SHADOW, border: `1px solid ${BORDER}`, marginBottom: 16, overflow: 'hidden' }}>
            {panelHeader('🔄 Optimization Loop', 'publish → observe → reinforce → expand',
              <button
                onClick={runEvolutionLoop}
                disabled={evoRunning}
                style={{ padding: '7px 14px', borderRadius: 6, border: 'none', cursor: evoRunning ? 'wait' : 'pointer', background: evoRunning ? '#F1F3F4' : '#6366F1', color: evoRunning ? MUTED : '#fff', fontSize: 12, fontWeight: 600, boxShadow: SHADOW }}
              >
                {evoRunning ? '⚙️ Running…' : '⚙️ Run Evolution Loop'}
              </button>
            )}
            <div style={{ padding: '0 20px 20px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <Col title="Winners"    icon="🏆" items={evolutionData?.winners    || []} accent="#16A34A" />
              <Col title="Reinforcing" icon="🔧" items={evolutionData?.reinforcing || []} accent="#D97706" />
              <Col title="Expanding"  icon="🚀" items={evolutionData?.expanding  || []} accent="#6366F1" />
              <Col title="Holding"    icon="⏸"  items={evolutionData?.holding   || []} accent={MUTED}   />
            </div>
          </div>
        );
      })()}

      {/* ── VOICE INTELLIGENCE ─────────────────────────────────────── */}
      <div style={{ borderRadius: 12, background: CARD, boxShadow: SHADOW, border: `1px solid ${BORDER}`, marginBottom: 16, overflow: 'hidden' }}>
        {panelHeader('🧠 Nova Voice Intelligence', 'what Nova is seeing',
          <button onClick={runAnalysis} disabled={analyzing} style={{ padding: '7px 16px', borderRadius: 6, border: 'none', cursor: analyzing ? 'wait' : 'pointer', background: analyzing ? '#F1F3F4' : G_BLUE, color: analyzing ? MUTED : '#fff', fontSize: 12, fontWeight: 500, boxShadow: SHADOW }}>
            {analyzing ? 'Analyzing…' : '⚡ Run Analysis'}
          </button>
        )}
        {insights.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📡</div>
            No insights yet — click <strong style={{ color: G_BLUE }}>Run Analysis</strong> after calls are ingested.
          </div>
        ) : (
          insights.map((ins, i) => {
            const hasAction = actions.some(a => a.status !== 'rejected' && (a as any).insightId === ins._id);
            const tc = TYPE_COLOR[ins.type] ?? G_BLUE;
            return (
              <div key={ins._id} style={{ padding: '16px 20px', borderBottom: i < insights.length - 1 ? `1px solid ${BORDER}` : 'none', display: 'flex', gap: 14 }}>
                <div style={{ width: 4, borderRadius: 99, background: tc, alignSelf: 'stretch', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 4 }}>{ins.title}</div>
                  <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, marginBottom: 10 }}>{ins.description}</div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: MUTED }}>Confidence: <strong style={{ color: TEXT }}>{Math.round(ins.confidence * 100)}%</strong></span>
                    {!hasAction && ins.recommendedAction !== 'no_action' && (
                      <button onClick={() => propose(ins._id)} disabled={busy === ins._id} style={{ padding: '5px 14px', borderRadius: 6, border: `1px solid ${G_BLUE}`, cursor: 'pointer', background: '#fff', color: G_BLUE, fontSize: 11, fontWeight: 500 }}>
                        {busy === ins._id ? '…' : '→ Propose Action'}
                      </button>
                    )}
                    {hasAction && <span style={{ fontSize: 11, color: G_GREEN, fontWeight: 500 }}>✓ Action proposed</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── ACTION PROPOSALS ───────────────────────────────────────── */}
      <div style={{ borderRadius: 12, background: CARD, boxShadow: SHADOW, border: `1px solid ${BORDER}`, marginBottom: 16, overflow: 'hidden' }}>
        {panelHeader('⚡ Action Proposals', "Nova's suggested moves — you approve")}
        {actions.length === 0 ? (
          <div style={{ padding: '28px 20px', textAlign: 'center', color: MUTED, fontSize: 13 }}>No proposals yet — click <strong>Propose Action</strong> on an insight above.</div>
        ) : (
          actions.map((act, i) => {
            const ss  = STATUS_STYLE[act.status] ?? STATUS_STYLE.pending;
            const isBusy = busy === act._id;
            return (
              <div key={act._id} style={{ padding: '16px 20px', borderBottom: i < actions.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{act.title}</span>
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, color: ss.color, background: ss.bg, border: `1px solid ${ss.border}` }}>{act.status}</span>
                    </div>
                    <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, marginBottom: 8 }}>{act.description}</div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: MUTED }}>Confidence: <strong style={{ color: TEXT }}>{Math.round(act.confidence * 100)}%</strong></span>
                      {(act as any).trustScore > 0 && (
                        <span style={{ fontSize: 11, color: (act as any).trustScore >= 80 ? G_GREEN : (act as any).trustScore >= 60 ? G_YELLOW : G_RED, fontWeight: 500 }}>
                          Trust: {(act as any).trustScore}/100
                        </span>
                      )}
                      {(act as any).riskLevel && chip(
                        (act as any).riskLevel + ' risk',
                        (act as any).riskLevel === 'low' ? '#065F46' : (act as any).riskLevel === 'medium' ? '#92400E' : '#991B1B',
                        (act as any).riskLevel === 'low' ? '#ECFDF5' : (act as any).riskLevel === 'medium' ? '#FFFBEB' : '#FEF2F2',
                        (act as any).riskLevel === 'low' ? '#A7F3D0' : (act as any).riskLevel === 'medium' ? '#FDE68A' : '#FECACA',
                      )}
                      {(act as any).autoExecuted && <span style={{ fontSize: 11, color: G_PURPLE, fontWeight: 500 }}>🤖 Auto-executed</span>}
                    </div>
                    {act.result && (
                      <div style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, background: '#ECFDF5', border: '1px solid #A7F3D0', fontSize: 11, color: '#065F46' }}>
                        ✓ {(act.result as any).message}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0, paddingTop: 2 }}>
                    {act.status === 'pending' && (<>
                      {gBtn(isBusy ? '…' : '✓ Approve', () => approve(act._id), isBusy, 'success')}
                      <button onClick={() => reject(act._id)} disabled={isBusy} style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${BORDER}`, cursor: 'pointer', background: '#fff', color: MUTED, fontSize: 12 }}>Reject</button>
                    </>)}
                    {act.status === 'approved' && gBtn(isBusy ? 'Executing…' : '⚡ Execute', () => execute(act._id), isBusy, 'primary')}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>



      {/* ── COMPETITIVE INTELLIGENCE ─────────────────────────────── */}
      <div style={{ borderRadius: 12, background: CARD, boxShadow: SHADOW, border: `1px solid ${BORDER}`, overflow: 'hidden', marginBottom: 16 }}>
        {panelHeader('🔍 Competitive Intelligence', 'SERP · patterns · gaps · opportunities')}
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              value={compKeyword}
              onChange={e => setCompKeyword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && compKeyword.trim()) setCompRunning(true); }}
              placeholder="Enter keyword to analyze (e.g. 'bathroom remodel cost')"
              style={{ flex: 1, background: '#F8F9FA', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', fontSize: 13, color: TEXT, outline: 'none', fontFamily: FONT }}
            />
            <button
              id="run-competitive-analysis"
              disabled={!compKeyword.trim() || compRunning}
              onClick={async () => {
                if (!compKeyword.trim()) return;
                setCompRunning(true);
                try {
                  const res = await fetch('/api/admin/competitive/snapshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyword: compKeyword.trim(), tenantId }) });
                  if (res.ok) setCompIntel(await res.json());
                } finally { setCompRunning(false); }
              }}
              style={{ background: compRunning ? '#F1F3F4' : G_BLUE, color: compRunning ? MUTED : '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, cursor: compRunning ? 'not-allowed' : 'pointer', fontWeight: 500, boxShadow: SHADOW }}
            >
              {compRunning ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>

          {compIntel?.voiceBrief && (
            <div style={{ background: '#EFF6FF', border: `1px solid #BFDBFE`, borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: G_BLUE, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>🎙️ Agent Brief</div>
              <div style={{ fontSize: 12, color: '#1E40AF', lineHeight: 1.7 }}>{compIntel.voiceBrief}</div>
            </div>
          )}

          {(compIntel?.insights ?? []).map((ins: any, i: number) => {
            const pColor = ins.priority === 'high' ? G_RED : ins.priority === 'medium' ? G_YELLOW : MUTED;
            const pBg    = ins.priority === 'high' ? '#FEF2F2' : ins.priority === 'medium' ? '#FFFBEB' : '#F8F9FA';
            return (
              <div key={i} style={{ background: '#F8F9FA', borderRadius: 8, padding: '12px 16px', marginBottom: 10, borderLeft: `3px solid ${pColor}`, border: `1px solid ${BORDER}`, borderLeftWidth: 3 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>{ins.title}</span>
                  {chip(ins.priority, pColor === G_RED ? '#991B1B' : '#92400E', pBg, pColor + '40')}
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 8, lineHeight: 1.6 }}>{ins.description}</div>
                <div style={{ fontSize: 12, color: G_BLUE, fontWeight: 500 }}>→ {ins.actionLabel}</div>
                {ins.patternWords?.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {ins.patternWords.slice(0, 5).map((w: string, j: number) => (
                      <span key={j} style={{ fontSize: 10, background: '#EFF6FF', color: G_BLUE, padding: '2px 8px', borderRadius: 10, border: '1px solid #BFDBFE', fontWeight: 500 }}>{w}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {!compIntel && (
            <div style={{ fontSize: 13, color: MUTED, textAlign: 'center', padding: '16px 0' }}>
              Enter a keyword above to analyze market conditions and gaps.
            </div>
          )}
        </div>
      </div>

      {/* ── NETWORK INTELLIGENCE ─────────────────────────────────── */}
      <div style={{ borderRadius: 12, background: CARD, boxShadow: SHADOW, border: `1px solid ${BORDER}`, overflow: 'hidden', marginBottom: 16 }}>
        {panelHeader('🌐 Network Intelligence',
          'learn once · benefit all · privacy-safe',
          <span style={{ fontSize: 11, color: G_PURPLE, background: '#F3E8FF', padding: '3px 10px', borderRadius: 10, border: '1px solid #DDD6FE', fontWeight: 600 }}>
            {globalIntel?.totalPatterns ?? '—'} patterns
          </span>
        )}
        <div style={{ padding: 20 }}>
          <div style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>🔥 Top Network Patterns</div>
          {(globalIntel?.topPatterns ?? []).slice(0, 4).map((p: any, pi: number) => (
            <div key={pi} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: TEXT, fontWeight: 500 }}>{p.description}</span>
                <span style={{ fontSize: 11, color: MUTED, whiteSpace: 'nowrap', marginLeft: 12 }}>+{p.avgLift}% · {p.supporting} tenants</span>
              </div>
              <div style={{ height: 4, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round(p.confidence * 100)}%`, background: p.confidence >= 0.7 ? G_GREEN : p.confidence >= 0.5 ? G_YELLOW : MUTED, borderRadius: 2, transition: 'width .4s ease' }} />
              </div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{Math.round(p.confidence * 100)}% confidence</div>
            </div>
          ))}
          {(!globalIntel?.topPatterns || globalIntel.topPatterns.length === 0) && (
            <div style={{ fontSize: 13, color: MUTED, fontStyle: 'italic' }}>Patterns will appear as tenants complete monthly strategy cycles.</div>
          )}

          {globalIntel?.recommendations?.filter((r: any) => r.recommended).length > 0 && (
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 16, marginTop: 4 }}>
              <div style={{ fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, fontWeight: 600 }}>🚀 Suggested for This Client</div>
              {globalIntel.recommendations.filter((r: any) => r.recommended).slice(0, 3).map((r: any, ri: number) => (
                <div key={ri} style={{ background: '#F8F9FA', borderRadius: 8, padding: '12px 16px', marginBottom: 10, border: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: 13, color: TEXT, fontWeight: 600, marginBottom: 4 }}>
                    {r.patternKey.replace(/_/g, ' ')}
                    <span style={{ fontSize: 10, color: G_GREEN, marginLeft: 8, background: '#ECFDF5', padding: '2px 7px', borderRadius: 10, border: '1px solid #A7F3D0' }}>
                      {Math.round(r.confidence * 100)}% confident
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: G_BLUE, marginBottom: 4, fontWeight: 500 }}>→ {r.actionHint}</div>
                  <div style={{ fontSize: 11, color: MUTED, fontStyle: 'italic' }}>{r.voiceLine.slice(0, 100)}…</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>


      <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
        <a href="/admin/war-room" style={{ fontSize: 12, color: G_BLUE, textDecoration: 'none', fontWeight: 500 }}>→ Open full platform War Room</a>
      </div>

      {/* ── Drone Launch Animation Overlay ── */}
      {showDrones && (
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}>
          <style>{`
            @keyframes dronefly {
              0%   { transform: translateX(-120px) translateY(0px) rotate(-5deg); opacity: 0; }
              10%  { opacity: 1; }
              50%  { transform: translateX(50vw) translateY(var(--dy)) rotate(5deg); }
              90%  { opacity: 1; }
              100% { transform: translateX(110vw) translateY(var(--dy2)) rotate(-3deg); opacity: 0; }
            }
            .drone-particle {
              position: absolute;
              font-size: 28px;
              animation: dronefly var(--dur) ease-in-out forwards;
              animation-delay: var(--delay);
              top: var(--top);
              left: 0;
              filter: drop-shadow(0 2px 6px rgba(0,0,0,0.25));
            }
          `}</style>
          {[
            { top: '8%',  delay: '0s',    dur: '2.2s', dy: '-20px', dy2: '30px'  },
            { top: '18%', delay: '0.15s', dur: '2.5s', dy: '15px',  dy2: '-25px' },
            { top: '30%', delay: '0.05s', dur: '2.0s', dy: '-30px', dy2: '10px'  },
            { top: '42%', delay: '0.3s',  dur: '2.7s', dy: '25px',  dy2: '-15px' },
            { top: '55%', delay: '0.1s',  dur: '2.3s', dy: '-10px', dy2: '20px'  },
            { top: '65%', delay: '0.4s',  dur: '2.1s', dy: '30px',  dy2: '-10px' },
            { top: '75%', delay: '0.2s',  dur: '2.6s', dy: '-20px', dy2: '15px'  },
            { top: '85%', delay: '0.35s', dur: '2.4s', dy: '10px',  dy2: '-30px' },
            { top: '22%', delay: '0.5s',  dur: '2.8s', dy: '-15px', dy2: '25px'  },
            { top: '48%', delay: '0.45s', dur: '2.0s', dy: '20px',  dy2: '-20px' },
            { top: '60%', delay: '0.6s',  dur: '2.3s', dy: '-25px', dy2: '10px'  },
            { top: '12%', delay: '0.55s', dur: '2.6s', dy: '10px',  dy2: '-30px' },
          ].map((d, i) => (
            <div
              key={i}
              className="drone-particle"
              style={{
                '--top': d.top, '--delay': d.delay, '--dur': d.dur,
                '--dy': d.dy, '--dy2': d.dy2
              } as React.CSSProperties}
            >
              🚁
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


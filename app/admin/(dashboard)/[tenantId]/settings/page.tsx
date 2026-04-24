'use client';

/**
 * app/admin/(dashboard)/[tenantId]/settings/page.tsx
 *
 * Nova Tenant Settings — the control panel for per-tenant policy overrides.
 *
 * Route: /admin/[tenantId]/settings
 *
 * Sections:
 *   1. Strategic Mode     → mandate/mode
 *   2. Decision Thresholds → NovaDecisionThresholdPolicy
 *   3. Mitigation Controls → NovaMitigationPolicy
 *   4. Alerts & Monitoring → NovaAlertPolicy
 *   5. Domain Protection   → NovaStrategicModeConfig (domainprotection key)
 *   6. Autonomy Levels     → (future: NovaAutonomyPolicy stubs)
 *   7. Operators           → NovaOperatorScope
 *   8. Audit Log           → NovaOperatorAuditLog
 *
 * Design: Dark executive dashboard. Clean panels. Color-coded safety state.
 *   Green  = safe / autonomous
 *   Yellow = caution / assisted
 *   Red    = restricted / locked
 */

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';

// ── Types ──────────────────────────────────────────────────────────────────────
type MandateMode = 'growth' | 'preservation' | 'recovery' | 'experiment';
type PolicySource = 'code_default' | 'global_default' | 'tenant_override' | 'portfolio_override';
interface PostureResult { source: PolicySource; effective: Record<string, any>; }
interface Settings {
  tenantId: string;
  posture: { threshold: PostureResult; alert: PostureResult; mitigation: PostureResult; mandate: PostureResult; domain: PostureResult; };
  overrides: Record<string, any>;
  operators: any[];
  auditLog: any[];
  userDoc?: any;
}

// ── Design tokens ──────────────────────────────────────────────────────────────
const BG    = '#F8F9FA';
const PANEL = '#FFFFFF';
const CARD  = '#040d1a';
const BORDER = '#E8EAED';
const TEXT  = '#202124';
const MUTED = '#5F6368';
const FONT  = "'Inter', system-ui, sans-serif";

const MANDATE_CONFIG: Record<MandateMode, { label: string; icon: string; color: string; desc: string }> = {
  growth:       { label:'Growth',       icon:'📈', color:'#34A853', desc:'Optimize for upside. Accept calibrated risk. Loosen confidence bars.' },
  recovery:     { label:'Recovery',     icon:'🔄', color:'#fbbf24', desc:'Tighten thresholds. Require human review more often. Heal before growing.' },
  preservation: { label:'Preservation', icon:'🏛️', color:'#1A73E8', desc:'Maximum protection. Minimal autonomous action. Highest confidence required.' },
  experiment:   { label:'Experiment',   icon:'🧪', color:'#c084fc', desc:'Low precedent requirement. Cap exposure hard. Enable fast cycle testing.' },
};

const SOURCE_COLORS: Record<PolicySource, string> = {
  code_default:       '#5F6368',
  global_default:     '#1A73E8',
  tenant_override:    '#fbbf24',
  portfolio_override: '#9334E6',
};

const SOURCE_LABELS: Record<PolicySource, string> = {
  code_default:       'CODE DEFAULT',
  global_default:     'GLOBAL',
  tenant_override:    'TENANT OVERRIDE',
  portfolio_override: 'PORTFOLIO OVERRIDE',
};

const SECTIONS = [
  { id:'repo',       label:'Repo + Deploy',       icon:'🚀' },
  { id:'mandate',    label:'Strategic Mode',      icon:'🧭' },
  { id:'threshold',  label:'Decision Thresholds', icon:'⚖️' },
  { id:'mitigation', label:'Mitigation Controls', icon:'🛡️' },
  { id:'alert',      label:'Alerts & Monitoring', icon:'🔔' },
  { id:'domain',     label:'Domain Protection',   icon:'🔐' },
  { id:'autonomy',   label:'Autonomy Levels',     icon:'🤖' },
  { id:'operators',  label:'Operators',           icon:'👥' },
  { id:'audit',      label:'Audit Log',           icon:'📜' },
];

// ── Reusable UI atoms ──────────────────────────────────────────────────────────
function PanelCard({ title, icon, source, children }: { title:string; icon:string; source?:PolicySource; children:React.ReactNode }) {
  return (
    <div style={{ padding:'20px 22px', borderRadius:14, background:CARD, border:`1px solid ${BORDER}`, marginBottom:14 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:16 }}>{icon}</span>
          <span style={{ fontSize:13, fontWeight:700, color:TEXT }}>{title}</span>
        </div>
        {source && (
          <span style={{ padding:'2px 8px', borderRadius:6, fontSize:9, fontWeight:800, letterSpacing:'0.8px',
            color: SOURCE_COLORS[source], border:`1px solid ${SOURCE_COLORS[source]}55`, background:`${SOURCE_COLORS[source]}11` }}>
            {SOURCE_LABELS[source]}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function SliderRow({ label, value, min, max, step, unit, onChange, danger }:
  { label:string; value:number; min:number; max:number; step:number; unit?:'%'|'h'|''; onChange:(v:number)=>void; danger?:boolean }) {
  const display = unit === '%' ? `${(value*100).toFixed(0)}%` : `${value}${unit??''}`;
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
        <span style={{ fontSize:11, color:MUTED }}>{label}</span>
        <span style={{ fontSize:11, fontWeight:700, color: danger ? '#D93025' : '#9AA0A6' }}>{display}</span>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{ flex:1, accentColor: danger ? '#D93025' : '#1A73E8', cursor:'pointer' }} />
        <input type="number" value={value} step={step} min={min} max={max}
          onChange={e => onChange(parseFloat(e.target.value) || value)}
          style={{ width:60, padding:'3px 6px', borderRadius:6, border:`1px solid ${danger?'#7f1d1d':BORDER}`,
            background:'#F8F9FA', color: danger?'#D93025':'#9AA0A6', fontSize:11 }} />
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange, desc }: { label:string; value:boolean; onChange:(v:boolean)=>void; desc?:string }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'10px 0', borderBottom:`1px solid ${BORDER}` }}>
      <div>
        <div style={{ fontSize:11, color: TEXT, fontWeight:600 }}>{label}</div>
        {desc && <div style={{ fontSize:10, color:MUTED, marginTop:2 }}>{desc}</div>}
      </div>
      <button onClick={() => onChange(!value)} style={{
        width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', flexShrink:0, marginLeft:12,
        background: value ? '#4ade8044' : '#E8EAED',
        boxShadow: value ? '0 0 0 1.5px #4ade80' : '0 0 0 1.5px #334155',
        position:'relative', transition:'background 0.2s',
      }}>
        <div style={{
          position:'absolute', top:3, left: value ? 23 : 3, width:18, height:18, borderRadius:9,
          background: value ? '#34A853' : '#5F6368', transition:'left 0.2s, background 0.2s',
        }} />
      </button>
    </div>
  );
}

function SaveBar({ saving, warnings, onSave }: { saving:boolean; warnings:string[]; onSave:()=>void }) {
  return (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:8, padding:'12px 16px', borderRadius:10, background:'#F8F9FA', border:`1px solid ${BORDER}`, marginTop:10 }}>
      <div>
        {warnings.map((w,i) => (
          <div key={i} style={{ fontSize:10, color:'#fbbf24', display:'flex', alignItems:'center', gap:4 }}>
            <span>⚠️</span> {w}
          </div>
        ))}
      </div>
      <button onClick={onSave} disabled={saving} style={{
        padding:'8px 22px', borderRadius:8, border:'none', cursor: saving ? 'default' : 'pointer',
        background: saving ? '#E8EAED' : '#1A73E8', color: saving ? '#5F6368' : '#fff',
        fontSize:12, fontWeight:700, transition:'background 0.2s',
      }}>
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </div>
  );
}

function SuccessToast({ message }: { message:string }) {
  return (
    <div style={{ position:'fixed', bottom:20, right:20, padding:'10px 16px', borderRadius:10,
      background:'#14532d', border:'1px solid #4ade80', color:'#34A853', fontSize:12, fontWeight:600,
      zIndex:9999, animation:'fadeIn 0.2s ease' }}>
      ✓ {message}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function TenantSettingsPage() {
  const params   = useParams();
  const tenantId = (params?.tenantId as string) ?? 'aipilots';

  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [loading, setLoading]   = React.useState(true);
  const [section, setSection]   = React.useState('repo');
  const [saving, setSaving]     = React.useState(false);
  const [onboardingStatus, setOnboardingStatus] = React.useState('created');
  const [deployForm, setDeployForm] = React.useState({ repoUrl: '', branch: 'main', domain: '', cloudflareProject: '' });
  const [toast, setToast]       = React.useState('');
  const [warnings, setWarnings] = React.useState<string[]>([]);

  // ── Form state per section ────────────────────────────────────────────────
  const [mandate,    setMandate]    = React.useState<MandateMode>('growth');
  const [threshold,  setThreshold]  = React.useState({
    minExpectedROI: 0.05, minConfidence: 0.65, maxWorstCaseRisk: 0.25,
    autoApproveAboveConfidence: 0.90, requireHumanReviewBelowConfidence: 0.55,
    minSuccessRate: 0.60, minPrecedentStrength: 0.50,
  });
  const [alert, setAlert] = React.useState({
    roiDropThreshold: 0.20, riskSpikeThreshold: 0.15,
    concentrationRiskThreshold: 0.70, confidenceDriftThreshold: 0.20,
    executionStallHours: 24, minSeverityToAlert: 'medium',
  });
  const [mitigation, setMitigation] = React.useState({
    allowAutoReduceExposure: true, allowAutoPauseExecution: true,
    allowAutoReopenMonitoring: true, allowAutoDowngradeAutonomy: false,
    allowAutoBlockApprovals: false, allowAutoFreezeDomain: false,
    maxExposureReductionPct: 0.10, maxMitigationsPerDay: 10,
    minSeverityToMitigate: 'high', requireHumanApprovalForCritical: false,
  });
  const [domain, setDomain] = React.useState({
    lockedDomains: [] as string[], reviewDomains: [] as string[], autonomousDomains: [] as string[],
  });
  const [domainInput, setDomainInput] = React.useState({ locked:'', review:'', autonomous:'' });

  // ── Load settings ─────────────────────────────────────────────────────────
  React.useEffect(() => {
    fetch(`/api/admin/${tenantId}/settings`, { cache:'no-store' })
      .then(r => r.json())
      .then((data: Settings) => {
        setSettings(data);
        // Hydrate form from effective/overrides
        const t = data.overrides?.threshold ?? data.posture?.threshold?.effective ?? {};
        const a = data.overrides?.alert      ?? data.posture?.alert?.effective      ?? {};
        const m = data.overrides?.mitigation ?? data.posture?.mitigation?.effective ?? {};
        const mn = data.overrides?.mandate   ?? {};
        const d  = data.overrides?.domain    ?? {};
        setMandate((mn.mode ?? data.posture?.mandate?.effective?.mode ?? 'growth') as MandateMode);
        setThreshold(prev => ({ ...prev, ...t }));
        setAlert(prev    => ({ ...prev, ...a }));
        setMitigation(prev => ({ ...prev, ...m }));
        setDomain({
          lockedDomains:     d.lockedDomains      ?? [],
          reviewDomains:     d.reviewDomains       ?? [],
          autonomousDomains: d.autonomousDomains   ?? [],
        });
        
        const status = data.userDoc?.onboardingConfig?.status || 'created';
        setOnboardingStatus(status);
        setDeployForm({
          repoUrl: data.userDoc?.githubRepo || '',
          branch: 'main',
          domain: data.userDoc?.targetDomain || '',
          cloudflareProject: data.userDoc?.cloudflareAccountId || ''
        });
        if (status === 'engine_active') setSection('mandate');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [tenantId]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const save = React.useCallback(async () => {
    setSaving(true); setWarnings([]);
    const payloads: Record<string, any> = {
      mandate:    { mode: mandate },
      threshold,
      alert,
      mitigation,
      domain,
    };
    const policyType = section === 'autonomy' ? 'mandate' : section;
    const body = payloads[policyType];
    if (!body) { setSaving(false); return; }

    const res = await fetch(`/api/admin/${tenantId}/settings`, {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ policyType, values: body }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.warnings?.length) setWarnings(json.warnings);
    if (json.ok) {
      setToast(`${policyType} policy saved`);
      setTimeout(() => setToast(''), 3000);
    }
  }, [section, mandate, threshold, alert, mitigation, domain, tenantId]);

  const approveAndConnect = async () => {
    setSaving(true);
    // 1. Connect Deploy
    const deployRes = await fetch(`/api/admin/${tenantId}/deploy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deployForm)
    });
    const deployJson = await deployRes.json();
    if (!deployJson.success) {
      setSaving(false);
      return setToast('Error connecting deployment');
    }
    
    // 2. Activate Engine
    const actRes = await fetch(`/api/admin/${tenantId}/activate`, { method: 'POST' });
    const actJson = await actRes.json();
    if (actJson.success) {
      window.location.href = '/admin/nova/mission';
    } else {
      setSaving(false);
      setToast('Deployment connected but engine failed to activate.');
    }
  };

  const saveDeploy = async () => {
    setSaving(true);
    const res = await fetch(`/api/admin/${tenantId}/deploy`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deployForm)
    });
    const json = await res.json();
    setSaving(false);
    if (json.success) {
      setOnboardingStatus(json.status);
      setToast('Deployment connected successfully!');
      setTimeout(() => setToast(''), 3000);
    }
  };

  const activateNova = async () => {
    const res = await fetch(`/api/admin/${tenantId}/activate`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      window.location.href = '/admin/nova/mission';
    }
  };

  // ── Domain list helpers ───────────────────────────────────────────────────
  const addDomain = (key: 'lockedDomains' | 'reviewDomains' | 'autonomousDomains', inputKey: keyof typeof domainInput) => {
    const val = domainInput[inputKey].trim();
    if (!val) return;
    setDomain(prev => ({ ...prev, [key]: [...prev[key].filter((d: string) => d !== val), val] }));
    setDomainInput(prev => ({ ...prev, [inputKey]: '' }));
  };
  const removeDomain = (key: 'lockedDomains' | 'reviewDomains' | 'autonomousDomains', domain_: string) => {
    setDomain(prev => ({ ...prev, [key]: prev[key].filter((d: string) => d !== domain_) }));
  };

  if (loading) return (
    <div style={{ minHeight:'100vh', background:BG, display:'flex', alignItems:'center', justifyContent:'center', color:MUTED, fontFamily:FONT }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:28, marginBottom:8 }}>⚙️</div>
        <div style={{ fontSize:13 }}>Loading settings for <strong style={{ color:TEXT }}>{tenantId}</strong>…</div>
      </div>
    </div>
  );

  const src = (key: keyof Settings['posture']) => settings?.posture?.[key]?.source ?? 'code_default';

  return (
    <div style={{ minHeight:'100vh', background:BG, fontFamily:FONT, color:TEXT }}>
      {toast && <SuccessToast message={toast} />}

      {/* ── Header ── */}
      <div style={{ padding:'18px 28px 0', borderBottom:`1px solid ${BORDER}`, background:PANEL }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:20 }}>⚙️</span>
            <div>
              <div style={{ fontSize:17, fontWeight:800, color:TEXT }}>Nova Settings</div>
              <div style={{ fontSize:11, color:MUTED }}>Tenant: <strong style={{ color:'#d97706' }}>{tenantId}</strong></div>
            </div>
          </div>
          <a href={`/admin/war-room`} style={{ fontSize:11, color:'#1A73E8', textDecoration:'none' }}>→ War Room</a>
        </div>

        {/* ── Onboarding Progress Bar ── */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom: 24, padding: '16px 20px', background: CARD, borderRadius: 12, border: `1px solid ${BORDER}` }}>
          {[
            { id: 'created', label: 'Client Created', active: true, done: true },
            { id: 'deployment_connected', label: 'Website Connected', active: onboardingStatus !== 'created', done: onboardingStatus !== 'created' },
            { id: 'engine_active', label: 'Nova Activated', active: onboardingStatus === 'engine_active', done: onboardingStatus === 'engine_active' },
          ].map((step, i) => (
            <React.Fragment key={step.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', 
                  background: step.done ? '#14532d' : (step.active ? '#E8EAED' : PANEL), 
                  border: `1px solid ${step.done ? '#34A853' : (step.active ? '#818cf8' : BORDER)}`,
                  color: step.done ? '#34A853' : (step.active ? '#818cf8' : MUTED), fontSize: 11, fontWeight: 700 
                }}>
                  {step.done ? '✓' : i + 1}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: step.active ? TEXT : MUTED }}>{step.label}</div>
              </div>
              {i < 2 && <div style={{ height: 1, flex: 1, background: step.done ? '#4ade8044' : BORDER }} />}
            </React.Fragment>
          ))}
          
          {/* Main Onboarding CTA */}
          <div style={{ marginLeft: 16 }}>
            {onboardingStatus === 'created' ? (
              <button disabled style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'#1A73E8', color:'#fff', fontSize:12, fontWeight:600, opacity:0.5 }}>Connect Deployment</button>
            ) : onboardingStatus === 'deployment_connected' ? (
              <button onClick={activateNova} style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'#34A853', color:'#fff', cursor:'pointer', fontSize:12, fontWeight:600 }}>Activate Nova</button>
            ) : (
              <a href="/admin/nova/mission" style={{ display: 'inline-block', padding:'8px 16px', borderRadius:8, border:'none', background:'#F9AB00', color:'#fff', cursor:'pointer', fontSize:12, fontWeight:600, textDecoration: 'none' }}>Mission Control</a>
            )}
          </div>
        </div>

        {/* Section tabs */}
        <div style={{ display:'flex', gap:2, overflowX:'auto' }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => setSection(s.id)} style={{
              padding:'8px 14px', border:'none', cursor:'pointer', borderRadius:'8px 8px 0 0',
              background: section===s.id ? BG : 'transparent',
              color: section===s.id ? TEXT : MUTED,
              fontSize:11, fontWeight: section===s.id ? 700 : 400,
              borderBottom: section===s.id ? `2px solid #6366f1` : '2px solid transparent',
              whiteSpace:'nowrap',
            }}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ padding:'22px 28px', maxWidth:820, margin:'0 auto' }}>

        {/* ──────────────── 0. REPO + DEPLOY ──────────────── */}
        {section === 'repo' && (
          <PanelCard title={onboardingStatus === 'plan_ready' ? 'Proposed Architecture Plan' : 'Deployment Configuration'} icon="🚀">
            {onboardingStatus === 'plan_ready' ? (
              <>
                <p style={{ fontSize:11, color:'#34A853', marginBottom:18, fontWeight: 600 }}>
                  ✓ Nova has inspected the architecture. Please review the deployment plan.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '14px', marginBottom: 18 }}>
                  <div style={{ padding: '12px', background: '#F8F9FA', borderRadius: 8, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 9, color: MUTED, marginBottom: 4, fontWeight: 700 }}>GITHUB REPO</div>
                    <div style={{ fontSize: 13, color: TEXT, wordBreak: 'break-all' }}>{deployForm.repoUrl}</div>
                  </div>
                  <div style={{ padding: '12px', background: '#F8F9FA', borderRadius: 8, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 9, color: MUTED, marginBottom: 4, fontWeight: 700 }}>TARGET DOMAIN</div>
                    <div style={{ fontSize: 13, color: TEXT }}>{deployForm.domain}</div>
                  </div>
                  <div style={{ padding: '12px', background: '#F8F9FA', borderRadius: 8, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 9, color: MUTED, marginBottom: 4, fontWeight: 700 }}>FRAMEWORK / BUILD</div>
                    <div style={{ fontSize: 13, color: '#fbbf24' }}>Next.js (Assumed Heuristic)</div>
                  </div>
                  <div style={{ padding: '12px', background: '#F8F9FA', borderRadius: 8, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 9, color: MUTED, marginBottom: 4, fontWeight: 700 }}>CLOUDFLARE ROUTING</div>
                    <div style={{ fontSize: 13, color: TEXT }}>{deployForm.cloudflareProject}</div>
                  </div>
                  <div style={{ padding: '12px', background: '#F8F9FA', borderRadius: 8, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 9, color: MUTED, marginBottom: 4, fontWeight: 700 }}>MONITORING</div>
                    <div style={{ fontSize: 13, color: '#a5b4fc' }}>Mission Control Attached</div>
                  </div>
                  <div style={{ padding: '12px', background: '#F8F9FA', borderRadius: 8, border: `1px solid ${BORDER}` }}>
                    <div style={{ fontSize: 9, color: MUTED, marginBottom: 4, fontWeight: 700 }}>AUTOMATION STATE</div>
                    <div style={{ fontSize: 13, color: '#D93025' }}>Safely Locked (Awaiting Approval)</div>
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'flex-end', gap:8, padding:'12px 16px', borderRadius:10, background:'#F8F9FA', border:`1px solid ${BORDER}` }}>
                  <button onClick={() => setOnboardingStatus('created')} style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${BORDER}`, background:'transparent', color:MUTED, fontSize:12, fontWeight:600, cursor: 'pointer' }}>Edit Configuration</button>
                  <button onClick={approveAndConnect} disabled={saving} style={{ padding:'8px 22px', borderRadius:8, border:'none', cursor: saving?'default':'pointer', background: saving?'#E8EAED':'#34A853', color: saving?'#5F6368':'#fff', fontSize:12, fontWeight:700, transition:'background 0.2s', boxShadow: '0 0 10px rgba(16,185,129,0.3)' }}>
                    {saving ? 'Igniting Engine...' : 'Approve & Connect'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize:11, color:MUTED, marginBottom:18 }}>
                  Connect your codebase to enable Nova to inject real physical assets.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '14px', marginBottom: 18 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: MUTED, marginBottom: 4 }}>GitHub Repo URL (Required)</label>
                    <input value={deployForm.repoUrl} onChange={e => setDeployForm({...deployForm, repoUrl: e.target.value})} placeholder="https://github.com/org/repo" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, background: '#F8F9FA', color: TEXT, fontSize: 12 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: MUTED, marginBottom: 4 }}>Branch</label>
                    <input value={deployForm.branch} onChange={e => setDeployForm({...deployForm, branch: e.target.value})} placeholder="main" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, background: '#F8F9FA', color: TEXT, fontSize: 12 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: MUTED, marginBottom: 4 }}>Target Domain</label>
                    <input value={deployForm.domain} onChange={e => setDeployForm({...deployForm, domain: e.target.value})} placeholder="www.acme.com" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, background: '#F8F9FA', color: TEXT, fontSize: 12 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: MUTED, marginBottom: 4 }}>Cloudflare Project Name (Optional)</label>
                    <input value={deployForm.cloudflareProject} onChange={e => setDeployForm({...deployForm, cloudflareProject: e.target.value})} placeholder="acme-website" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, background: '#F8F9FA', color: TEXT, fontSize: 12 }} />
                  </div>
                </div>
                
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'flex-end', gap:8, padding:'12px 16px', borderRadius:10, background:'#F8F9FA', border:`1px solid ${BORDER}` }}>
                  <button disabled style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${BORDER}`, background:'transparent', color:MUTED, fontSize:12, fontWeight:600 }}>Inspect Repo</button>
                  <button disabled style={{ padding:'8px 16px', borderRadius:8, border:`1px solid ${BORDER}`, background:'transparent', color:MUTED, fontSize:12, fontWeight:600 }}>Generate Plan</button>
                  <button onClick={saveDeploy} disabled={saving} style={{ padding:'8px 22px', borderRadius:8, border:'none', cursor: saving?'default':'pointer', background: saving?'#E8EAED':'#1A73E8', color: saving?'#5F6368':'#fff', fontSize:12, fontWeight:700, transition:'background 0.2s' }}>
                    {saving ? 'Connecting...' : 'Connect Deployment'}
                  </button>
                </div>
              </>
            )}
          </PanelCard>
        )}

        {/* ──────────────── 1. STRATEGIC MODE ──────────────── */}
        {section==='mandate' && (
          <PanelCard title="Strategic Mode" icon="🧭" source={src('mandate')}>
            <p style={{ fontSize:11, color:MUTED, marginBottom:18 }}>
              The mandate mode shapes how the entire boardroom behaves — threshold interpretation, simulation bias, mitigation behavior, and autonomy gates.
            </p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:18 }}>
              {(Object.entries(MANDATE_CONFIG) as [MandateMode, any][]).map(([mode, cfg]) => (
                <button key={mode} onClick={() => setMandate(mode)} style={{
                  padding:'14px 16px', borderRadius:12, border:`2px solid ${mandate===mode ? cfg.color : BORDER}`,
                  background: mandate===mode ? `${cfg.color}11` : CARD, cursor:'pointer', textAlign:'left',
                  transition:'all 0.15s',
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                    <span style={{ fontSize:18 }}>{cfg.icon}</span>
                    <span style={{ fontSize:12, fontWeight:700, color: mandate===mode ? cfg.color : TEXT }}>{cfg.label}</span>
                    {mandate===mode && <span style={{ marginLeft:'auto', fontSize:9, color:cfg.color, fontWeight:800 }}>● ACTIVE</span>}
                  </div>
                  <div style={{ fontSize:10, color:MUTED, lineHeight:1.5 }}>{cfg.desc}</div>
                </button>
              ))}
            </div>
            <SaveBar saving={saving} warnings={warnings} onSave={save} />
          </PanelCard>
        )}

        {/* ──────────────── 2. DECISION THRESHOLDS ──────────────── */}
        {section==='threshold' && (
          <PanelCard title="Decision Thresholds" icon="⚖️" source={src('threshold')}>
            <p style={{ fontSize:11, color:MUTED, marginBottom:18 }}>
              These gates determine when Nova can autonomously approve, request human review, or block a resolution entirely.
            </p>
            <SliderRow label="Min Expected ROI"          value={threshold.minExpectedROI}         min={-0.1} max={0.5}  step={0.01} unit="%" onChange={v => setThreshold(p => ({ ...p, minExpectedROI:v }))} />
            <SliderRow label="Min Confidence"            value={threshold.minConfidence}          min={0.30} max={1.00} step={0.01} unit="%" onChange={v => setThreshold(p => ({ ...p, minConfidence:v }))} />
            <SliderRow label="Max Worst-Case Risk"       value={threshold.maxWorstCaseRisk}       min={0.05} max={0.70} step={0.01} unit="%" onChange={v => setThreshold(p => ({ ...p, maxWorstCaseRisk:v }))} danger={threshold.maxWorstCaseRisk > 0.50} />
            <SliderRow label="Auto-Approve Above"        value={threshold.autoApproveAboveConfidence}       min={0.70} max={1.00} step={0.01} unit="%" onChange={v => setThreshold(p => ({ ...p, autoApproveAboveConfidence:v }))} danger={threshold.autoApproveAboveConfidence < 0.75} />
            <SliderRow label="Human Review Below"        value={threshold.requireHumanReviewBelowConfidence} min={0.30} max={0.90} step={0.01} unit="%" onChange={v => setThreshold(p => ({ ...p, requireHumanReviewBelowConfidence:v }))} />
            <SliderRow label="Min Success Rate"          value={threshold.minSuccessRate}         min={0.40} max={1.00} step={0.01} unit="%" onChange={v => setThreshold(p => ({ ...p, minSuccessRate:v }))} />
            <SliderRow label="Min Precedent Strength"   value={threshold.minPrecedentStrength}   min={0.20} max={1.00} step={0.01} unit="%" onChange={v => setThreshold(p => ({ ...p, minPrecedentStrength:v }))} />

            {/* Risk posture summary */}
            <div style={{ marginTop:4, marginBottom:12, padding:'10px 14px', borderRadius:9, background:'#F8F9FA', border:`1px solid ${BORDER}` }}>
              <div style={{ fontSize:10, color:MUTED, marginBottom:6, fontWeight:700 }}>EFFECTIVE POSTURE PREVIEW</div>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                {[
                  { label:'ROI Gate', val: `>${(threshold.minExpectedROI*100).toFixed(0)}%`, color: threshold.minExpectedROI >= 0.08 ? '#34A853' : threshold.minExpectedROI >= 0.04 ? '#fbbf24' : '#D93025' },
                  { label:'Risk Cap', val: `<${(threshold.maxWorstCaseRisk*100).toFixed(0)}%`, color: threshold.maxWorstCaseRisk <= 0.20 ? '#34A853' : threshold.maxWorstCaseRisk <= 0.35 ? '#fbbf24' : '#D93025' },
                  { label:'Auto-Approve', val: `>${(threshold.autoApproveAboveConfidence*100).toFixed(0)}%`, color: threshold.autoApproveAboveConfidence >= 0.90 ? '#34A853' : '#fbbf24' },
                ].map(p => (
                  <div key={p.label} style={{ textAlign:'center' }}>
                    <div style={{ fontSize:14, fontWeight:800, color:p.color }}>{p.val}</div>
                    <div style={{ fontSize:9, color:MUTED }}>{p.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <SaveBar saving={saving} warnings={warnings} onSave={save} />
          </PanelCard>
        )}

        {/* ──────────────── 3. MITIGATION CONTROLS ──────────────── */}
        {section==='mitigation' && (
          <PanelCard title="Mitigation Controls" icon="🛡️" source={src('mitigation')}>
            <p style={{ fontSize:11, color:MUTED, marginBottom:18 }}>
              Which corrective actions can Nova take autonomously? Toggle off to require human approval.
            </p>
            <Toggle label="Auto Reduce Exposure"    value={mitigation.allowAutoReduceExposure}    onChange={v => setMitigation(p=>({...p,allowAutoReduceExposure:v}))}    desc="Automatically reduce capital exposure when concentration risk detected" />
            <Toggle label="Auto Pause Execution"    value={mitigation.allowAutoPauseExecution}    onChange={v => setMitigation(p=>({...p,allowAutoPauseExecution:v}))}    desc="Pause staged execution when anomalies are detected" />
            <Toggle label="Auto Reopen Monitoring"  value={mitigation.allowAutoReopenMonitoring}  onChange={v => setMitigation(p=>({...p,allowAutoReopenMonitoring:v}))}  desc="Trigger monitoring snapshot cycles on applied decisions" />
            <Toggle label="Auto Downgrade Autonomy" value={mitigation.allowAutoDowngradeAutonomy} onChange={v => setMitigation(p=>({...p,allowAutoDowngradeAutonomy:v}))} desc="⚠️ Reduce Nova autonomy level when drift is detected — requires board review" />
            <Toggle label="Auto Block Approvals"    value={mitigation.allowAutoBlockApprovals}    onChange={v => setMitigation(p=>({...p,allowAutoBlockApprovals:v}))}    desc="⚠️ Block auto-approvals during high-risk periods — aggressive intervention" />
            <Toggle label="Auto Freeze Domain"      value={mitigation.allowAutoFreezeDomain}      onChange={v => setMitigation(p=>({...p,allowAutoFreezeDomain:v}))}      desc="⚠️ Freeze domain operations when domain anomaly detected" />
            <Toggle label="Human Approval for Critical" value={mitigation.requireHumanApprovalForCritical} onChange={v => setMitigation(p=>({...p,requireHumanApprovalForCritical:v}))} desc="All critical mitigation plans surface as 'proposed' and require manual apply" />
            <div style={{ marginTop:14 }}>
              <SliderRow label="Max Exposure Reduction %" value={mitigation.maxExposureReductionPct} min={0.01} max={0.50} step={0.01} unit="%" onChange={v => setMitigation(p=>({...p,maxExposureReductionPct:v}))} />
              <SliderRow label="Max Mitigations per Day"  value={mitigation.maxMitigationsPerDay}    min={1}    max={50}   step={1}    unit=""  onChange={v => setMitigation(p=>({...p,maxMitigationsPerDay:v}))} danger={mitigation.maxMitigationsPerDay > 30} />
            </div>
            <SaveBar saving={saving} warnings={warnings} onSave={save} />
          </PanelCard>
        )}

        {/* ──────────────── 4. ALERTS & MONITORING ──────────────── */}
        {section==='alert' && (
          <PanelCard title="Alerts & Monitoring" icon="🔔" source={src('alert')}>
            <p style={{ fontSize:11, color:MUTED, marginBottom:18 }}>
              Tune when Nova surfaces anomalies. Tighter thresholds = more alerts. Looser = only major events.
            </p>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, color:MUTED, marginBottom:8 }}>Minimum Severity to Alert</div>
              <div style={{ display:'flex', gap:6 }}>
                {['low','medium','high','critical'].map(s => (
                  <button key={s} onClick={() => setAlert(p=>({...p,minSeverityToAlert:s}))} style={{
                    padding:'5px 12px', borderRadius:7, border:`1px solid ${alert.minSeverityToAlert===s?'#1A73E8':BORDER}`,
                    background: alert.minSeverityToAlert===s ? '#4f46e511' : CARD,
                    color: alert.minSeverityToAlert===s ? '#a5b4fc' : MUTED,
                    fontSize:11, cursor:'pointer', fontWeight: alert.minSeverityToAlert===s ? 700 : 400,
                  }}>{s.toUpperCase()}</button>
                ))}
              </div>
            </div>
            <SliderRow label="ROI Drop Trigger"          value={alert.roiDropThreshold}           min={0.05} max={0.50} step={0.01} unit="%" onChange={v => setAlert(p=>({...p,roiDropThreshold:v}))} />
            <SliderRow label="Risk Spike Trigger"        value={alert.riskSpikeThreshold}         min={0.05} max={0.50} step={0.01} unit="%" onChange={v => setAlert(p=>({...p,riskSpikeThreshold:v}))} />
            <SliderRow label="Concentration Risk Cap"    value={alert.concentrationRiskThreshold} min={0.30} max={0.95} step={0.01} unit="%" onChange={v => setAlert(p=>({...p,concentrationRiskThreshold:v}))} />
            <SliderRow label="Confidence Drift Tolerance" value={alert.confidenceDriftThreshold}  min={0.05} max={0.50} step={0.01} unit="%" onChange={v => setAlert(p=>({...p,confidenceDriftThreshold:v}))} />
            <SliderRow label="Execution Stall Window"    value={alert.executionStallHours}        min={6}    max={168}  step={6}    unit="h" onChange={v => setAlert(p=>({...p,executionStallHours:v}))} />
            <SaveBar saving={saving} warnings={warnings} onSave={save} />
          </PanelCard>
        )}

        {/* ──────────────── 5. DOMAIN PROTECTION ──────────────── */}
        {section==='domain' && (
          <PanelCard title="Domain Protection" icon="🔐" source={src('domain')}>
            <p style={{ fontSize:11, color:MUTED, marginBottom:18 }}>
              Define which digital domains Nova can act on autonomously, which need review, and which are completely locked.
            </p>
            {([
              { key:'lockedDomains',     inputKey:'locked',     icon:'🔴', label:'Locked (Never Touch)',      color:'#D93025', desc:'Nova cannot take any autonomous action on these domains.' },
              { key:'reviewDomains',     inputKey:'review',     icon:'🟡', label:'Review Required',           color:'#fbbf24', desc:'Nova plans actions but requires operator approval before applying.' },
              { key:'autonomousDomains', inputKey:'autonomous', icon:'🟢', label:'Autonomous Safe',           color:'#34A853', desc:'Nova can operate freely on these domains.' },
            ] as const).map(({ key, inputKey, icon, label, color, desc }) => (
              <div key={key} style={{ marginBottom:18, padding:'14px', borderRadius:10, background:'#F8F9FA', border:`1px solid ${color}33` }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                  <span>{icon}</span>
                  <span style={{ fontSize:11, fontWeight:700, color }}>{label}</span>
                </div>
                <div style={{ fontSize:10, color:MUTED, marginBottom:8 }}>{desc}</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginBottom:8 }}>
                  {domain[key].map((d: string) => (
                    <span key={d} style={{ padding:'3px 8px', borderRadius:5, fontSize:10, background:`${color}18`, border:`1px solid ${color}44`, color, display:'flex', alignItems:'center', gap:5 }}>
                      {d}
                      <button onClick={() => removeDomain(key, d)} style={{ background:'none', border:'none', color, cursor:'pointer', padding:0, fontSize:11, lineHeight:1 }}>×</button>
                    </span>
                  ))}
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <input value={domainInput[inputKey]} onChange={e => setDomainInput(p=>({...p,[inputKey]:e.target.value}))}
                    onKeyDown={e => e.key==='Enter' && addDomain(key, inputKey)}
                    placeholder="e.g. outreach-system, giving-flow…"
                    style={{ flex:1, padding:'6px 10px', borderRadius:7, border:`1px solid ${BORDER}`, background:CARD, color:TEXT, fontSize:11 }} />
                  <button onClick={() => addDomain(key, inputKey)} style={{ padding:'6px 12px', borderRadius:7, border:'none', background:'#E8EAED', color:'#9AA0A6', fontSize:11, cursor:'pointer' }}>Add</button>
                </div>
              </div>
            ))}
            <SaveBar saving={saving} warnings={warnings} onSave={save} />
          </PanelCard>
        )}

        {/* ──────────────── 6. AUTONOMY LEVELS ──────────────── */}
        {section==='autonomy' && (
          <PanelCard title="Autonomy Levels" icon="🤖">
            <p style={{ fontSize:11, color:MUTED, marginBottom:18 }}>
              Per-system autonomy mode. Controls how hands-off or hands-on Nova operates for each function.
            </p>
            {[
              { system:'SEO Engine',        key:'seo' },
              { system:'Capital Allocation', key:'capital' },
              { system:'Boardroom Voting',   key:'boardroom' },
              { system:'Alert Response',     key:'alert' },
              { system:'Content Operations', key:'content' },
            ].map(({ system, key }) => {
              const modeOpts: { val:string; label:string; color:string }[] = [
                { val:'manual',     label:'Manual',     color:'#D93025' },
                { val:'assisted',   label:'Assisted',   color:'#fbbf24' },
                { val:'autonomous', label:'Autonomous', color:'#34A853' },
              ];
              const [mode, setMode_] = React.useState('assisted');
              return (
                <div key={key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 0', borderBottom:`1px solid ${BORDER}` }}>
                  <span style={{ fontSize:11, color:TEXT, fontWeight:600 }}>{system}</span>
                  <div style={{ display:'flex', gap:5 }}>
                    {modeOpts.map(o => (
                      <button key={o.val} onClick={() => setMode_(o.val)} style={{
                        padding:'4px 10px', borderRadius:6, border:`1px solid ${mode===o.val ? o.color : BORDER}`,
                        background: mode===o.val ? `${o.color}11` : CARD,
                        color: mode===o.val ? o.color : MUTED,
                        fontSize:10, cursor:'pointer', fontWeight: mode===o.val ? 700 : 400,
                      }}>{o.label}</button>
                    ))}
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop:12, padding:'10px', borderRadius:8, background:'#F8F9FA', border:`1px solid ${BORDER}` }}>
              <div style={{ fontSize:10, color:MUTED }}>⚙️ Autonomy levels connect to <code style={{ color:'#9334E6', fontSize:9 }}>NovaAutonomyPolicy</code> in the next release. Currently surfaced for planning visibility.</div>
            </div>
          </PanelCard>
        )}

        {/* ──────────────── 7. OPERATORS ──────────────── */}
        {section==='operators' && (
          <PanelCard title="Operators & Permissions" icon="👥">
            <p style={{ fontSize:11, color:MUTED, marginBottom:18 }}>
              Manage which operators have access to this tenant, their roles, and portfolio restrictions.
            </p>
            {settings?.operators && settings.operators.length > 0 ? (
              <div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:0, marginBottom:6 }}>
                  {['Operator','Role','Portfolios','Status'].map(h => (
                    <div key={h} style={{ fontSize:9, color:MUTED, fontWeight:700, padding:'6px 8px', borderBottom:`1px solid ${BORDER}` }}>{h}</div>
                  ))}
                </div>
                {settings.operators.map((op: any) => (
                  <div key={op._id} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:0 }}>
                    <div style={{ fontSize:10, color:TEXT, padding:'8px 8px', borderBottom:`1px solid ${BORDER}` }}>{op.operatorId}</div>
                    <div style={{ fontSize:10, color:'#a5b4fc', padding:'8px 8px', borderBottom:`1px solid ${BORDER}` }}>{op.role}</div>
                    <div style={{ fontSize:10, color:MUTED, padding:'8px 8px', borderBottom:`1px solid ${BORDER}` }}>{(op.portfolioKeys??[]).join(', ')||'All'}</div>
                    <div style={{ fontSize:10, padding:'8px 8px', borderBottom:`1px solid ${BORDER}` }}>
                      <span style={{ color: op.isActive ? '#34A853':'#D93025' }}>{op.isActive?'Active':'Inactive'}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding:'24px', textAlign:'center', color:MUTED, fontSize:11 }}>
                No operators scoped to this tenant yet.<br/>
                <span style={{ fontSize:10 }}>Create operator scopes via <code style={{ color:'#9334E6' }}>NovaOperatorScope</code></span>
              </div>
            )}
            <div style={{ marginTop:12, padding:'10px 14px', borderRadius:9, background:'#F8F9FA', border:`1px solid ${BORDER}`, fontSize:10, color:MUTED }}>
              💡 Role changes and new operator assignments create audit log entries automatically.
            </div>
          </PanelCard>
        )}

        {/* ──────────────── 8. AUDIT LOG ──────────────── */}
        {section==='audit' && (
          <PanelCard title="Audit Log" icon="📜">
            <p style={{ fontSize:11, color:MUTED, marginBottom:18 }}>
              Every policy change is recorded. Changes to threshold, alert, mitigation, mandate, and domain configs all appear here.
            </p>
            {settings?.auditLog && settings.auditLog.length > 0 ? (
              <div>
                <div style={{ display:'grid', gridTemplateColumns:'120px 90px 1fr 90px', gap:0, marginBottom:4 }}>
                  {['Time','Operator','Action / Target','Policy'].map(h => (
                    <div key={h} style={{ fontSize:9, color:MUTED, fontWeight:700, padding:'5px 8px', borderBottom:`1px solid ${BORDER}` }}>{h}</div>
                  ))}
                </div>
                {settings.auditLog.map((entry: any, i: number) => (
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'120px 90px 1fr 90px', gap:0, borderBottom:`1px solid ${BORDER}33` }}>
                    <div style={{ fontSize:9, color:MUTED, padding:'7px 8px' }}>{new Date(entry.createdAt).toLocaleString()}</div>
                    <div style={{ fontSize:9, color:'#a5b4fc', padding:'7px 8px' }}>{entry.operatorId}</div>
                    <div style={{ fontSize:9, color:TEXT, padding:'7px 8px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      <span style={{ fontWeight:700 }}>{entry.action}</span> → {entry.targetKey}
                    </div>
                    <div style={{ fontSize:9, color:MUTED, padding:'7px 8px' }}>{entry.metadata?.policyType ?? '—'}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding:'24px', textAlign:'center', color:MUTED, fontSize:11 }}>
                No audit events yet for this tenant.<br/>
                <span style={{ fontSize:10 }}>Events are logged when operators save policy changes.</span>
              </div>
            )}
          </PanelCard>
        )}
      </div>
    </div>
  );
}

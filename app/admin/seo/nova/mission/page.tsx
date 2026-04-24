// app/admin/seo/nova/mission/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Activity, Target, Brain, Shield, Rocket, Lock } from "lucide-react";

type MissionPayload = {
  doctrine: {
    mode: string;
    reason: string[];
    explorationWeight: number;
    override: { active: boolean; source: string | null; setAt: string | null };
  };
  health: {
    totalClusters: number;
    stuck: number;
    critical: number;
    measuredOutcomes: number;
    avgReward: number;
  };
  priorities: any[];
  bandit: {
    topArm: string;
    weakestArm: string;
    explorationWeight: number;
    arms: any[];
  };
  library: {
    promoted: number;
    active: number;
    watchlist: number;
    deprecated: number;
    mutating: number;
  };
  governance: {
    todayBlocksCount: number;
    recentBlocks: any[];
  };
  fleet: {
    globalConfidenceAvg: number;
    patternsBorrowed: number;
    localWeightActive: number;
    globalWeightActive: number;
    enabled: boolean;
  };
  activePlans: any[];
  goals: any[];
  truthEvaluator: any[];
  expansion: any[];
  portfolio: any[];
  revenue: any[];
  metaVariants: any[];
  modeHistory: any[];
};

export default function GlassCockpit() {
  const [data, setData] = useState<MissionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState("");

  const fetchMissionControl = async (tid: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/nova/mission-summary?tenantId=${tid}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // DEV NOTE: Forcing a raw tenant pull temporarily to bypass auth for HUD building natively
    const tempTid = localStorage.getItem("temp_tenant_id") || "662a5b0f4bd21a48c8b211ed"; 
    setTenantId(tempTid);
    fetchMissionControl(tempTid);

    const interval = setInterval(() => fetchMissionControl(tempTid), 30000);
    return () => clearInterval(interval);
  }, []);

  const triggerOverride = async (mode: string) => {
    if (!tenantId) return;
    try {
      await fetch("/api/admin/nova/override-strategy", {
        method: "POST",
        body: JSON.stringify({ tenantId, mode, source: "ui" }),
      });
      fetchMissionControl(tenantId);
    } catch (e) {
      console.error(e);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex justify-center items-center h-screen bg-[#f8fafc]">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  const ModeColors: Record<string, string> = {
    recovery: "#ef4444",
    aggressive: "#f97316",
    conservative: "#6366f1",
    expansion: "#0ea5e9",
    stabilization: "#10b981",
    unknown: "#94a3b8"
  };

  const activeColor = ModeColors[data?.doctrine?.mode || "unknown"];

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0f172a", color: "#f8fafc", padding: "32px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        
        {/* HEADER SECTION */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: "700", margin: "0 0 8px 0" }}>⚡ MISSION CONTROL DASHBOARD</h1>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: "15px" }}>Live execution ledger and meta-learning Doctrine status.</p>
          </div>
          
          <div style={{ display: "flex", gap: "12px" }}>
            <button onClick={() => triggerOverride("aggressive")} style={{ padding: "8px 16px", backgroundColor: "#431407", border: "1px solid #c2410c", color: "#fdba74", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>🔥 Force Aggressive</button>
            <button onClick={() => triggerOverride("conservative")} style={{ padding: "8px 16px", backgroundColor: "#1e1b4b", border: "1px solid #4f46e5", color: "#a5b4fc", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>🛡️ Force Conservative</button>
            <button onClick={() => triggerOverride("clear")} style={{ padding: "8px 16px", backgroundColor: "#0f172a", border: "1px solid #334155", color: "#f8fafc", borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>🤖 Return to Autopilot</button>
          </div>
        </div>

        {/* REASONING SUMMARY NARRATIVE */}
        <div style={{ backgroundColor: "#1e293b", borderLeft: `6px solid ${activeColor}`, padding: "24px", borderRadius: "8px", marginBottom: "32px", display: "flex", alignItems: "center", gap: "16px" }}>
           {data?.doctrine?.override?.active ? <Lock color={activeColor} size={32} /> : <Brain color={activeColor} size={32} />}
           <div style={{ fontSize: "18px", color: "#e2e8f0" }}>
             <strong>Nova is currently in {data?.doctrine?.mode.toUpperCase()} mode.</strong> She is restricting exploration strictly to {data?.doctrine?.explorationWeight} because {(data?.doctrine?.reason || []).join(" and ")}.
           </div>
        </div>

        {/* 4 QUADRANT TOP ROW */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px", marginBottom: "32px" }}>
          
          {/* Card 1: Doctrine */}
          <div style={{ backgroundColor: "#1e293b", padding: "24px", borderRadius: "12px", border: "1px solid #334155" }}>
            <p style={{ margin: "0 0 12px 0", color: "#94a3b8", fontSize: "12px", textTransform: "uppercase", fontWeight: "600" }}>Current Doctrine</p>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ width: "16px", height: "16px", borderRadius: "50%", backgroundColor: activeColor }} />
              <h2 style={{ margin: 0, fontSize: "28px", fontWeight: "700", color: activeColor, textTransform: "capitalize" }}>{data?.doctrine?.mode}</h2>
            </div>
            {data?.doctrine?.override?.active && (
              <span style={{ display: "inline-block", marginTop: "12px", padding: "4px 8px", backgroundColor: "#7f1d1d", color: "#fca5a5", fontSize: "11px", borderRadius: "4px", fontWeight: "700" }}>OPERATOR OVERRIDE ACTIVE</span>
            )}
          </div>

          {/* Card 2: System Health */}
          <div style={{ backgroundColor: "#1e293b", padding: "24px", borderRadius: "12px", border: "1px solid #334155" }}>
            <p style={{ margin: "0 0 12px 0", color: "#94a3b8", fontSize: "12px", textTransform: "uppercase", fontWeight: "600" }}>System Health</p>
            <div style={{ display: "flex", gap: "24px" }}>
               <div>
                 <h2 style={{ margin: 0, fontSize: "24px", fontWeight: "700", color: "#f8fafc" }}>{data?.health?.stuck || 0}</h2>
                 <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>Stuck</p>
               </div>
               <div>
                 <h2 style={{ margin: 0, fontSize: "24px", fontWeight: "700", color: "#ef4444" }}>{data?.health?.critical || 0}</h2>
                 <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>Critical</p>
               </div>
               <div>
                 <h2 style={{ margin: 0, fontSize: "24px", fontWeight: "700", color: "#38bdf8" }}>{data?.health?.avgReward?.toFixed(1) || 0}</h2>
                 <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>Avg Reward</p>
               </div>
            </div>
          </div>

          {/* Card 3: Exploration State */}
          <div style={{ backgroundColor: "#1e293b", padding: "24px", borderRadius: "12px", border: "1px solid #334155" }}>
            <p style={{ margin: "0 0 12px 0", color: "#94a3b8", fontSize: "12px", textTransform: "uppercase", fontWeight: "600" }}>Bandit Exploitation</p>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "700", color: "#f8fafc" }}>Top Arm: <span style={{ color: "#fbbf24", textTransform: "capitalize" }}>{data?.bandit?.topArm}</span></h2>
            <p style={{ margin: "8px 0 0 0", color: "#94a3b8", fontSize: "13px" }}>Exploration Ceiling: {data?.bandit?.explorationWeight}</p>
          </div>

          {/* Card 4: Action Mutation Matrix (Library) */}
          <div style={{ backgroundColor: "#1e293b", padding: "24px", borderRadius: "12px", border: "1px solid #334155" }}>
            <p style={{ margin: "0 0 12px 0", color: "#94a3b8", fontSize: "12px", textTransform: "uppercase", fontWeight: "600" }}>Mutation Library Health</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
               <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#94a3b8" }}>Promoted:</span><span style={{ color: "#10b981", fontWeight: "700" }}>{data?.library?.promoted || 0}</span></div>
               <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#94a3b8" }}>Active:</span><span style={{ color: "#38bdf8", fontWeight: "700" }}>{data?.library?.active || 0}</span></div>
               <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#94a3b8" }}>Watchlist:</span><span style={{ color: "#f59e0b", fontWeight: "700" }}>{data?.library?.watchlist || 0}</span></div>
               <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#94a3b8" }}>Deprecated:</span><span style={{ color: "#ef4444", fontWeight: "700" }}>{data?.library?.deprecated || 0}</span></div>
            </div>
            <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #334155", display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
               <span style={{ color: "#cbd5e1", fontWeight: "600" }}>LIVE MUTATIONS:</span>
               <span style={{ color: "#a855f7", fontWeight: "700", animation: "pulse 2s infinite" }}>{data?.library?.mutating || 0}</span>
            </div>
          </div>
        </div>

        {/* 🎯 PHASE 17 TACTICAL GOALS ENGINE DASHBOARD */}
        <div style={{ backgroundColor: "#1e1b4b", padding: "24px", borderRadius: "12px", border: "1px solid #4338ca", marginBottom: "32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, fontSize: "20px", color: "#e0e7ff", fontWeight: "700", display: "flex", alignItems: "center", gap: "8px" }}>
                    🎯 Autonomous Goals (Business Intent)
                </h3>
                <span style={{ backgroundColor: "#312e81", color: "#818cf8", padding: "4px 12px", borderRadius: "4px", fontSize: "12px", fontWeight: "700" }}>
                   ACTIVE MISSIONS: {(data?.goals || []).length}
                </span>
            </div>

            {(!data?.goals || data.goals.length === 0) ? (
                 <div style={{ padding: "16px", color: "#6366f1", fontStyle: "italic", textAlign: "center", backgroundColor: "#312e81", borderRadius: "8px" }}>Nova is currently scanning Tenant performance bounds...</div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>
                    {data.goals.map((g: any, i: number) => (
                        <div key={i} style={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: "8px", padding: "16px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                               <div>
                                    <span style={{ display: "block", color: "#8b5cf6", fontSize: "11px", fontWeight: "800", textTransform: "uppercase", marginBottom: "4px" }}>
                                        {g.type.replace(/_/g, " ")}
                                    </span>
                                    <h4 style={{ margin: 0, color: "#f8fafc", fontSize: "14px", fontWeight: "600", lineHeight: "1.4" }}>
                                        {g.title}
                                    </h4>
                               </div>
                               <span style={{ backgroundColor: "#22c55e", color: "#064e3b", padding: "2px 6px", borderRadius: "2px", fontSize: "10px", fontWeight: "800" }}>
                                   PRIORITY: {g.priority.toFixed(2)}
                               </span>
                            </div>

                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "8px" }}>
                                <span style={{ color: "#94a3b8" }}>Mission Progress</span>
                                <span style={{ color: "#38bdf8", fontWeight: "700" }}>{g.progressPct}%</span>
                            </div>
                            
                            <div style={{ width: "100%", backgroundColor: "#1e293b", height: "8px", borderRadius: "4px", overflow: "hidden", marginBottom: "12px" }}>
                                <div style={{ width: `${g.progressPct}%`, backgroundColor: "#a855f7", height: "100%" }} />
                            </div>

                            <div style={{ fontSize: "11px", color: "#cbd5e1", backgroundColor: "#1e293b", padding: "8px", borderRadius: "4px" }}>
                                Target Bound: <strong style={{color: "#fff"}}>{g.target.metric.toUpperCase()} → {g.target.value}</strong>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* FLEET INTELLIGENCE MATRIX */}
        <div style={{ backgroundColor: "#1e293b", padding: "24px", borderRadius: "12px", border: "1px solid #334155", marginBottom: "32px", display: "flex", alignItems: "center", gap: "24px" }}>
            <div style={{ flex: "0 0 auto", padding: "16px", backgroundColor: "#0f172a", borderRadius: "8px", border: "1px solid #334155" }}>
                <h3 style={{ margin: "0 0 4px 0", color: "#f8fafc", fontSize: "16px" }}>🌐 Fleet Intelligence</h3>
                <span style={{ color: data?.fleet?.enabled ? "#10b981" : "#ef4444", fontSize: "12px", fontWeight: "700" }}>
                   {data?.fleet?.enabled ? "BAYESIAN PRIORS ONLINE" : "ISOLATED MODE"}
                </span>
            </div>
            
            <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#e2e8f0", lineHeight: "1.5" }}>
                    Nova is executing Top Priority Actions utilizing <strong>{((data?.fleet?.localWeightActive || 1) * 100).toFixed(0)}% Local Memory</strong> and <strong>{((data?.fleet?.globalWeightActive || 0) * 100).toFixed(0)}% Global Priors</strong> strictly aggregated across <strong>{data?.fleet?.patternsBorrowed || 0} Active Identical Contexts</strong> securely.
                </p>
                <div style={{ display: "flex", gap: "24px" }}>
                     <div style={{ fontSize: "12px" }}><span style={{ color: "#94a3b8" }}>Global Matrix Confidence: </span><span style={{ color: "#38bdf8", fontWeight: "700" }}>{((data?.fleet?.globalConfidenceAvg || 0) * 100).toFixed(1)}%</span></div>
                     <div style={{ fontSize: "12px" }}><span style={{ color: "#94a3b8" }}>Aggregated Targets Borrowed: </span><span style={{ color: "#a855f7", fontWeight: "700" }}>{data?.fleet?.patternsBorrowed || 0} Contexts</span></div>
                </div>
            </div>
        </div>

        {/* ACTIVE TEMPORAL PLANS TABLE */}
        <div style={{ backgroundColor: "#1e293b", padding: "24px", borderRadius: "12px", border: "1px solid #334155", marginBottom: "32px" }}>
          <h3 style={{ margin: "0 0 20px 0", fontSize: "18px", color: "#f8fafc", fontWeight: "600" }}>🎯 Active Temporal Plans (Phase 16)</h3>
          
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8", fontSize: "12px", textTransform: "uppercase" }}>
                <th style={{ padding: "12px 8px" }}>Keyword</th>
                <th style={{ padding: "12px 8px" }}>Objective</th>
                <th style={{ padding: "12px 8px" }}>Current &gt; Next</th>
                <th style={{ padding: "12px 8px" }}>Confidence</th>
                <th style={{ padding: "12px 8px" }}>Projected Reward</th>
                <th style={{ padding: "12px 8px" }}>Progress</th>
                <th style={{ padding: "12px 8px" }}>Replans</th>
              </tr>
            </thead>
            <tbody>
               {(data?.activePlans || []).length === 0 && (
                   <tr><td colSpan={7} style={{ padding: "16px 8px", color: "#64748b", fontStyle: "italic", textAlign: "center" }}>No active plans currently generating...</td></tr>
               )}
              {(data?.activePlans || []).map((p, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #334155" }}>
                  <td style={{ padding: "16px 8px", fontWeight: "600", color: "#f8fafc" }}>{p.keyword}</td>
                  <td style={{ padding: "16px 8px", color: "#38bdf8", fontSize: "12px", textTransform: "uppercase", fontWeight: "700" }}>{p.objective}</td>
                  <td style={{ padding: "16px 8px", color: "#cbd5e1", fontSize: "12px" }}>
                     <span style={{ color: "#10b981", fontWeight: "700", textTransform: "uppercase" }}>{p.currentStep}</span> <span style={{ color: "#64748b" }}>→ {p.nextStep}</span>
                  </td>
                  <td style={{ padding: "16px 8px", fontSize: "12px", fontWeight: "700", color: "#a855f7" }}>{(p.confidence * 100).toFixed(0)}%</td>
                  <td style={{ padding: "16px 8px", fontSize: "12px", color: "#f59e0b", fontWeight: "700" }}>+{p.projectedReward}</td>
                  <td style={{ padding: "16px 8px" }}>
                      <div style={{ width: "100%", backgroundColor: "#0f172a", height: "8px", borderRadius: "4px", overflow: "hidden" }}>
                          <div style={{ width: `${p.progressPct}%`, backgroundColor: "#38bdf8", height: "100%" }} />
                      </div>
                      <span style={{ fontSize: "10px", color: "#94a3b8", marginTop: "4px", display: "block" }}>{p.progressPct}% COMPLETED</span>
                  </td>
                  <td style={{ padding: "16px 8px", fontSize: "12px", color: p.replanCount > 0 ? "#ef4444" : "#94a3b8" }}>{p.replanCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "24px" }}>
          
          {/* execution TABLE */}
          <div style={{ backgroundColor: "#1e293b", padding: "24px", borderRadius: "12px", border: "1px solid #334155" }}>
            <h3 style={{ margin: "0 0 20px 0", fontSize: "18px", color: "#f8fafc", fontWeight: "600" }}>🎯 Immediate Execution Priority (Top 5)</h3>
            
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8", fontSize: "13px", textTransform: "uppercase" }}>
                  <th style={{ padding: "12px 8px" }}>Keyword Cluster</th>
                  <th style={{ padding: "12px 8px" }}>UCB Score</th>
                  <th style={{ padding: "12px 8px" }}>Pos</th>
                  <th style={{ padding: "12px 8px" }}>Context Fingerprint (DNA)</th>
                  <th style={{ padding: "12px 8px" }}>Target Action</th>
                  <th style={{ padding: "12px 8px" }}>Bandit Modifier</th>
                  <th style={{ padding: "12px 8px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(data?.priorities || []).map((p, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #334155", backgroundColor: i === 0 ? "#0f172a" : "transparent" }}>
                    <td style={{ padding: "16px 8px", fontWeight: "600" }}>{p.keyword}</td>
                    <td style={{ padding: "16px 8px", color: "#38bdf8", fontWeight: "700" }}>{p.score?.toFixed(1)}</td>
                    <td style={{ padding: "16px 8px" }}>{p.currentPosition || "100+"}</td>
                    <td style={{ padding: "16px 8px", fontSize: "11px", color: "#94a3b8", maxWidth: "220px", wordWrap: "break-word" }}>{p.fingerprint || "unknown"}</td>
                    <td style={{ padding: "16px 8px", textTransform: "uppercase", fontSize: "12px", fontWeight: "700", color: "#cbd5e1" }}>{p.recommendedAction}</td>
                    <td style={{ padding: "16px 8px" }}>
                      <span style={{ backgroundColor: "#1e1b4b", color: "#818cf8", padding: "4px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "700" }}>{p.banditSelectedAction?.toUpperCase()}</span>
                      {p.constitutionEnforced && (
                         <span style={{ display: "block", marginTop: "6px", backgroundColor: "#7f1d1d", color: "#fca5a5", padding: "2px 6px", borderRadius: "2px", fontSize: "9px", fontWeight: "700" }}>CONSTITUTION OVERRIDE</span>
                      )}
                    </td>
                    <td style={{ padding: "16px 8px" }}>
                       <span style={{ border: "1px solid #334155", color: "#94a3b8", padding: "4px 8px", borderRadius: "4px", fontSize: "11px" }}>{p.status || "IDLE"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Historical Feed Sidebar */}
          <div style={{ backgroundColor: "#1e293b", padding: "24px", borderRadius: "12px", border: "1px solid #334155", overflowY: "auto", maxHeight: "400px" }}>
            <p style={{ margin: "0 0 16px 0", color: "#94a3b8", fontSize: "12px", textTransform: "uppercase", fontWeight: "600" }}>Audited Doctrine Shifts</p>
            <div style={{ display: "grid", gap: "12px" }}>
              {(data?.modeHistory || []).map((h, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", fontSize: "12px", paddingBottom: "12px", borderBottom: "1px solid #334155" }}>
                   <span style={{ color: "#64748b", marginBottom: "4px" }}>{new Date(h.at).toLocaleTimeString()}</span>
                   <span style={{ color: ModeColors[h.mode] || "#f8fafc", fontWeight: "600", textTransform: "uppercase" }}>{h.mode}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* GOVERNANCE TABLE */}
        <div style={{ backgroundColor: "#1e293b", padding: "24px", borderRadius: "12px", border: "1px solid #334155", marginTop: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
             <h3 style={{ margin: 0, fontSize: "18px", color: "#f8fafc", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>🛡️ Constitution Activity (Safety Limits)</h3>
             <span style={{ backgroundColor: "#7f1d1d", color: "#fca5a5", padding: "4px 12px", borderRadius: "4px", fontSize: "12px", fontWeight: "700" }}>BLOCKS TODAY: {data?.governance?.todayBlocksCount || 0}</span>
          </div>
          
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8", fontSize: "13px", textTransform: "uppercase" }}>
                <th style={{ padding: "12px 8px" }}>Timestamp</th>
                <th style={{ padding: "12px 8px" }}>Context Fingerprint</th>
                <th style={{ padding: "12px 8px" }}>Attempted Action</th>
                <th style={{ padding: "12px 8px" }}>Governance Matrix Correction</th>
                <th style={{ padding: "12px 8px" }}>Triggered Bounds</th>
              </tr>
            </thead>
            <tbody>
              {(data?.governance?.recentBlocks || []).map((b: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid #334155" }}>
                  <td style={{ padding: "16px 8px", color: "#94a3b8", fontSize: "12px" }}>{new Date(b.executedAt).toLocaleTimeString()}</td>
                  <td style={{ padding: "16px 8px", fontSize: "11px", color: "#94a3b8", maxWidth: "200px" }}>{b.fingerprint}</td>
                  <td style={{ padding: "16px 8px", textDecoration: "line-through", color: "#ef4444", fontSize: "12px", textTransform: "uppercase", fontWeight: "600" }}>{b.originalDecision}</td>
                  <td style={{ padding: "16px 8px", color: "#10b981", fontSize: "12px", textTransform: "uppercase", fontWeight: "700" }}>{b.finalDecision}</td>
                  <td style={{ padding: "16px 8px", color: "#cbd5e1", fontSize: "11px" }}>
                    {b.violations?.map((v: any, vi: number) => (
                      <div key={vi}><strong>{v.rule}:</strong> {v.reason}</div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 🧪 REALITY ENGINE TRUTH VERIFICATION PANEL */}
        <div style={{ backgroundColor: "#1e293b", padding: "24px", borderRadius: "12px", border: "1px solid #334155", marginTop: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, fontSize: "18px", color: "#f8fafc", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
                    🧪 Reality Engine (Truth & Self-Healing Matrix)
                </h3>
                <span style={{ backgroundColor: "#1e1b4b", color: "#a855f7", padding: "4px 12px", borderRadius: "4px", fontSize: "12px", fontWeight: "700" }}>
                   ACTIVE EVALUATIONS: {(data?.truthEvaluator || []).length}
                </span>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8", fontSize: "12px", textTransform: "uppercase" }}>
                  <th style={{ padding: "12px 8px" }}>Timeline Trace</th>
                  <th style={{ padding: "12px 8px" }}>Action Loop</th>
                  <th style={{ padding: "12px 8px" }}>Truth Ratio (Expected v Actual)</th>
                  <th style={{ padding: "12px 8px" }}>Verdict</th>
                  <th style={{ padding: "12px 8px" }}>Self-Healing Route</th>
                </tr>
              </thead>
              <tbody>
                 {(data?.truthEvaluator || []).length === 0 && (
                     <tr><td colSpan={5} style={{ padding: "16px 8px", color: "#64748b", fontStyle: "italic", textAlign: "center" }}>Scanning environmental arrays logically...</td></tr>
                 )}
                {(data?.truthEvaluator || []).map((t, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #334155" }}>
                    <td style={{ padding: "16px 8px", color: "#94a3b8", fontSize: "12px" }}>{new Date(t.observedAt).toLocaleString()}</td>
                    <td style={{ padding: "16px 8px", color: "#cbd5e1", fontSize: "12px", fontWeight: "600", textTransform: "uppercase" }}>{t.actionName}</td>
                    
                    <td style={{ padding: "16px 8px", fontSize: "12px" }}>
                       <span style={{ color: "#f8fafc", fontWeight: "700" }}>+{parseFloat(t.actualOutcome).toFixed(1)}</span> <span style={{ color: "#64748b" }}>/ +{t.expectedOutcome}</span>
                       <div style={{ marginTop: "4px", fontSize: "10px", color: "#a855f7", fontWeight: "700" }}>
                           SCORE: {(t.truthScore * 100).toFixed(0)}%
                       </div>
                    </td>

                    <td style={{ padding: "16px 8px" }}>
                       {t.verdict === "confirmed" && <span style={{ backgroundColor: "#064e3b", color: "#34d399", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "800", textTransform: "uppercase" }}>CONFIRMED</span>}
                       {t.verdict === "partial" && <span style={{ backgroundColor: "#78350f", color: "#fbbf24", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "800", textTransform: "uppercase" }}>PARTIAL</span>}
                       {t.verdict === "failed" && <span style={{ backgroundColor: "#7f1d1d", color: "#fca5a5", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "800", textTransform: "uppercase" }}>FAILED</span>}
                    </td>

                    <td style={{ padding: "16px 8px", fontSize: "12px" }}>
                       {t.selfHealingTriggered ? (
                           <span style={{ color: "#ef4444", fontWeight: "700" }}>
                               BLOCKED → REROUTING TO [{t.selfHealingAction?.toUpperCase()}]
                           </span>
                       ) : (
                           <span style={{ color: "#64748b" }}>Not triggered</span>
                       )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>

        {/* 🚀 AUTONOMOUS EXPANSION QUEUE */}
        <div style={{ backgroundColor: "#020617", padding: "24px", borderRadius: "12px", border: "1px solid #334155", marginTop: "24px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, fontSize: "18px", color: "#f8fafc", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
                    🚀 Autonomous Expansion Queue (Phase 19)
                </h3>
                <span style={{ backgroundColor: "#1e293b", color: "#38bdf8", padding: "4px 12px", borderRadius: "4px", fontSize: "12px", fontWeight: "700" }}>
                   OPPORTUNITIES DISCOVERED: {(data?.expansion || []).length}
                </span>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8", fontSize: "12px", textTransform: "uppercase" }}>
                  <th style={{ padding: "12px 8px" }}>Target Keyword</th>
                  <th style={{ padding: "12px 8px" }}>Expansion Vector</th>
                  <th style={{ padding: "12px 8px" }}>Source Node</th>
                  <th style={{ padding: "12px 8px" }}>Priority Score</th>
                  <th style={{ padding: "12px 8px" }}>Launch Status</th>
                </tr>
              </thead>
              <tbody>
                 {(data?.expansion || []).length === 0 && (
                     <tr><td colSpan={5} style={{ padding: "16px 8px", color: "#64748b", fontStyle: "italic", textAlign: "center" }}>No expansion vectors detected currently...</td></tr>
                 )}
                {(data?.expansion || []).map((e, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #334155" }}>
                    <td style={{ padding: "16px 8px", color: "#f8fafc", fontSize: "14px", fontWeight: "600" }}>{e.keyword}</td>
                    <td style={{ padding: "16px 8px", color: "#a855f7", fontSize: "11px", fontWeight: "700", textTransform: "uppercase" }}>{e.expansionType.replace(/_/g, " ")}</td>
                    <td style={{ padding: "16px 8px", color: "#cbd5e1", fontSize: "12px" }}>{e.source.replace(/_/g, " ")}</td>
                    <td style={{ padding: "16px 8px", fontSize: "12px", color: "#f59e0b", fontWeight: "800" }}>{e.priorityScore.toFixed(2)}</td>

                    <td style={{ padding: "16px 8px" }}>
                       {e.status === "discovered" && <span style={{ backgroundColor: "#1e1b4b", color: "#818cf8", padding: "4px 10px", borderRadius: "12px", fontSize: "10px", fontWeight: "800", textTransform: "uppercase" }}>DISCOVERED</span>}
                       {e.status === "launched" && <span style={{ backgroundColor: "#064e3b", color: "#34d399", padding: "4px 10px", borderRadius: "12px", fontSize: "10px", fontWeight: "800", textTransform: "uppercase" }}>LAUNCHED</span>}
                       {e.status === "rejected" && <span style={{ backgroundColor: "#7f1d1d", color: "#fca5a5", padding: "4px 10px", borderRadius: "12px", fontSize: "10px", fontWeight: "800", textTransform: "uppercase" }}>REJECTED</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>

        {/* 💰 PORTFOLIO ALLOCATION ENGINE */}
        <div style={{ backgroundColor: "#1e293b", padding: "24px", borderRadius: "12px", border: "1px solid #334155", marginTop: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, fontSize: "18px", color: "#f8fafc", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
                    💰 Portfolio Allocation Matrix (Phase 20)
                </h3>
                <span style={{ backgroundColor: "#1e1b4b", color: "#818cf8", padding: "4px 12px", borderRadius: "4px", fontSize: "12px", fontWeight: "700" }}>
                   ACTIVE POSITIONS: {(data?.portfolio || []).length}
                </span>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8", fontSize: "12px", textTransform: "uppercase" }}>
                  <th style={{ padding: "12px 8px" }}>Network Opportunity</th>
                  <th style={{ padding: "12px 8px" }}>Expected Reward</th>
                  <th style={{ padding: "12px 8px" }}>Compute / Token Cost</th>
                  <th style={{ padding: "12px 8px" }}>Time (Outcome)</th>
                  <th style={{ padding: "12px 8px" }}>Portfolio Score</th>
                  <th style={{ padding: "12px 8px" }}>System Status</th>
                </tr>
              </thead>
              <tbody>
                 {(data?.portfolio || []).length === 0 && (
                     <tr><td colSpan={6} style={{ padding: "16px 8px", color: "#64748b", fontStyle: "italic", textAlign: "center" }}>No portfolio arbitrage positions found...</td></tr>
                 )}
                {(data?.portfolio || []).map((p, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #334155" }}>
                    <td style={{ padding: "16px 8px" }}>
                        <span style={{ display: "block", color: "#f8fafc", fontSize: "14px", fontWeight: "600" }}>{p.title}</span>
                        <span style={{ color: "#94a3b8", fontSize: "11px", textTransform: "uppercase" }}>{p.type.replace(/_/g, " ")} | {p.keyword}</span>
                    </td>
                    <td style={{ padding: "16px 8px", fontSize: "13px", color: "#22c55e", fontWeight: "700" }}>+{p.expectedReward}</td>
                    <td style={{ padding: "16px 8px", fontSize: "12px", color: "#fca5a5" }}>{p.cost} Tokens</td>
                    <td style={{ padding: "16px 8px", fontSize: "12px", color: "#cbd5e1" }}>{p.timeToOutcomeDays} Days</td>
                    <td style={{ padding: "16px 8px", fontSize: "13px", color: "#fde047", fontWeight: "800" }}>{p.portfolioScore.toFixed(3)}</td>

                    <td style={{ padding: "16px 8px" }}>
                       {p.allocationStatus === "allocated" && <span style={{ backgroundColor: "#064e3b", color: "#34d399", padding: "4px 10px", borderRadius: "12px", fontSize: "10px", fontWeight: "800", textTransform: "uppercase" }}>ALLOCATED</span>}
                       {p.allocationStatus === "starved" && <span style={{ backgroundColor: "#7f1d1d", color: "#fca5a5", padding: "4px 10px", borderRadius: "12px", fontSize: "10px", fontWeight: "800", textTransform: "uppercase" }}>STARVED</span>}
                       {p.allocationStatus === "pending" && <span style={{ backgroundColor: "#1e1b4b", color: "#818cf8", padding: "4px 10px", borderRadius: "12px", fontSize: "10px", fontWeight: "800", textTransform: "uppercase" }}>PENDING</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>

        {/* 💵 REVENUE ATTRIBUTION ENGINE */}
        <div style={{ backgroundColor: "#022c22", padding: "24px", borderRadius: "12px", border: "1px solid #064e3b", marginTop: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, fontSize: "18px", color: "#f8fafc", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
                    💵 Revenue Attribution Engine (Phase 21)
                </h3>
                <span style={{ backgroundColor: "#064e3b", color: "#34d399", padding: "4px 12px", borderRadius: "4px", fontSize: "12px", fontWeight: "700" }}>
                   ATTRIBUTED RETURNS: {(data?.revenue || []).length}
                </span>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #064e3b", color: "#6ee7b7", fontSize: "12px", textTransform: "uppercase" }}>
                  <th style={{ padding: "12px 8px" }}>Event Match Date</th>
                  <th style={{ padding: "12px 8px" }}>Attributed Cash Source</th>
                  <th style={{ padding: "12px 8px" }}>Resolved Links (Goal/Plan/Cluster)</th>
                  <th style={{ padding: "12px 8px" }}>System Confidence</th>
                  <th style={{ padding: "12px 8px" }}>Outcome</th>
                </tr>
              </thead>
              <tbody>
                 {(data?.revenue || []).length === 0 && (
                     <tr><td colSpan={5} style={{ padding: "16px 8px", color: "#047857", fontStyle: "italic", textAlign: "center" }}>Scanning CRM APIs for correlated physical logic...</td></tr>
                 )}
                {(data?.revenue || []).map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #064e3b" }}>
                    <td style={{ padding: "16px 8px", color: "#d1fae5", fontSize: "12px" }}>{new Date(r.occurredAt).toLocaleString()}</td>
                    <td style={{ padding: "16px 8px", color: "#f8fafc", fontSize: "14px", fontWeight: "700" }}>
                        ${r.attributedValue.toFixed(2)}
                        <span style={{ display: "block", color: "#34d399", fontSize: "10px", marginTop: "4px", textTransform: "uppercase" }}>{r.attributionType.replace(/_/g, " ")} Weighted</span>
                    </td>
                    <td style={{ padding: "16px 8px", color: "#a7f3d0", fontSize: "12px" }}>
                       {r.goalId && <span style={{ display: "inline-block", backgroundColor: "#065f46", padding: "2px 6px", borderRadius: "4px", marginRight: "4px", marginBottom: "4px" }}>Goal Linked</span>}
                       {r.planId && <span style={{ display: "inline-block", backgroundColor: "#065f46", padding: "2px 6px", borderRadius: "4px", marginRight: "4px", marginBottom: "4px" }}>Plan Executed</span>}
                       {r.clusterId && <span style={{ display: "inline-block", backgroundColor: "#064e3b", padding: "2px 6px", borderRadius: "4px", marginRight: "4px", marginBottom: "4px" }}>Cluster Owning</span>}
                    </td>
                    <td style={{ padding: "16px 8px", fontSize: "12px", color: "#fbbf24", fontWeight: "800" }}>{(r.confidenceScore * 100).toFixed(0)}%</td>

                    <td style={{ padding: "16px 8px", fontSize: "12px", color: "#10b981", fontWeight: "700" }}>
                       <span style={{ backgroundColor: "#1e1b4b", color: "#818cf8", padding: "4px 10px", borderRadius: "12px", fontSize: "10px", fontWeight: "800", textTransform: "uppercase" }}>ATTRIBUTED</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>

        {/* 🧬 SYSTEM EVOLUTION PANEL (PHASE 22) */}
        <div style={{ backgroundColor: "#1e1b4b", padding: "24px", borderRadius: "12px", border: "1px solid #312e81", marginTop: "24px", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h3 style={{ margin: 0, fontSize: "18px", color: "#f8fafc", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
                    🧬 Meta-Intelligence Engine (Self-Improving Evolution)
                </h3>
                <span style={{ backgroundColor: "#312e81", color: "#818cf8", padding: "4px 12px", borderRadius: "4px", fontSize: "12px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}>
                   <div style={{ width: "6px", height: "6px", backgroundColor: "#a855f7", borderRadius: "50%", animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }} />
                   RECURSIVE SYSTEM VARIANTS: {(data?.metaVariants || []).length}
                </span>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #312e81", color: "#818cf8", fontSize: "12px", textTransform: "uppercase" }}>
                  <th style={{ padding: "12px 8px" }}>Algorithmic Variant Map</th>
                  <th style={{ padding: "12px 8px" }}>Network Yield</th>
                  <th style={{ padding: "12px 8px" }}>Target Meta-ROI</th>
                  <th style={{ padding: "12px 8px" }}>System State</th>
                </tr>
              </thead>
              <tbody>
                 {(data?.metaVariants || []).length === 0 && (
                     <tr><td colSpan={4} style={{ padding: "16px 8px", color: "#4f46e5", fontStyle: "italic", textAlign: "center" }}>Initiating recursive parameter arrays systematically...</td></tr>
                 )}
                {(data?.metaVariants || []).map((v, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #312e81" }}>
                    <td style={{ padding: "16px 8px" }}>
                        <span style={{ display: "block", color: "#f8fafc", fontSize: "14px", fontWeight: "600", fontFamily: "monospace" }}>{v.variantKey}</span>
                        <div style={{ color: "#a855f7", fontSize: "10px", marginTop: "4px", fontFamily: "monospace" }}>
                            {'{'} PriorityRatio: {v.config?.priorityWeights?.expectedReward || "1.0"}, 
                            BaseMutate: {v.config?.mutationRates?.baseRate || "0.1"} {'}'}
                        </div>
                    </td>
                    <td style={{ padding: "16px 8px", fontSize: "13px", color: "#34d399", fontWeight: "700" }}>
                        ${(v.performance?.totalRevenue || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: "16px 8px", fontSize: "14px", color: "#fde047", fontWeight: "800" }}>
                        {(v.performance?.roi || 0).toFixed(2)}x
                    </td>

                    <td style={{ padding: "16px 8px", fontSize: "12px", color: "#10b981", fontWeight: "700" }}>
                       {v.status === "testing" && <span style={{ backgroundColor: "#4c1d95", color: "#c4b5fd", padding: "4px 10px", borderRadius: "12px", fontSize: "10px", fontWeight: "800", textTransform: "uppercase" }}>TESTING MUTATION</span>}
                       {v.status === "active" && <span style={{ backgroundColor: "#064e3b", color: "#34d399", padding: "4px 10px", borderRadius: "12px", fontSize: "10px", fontWeight: "800", textTransform: "uppercase" }}>ACTIVE BASELINE</span>}
                       {v.status === "retired" && <span style={{ backgroundColor: "#7f1d1d", color: "#fca5a5", padding: "4px 10px", borderRadius: "12px", fontSize: "10px", fontWeight: "800", textTransform: "uppercase" }}>RETIRED (UNDERPERFORMED)</span>}
                       {v.status === "promoted" && <span style={{ backgroundColor: "#1e3a8a", color: "#60a5fa", padding: "4px 10px", borderRadius: "12px", fontSize: "10px", fontWeight: "800", textTransform: "uppercase" }}>PROMOTED LOGIC CORE</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>

      </div>
    </div>
  );
}

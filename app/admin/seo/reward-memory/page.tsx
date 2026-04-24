// app/admin/seo/reward-memory/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";

type ActionRecord = {
  actionFamily: string;
  avgReward: number;
  samples: number;
  lastReward: number;
};

type SegmentRecord = {
  segment: string;
  actions: ActionRecord[];
};

export default function RewardMemoryDashboard() {
  const [data, setData] = useState<SegmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSegment, setActiveSegment] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/reward-memory")
      .then((res) => res.json())
      .then((json) => {
        setData(json.segments || []);
        if (json.segments?.length > 0) {
          setActiveSegment(json.segments[0].segment);
        }
      })
      .catch((err) => console.error("Error loading segment data", err))
      .finally(() => setLoading(false));
  }, []);

  const selectedData = data.find((d) => d.segment === activeSegment);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f8fafc", padding: "40px 24px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto", backgroundColor: "#ffffff", padding: "32px", borderRadius: "16px", boxShadow: "0 4px 24px rgba(0,0,0,0.03)", border: "1px solid #e2e8f0" }}>
        
        <div style={{ marginBottom: "32px", borderBottom: "1px solid #e2e8f0", paddingBottom: "24px" }}>
          <h1 style={{ margin: "0 0 8px 0", color: "#0f172a", fontSize: "28px", fontWeight: "700", display: "flex", alignItems: "center", gap: "12px" }}>
            🧠 Reward Memory Control Surface
          </h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: "15px" }}>Live execution ledger driving the Upper Confidence Bound (UCB1) Machine Learning loops natively.</p>
        </div>

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : data.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
            No execution data recorded yet natively. Run a cluster to populate the matrices...
          </div>
        ) : (
          <div>
            {/* Context Segment Dropdown */}
            <div style={{ marginBottom: "24px" }}>
              <label style={{ display: "block", fontSize: "14px", fontWeight: "600", color: "#334155", marginBottom: "8px" }}>
                Target Context Segment
              </label>
              <select
                value={activeSegment || ""}
                onChange={(e) => setActiveSegment(e.target.value)}
                style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", backgroundColor: "#f8fafc", color: "#0f172a", fontSize: "15px", fontWeight: "500", cursor: "pointer", outline: "none" }}
              >
                {data.map((seg) => (
                  <option key={seg.segment} value={seg.segment}>
                    [{seg.segment.toUpperCase()}] Constraint Model
                  </option>
                ))}
              </select>
            </div>

            {/* Insight Display */}
            {selectedData && selectedData.actions.length > 0 && (
              <div style={{ backgroundColor: "#eff6ff", borderLeft: "4px solid #3b82f6", padding: "16px 20px", borderRadius: "8px", marginBottom: "32px", color: "#1e3a8a", fontSize: "15px" }}>
                🎯 <strong>Nova Insight:</strong> The <strong>{selectedData.actions[0].actionFamily.toUpperCase()}</strong> action is currently dominating the {selectedData.segment} algorithm. 
                Recommendation: Exploit {selectedData.actions[0].actionFamily} arrays heavily in this context.
              </div>
            )}

            <div style={{ display: "grid", gap: "16px" }}>
              {(selectedData?.actions || []).map((action, i) => {
                const trend = action.lastReward > (action.avgReward || 0);
                const stagnant = action.lastReward === action.avgReward;

                return (
                  <div key={action.actionFamily} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px", backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                      <div style={{ width: "40px", height: "40px", borderRadius: "50%", backgroundColor: i === 0 ? "#fef08a" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", fontWeight: "bold" }}>
                         {i === 0 ? "🔥" : i+1}
                      </div>
                      <div>
                        <h3 style={{ margin: "0 0 4px 0", color: "#0f172a", fontSize: "16px", fontWeight: "600", textTransform: "capitalize" }}>{action.actionFamily}</h3>
                        <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>{action.samples} Array Samples Executed</p>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "24px", textAlign: "right" }}>
                      <div>
                         <p style={{ margin: "0 0 4px 0", color: "#64748b", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Avg Reward</p>
                         <p style={{ margin: 0, color: "#0f172a", fontSize: "18px", fontWeight: "700" }}>{action.avgReward.toFixed(1)}</p>
                      </div>
                      
                      <div style={{ borderLeft: "1px solid #e2e8f0", paddingLeft: "24px" }}>
                         <p style={{ margin: "0 0 4px 0", color: "#64748b", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Last Delta</p>
                         <div style={{ display: "flex", alignItems: "center", gap: "4px", color: stagnant ? "#64748b" : trend ? "#10b981" : "#ef4444" }}>
                            <p style={{ margin: 0, fontSize: "16px", fontWeight: "600" }}>
                              {action.lastReward > 0 ? "+" : ""}{action.lastReward || 0}
                            </p>
                            {stagnant ? <Minus size={16} /> : trend ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                         </div>
                      </div>
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

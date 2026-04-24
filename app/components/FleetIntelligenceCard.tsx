'use client';

import { useState, useEffect } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// FleetIntelligenceCard — Admin CRM dashboard component
//
// Fetches /api/admin/brain/fleet-insights?userId=...
// Shows cross-client learning insights in Google Material light design.
// ──────────────────────────────────────────────────────────────────────────────

interface FleetData {
  topPerformingArm:     string | null;
  topSegment:           string | null;
  clientRankPercentile: number | null;
  fleetSize:            number;
  confidence:           number;
  isUsingGlobalPrior:   boolean;
  blendWeights:         { localWeight: number; globalWeight: number };
  segmentPerformance:   { wins: number; trials: number; confidence: number };
  recommendation:       { arm: string | null; reason: string };
  novaInsight:          string;
}

function ConfBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: '6px', background: '#f1f3f4', borderRadius: '4px', overflow: 'hidden', marginTop: '4px' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 1s ease' }} />
    </div>
  );
}

function Stat({ label, val, sub }: { label: string; val: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '6px 0', borderBottom: '1px solid #f8f9fa' }}>
      <span style={{ fontSize: '12px', color: '#5f6368' }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#202124' }}>{val}</div>
        {sub && <div style={{ fontSize: '10px', color: '#80868b' }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function FleetIntelligenceCard({ userId }: { userId: string }) {
  const [data,    setData]    = useState<FleetData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/admin/brain/fleet-insights?userId=${userId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  if (loading) return (
    <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', padding: '20px', height: '200px', animation: 'shimmer 1.3s ease-in-out infinite' }}>
      <style>{`@keyframes shimmer{0%,100%{opacity:.5}50%{opacity:1}}`}</style>
    </div>
  );

  if (!data) return null;

  const arm     = data.topPerformingArm?.replace(/_/g, " ") ?? null;
  const hasData = data.confidence > 0 || data.fleetSize > 0;

  return (
    <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', overflow: 'hidden', fontFamily: '"Google Sans", Inter, system-ui, sans-serif', boxShadow: '0 1px 3px rgba(60,64,67,0.08)' }}>

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f3f4', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🧠</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#202124' }}>Fleet Intelligence</span>
        </div>
        {data.isUsingGlobalPrior && (
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#1a73e8', background: '#e8f0fe', padding: '3px 10px', borderRadius: '10px' }}>
            🌐 Cross-client active
          </span>
        )}
      </div>

      <div style={{ padding: '16px 20px' }}>
        {!hasData ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#80868b', fontSize: '13px' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>📡</div>
            Gathering fleet data…
          </div>
        ) : (
          <>
            {/* Top strategy */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '10px', color: '#80868b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '4px' }}>Top Strategy</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: arm ? '#137333' : '#bdc1c6', letterSpacing: '-0.3px' }}>
                {arm ?? 'Not enough data yet'}
              </div>
              {data.topSegment && (
                <div style={{ fontSize: '10px', color: '#80868b', marginTop: '2px' }}>Best in: {data.topSegment}</div>
              )}
            </div>

            {/* Stats grid */}
            <Stat label="Your rank"    val={data.clientRankPercentile != null ? `Top ${100 - data.clientRankPercentile}%` : '—'} sub="vs fleet avg reward" />
            <Stat label="Fleet size"   val={String(data.fleetSize)} sub="accounts contributing" />
            <Stat label="Confidence"   val={`${data.confidence}%`} sub={`${data.segmentPerformance.trials} total trials`} />

            {/* Confidence bar */}
            <div style={{ marginTop: '10px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ fontSize: '10px', color: '#80868b' }}>Signal strength</span>
                <span style={{ fontSize: '10px', fontWeight: 600, color: data.confidence > 60 ? '#137333' : data.confidence > 30 ? '#e37400' : '#80868b' }}>{data.confidence}%</span>
              </div>
              <ConfBar
                pct={data.confidence}
                color={data.confidence > 60 ? '#34a853' : data.confidence > 30 ? '#fbbc04' : '#dadce0'}
              />
            </div>

            {/* Blend weights */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <div style={{ flex: 1, background: '#f8f9fa', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: '#80868b', fontWeight: 600 }}>LOCAL</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#202124' }}>{Math.round(data.blendWeights.localWeight * 100)}%</div>
              </div>
              <div style={{ flex: 1, background: '#e8f0fe', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: '#1a73e8', fontWeight: 600 }}>GLOBAL</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#1a73e8' }}>{Math.round(data.blendWeights.globalWeight * 100)}%</div>
              </div>
            </div>

            {/* Nova Insight */}
            <div style={{ background: '#f8f9fa', borderRadius: '8px', padding: '12px 14px', borderLeft: '3px solid #1a73e8' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#1a73e8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>💡 Nova Insight</div>
              <div style={{ fontSize: '12px', color: '#5f6368', lineHeight: 1.6 }}>{data.novaInsight}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

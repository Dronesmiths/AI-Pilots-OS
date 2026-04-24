'use client';

import { useState, useEffect } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// MomentumWidget — The one number hero
//
// Shows: score, delta (↑/↓), status label, input breakdown
// Works in both admin (userId prop) and client dashboard (cookie)
// ──────────────────────────────────────────────────────────────────────────────

interface MomentumData {
  score:    number;
  previous: number;
  delta:    number;
  status:   string;
  inputs:   {
    strength:   number;
    streak:     number;
    velocity:   number;
    percentile: number;
  };
}

interface Props {
  userId?: string;  // admin view; omit for cookie-auth client view
  compact?: boolean;  // compact mode for card grid
}

function statusColor(status: string): string {
  if (status === 'Dominating')   return '#7c3aed';
  if (status === 'Accelerating') return '#1a73e8';
  if (status === 'Building')     return '#e37400';
  return '#5f6368';
}

function statusBg(status: string): string {
  if (status === 'Dominating')   return '#f5f3ff';
  if (status === 'Accelerating') return '#e8f0fe';
  if (status === 'Building')     return '#fef3e2';
  return '#f8f9fa';
}

function scoreMicrocopy(status: string): string {
  if (status === 'Dominating')   return 'Outperforming most accounts consistently';
  if (status === 'Accelerating') return 'Nova is compounding results';
  if (status === 'Building')     return 'Nova is building your growth engine';
  return 'Nova is warming up';
}

function InputBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
      <span style={{ fontSize: '10px', color: '#80868b', width: '64px', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: '4px', background: '#f1f3f4', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.8s ease' }} />
      </div>
      <span style={{ fontSize: '10px', fontWeight: 600, color: '#5f6368', width: '28px', textAlign: 'right' }}>{Math.round(value)}</span>
    </div>
  );
}

export default function MomentumWidget({ userId, compact = false }: Props) {
  const [data,    setData]    = useState<MomentumData | null>(null);
  const [loading, setLoading] = useState(true);

  const endpoint = userId ? `/api/admin/brain/momentum?userId=${userId}` : '/api/client/momentum';

  useEffect(() => {
    fetch(endpoint)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [endpoint]);

  if (loading) return (
    <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', padding: '20px', height: compact ? '100px' : '200px', animation: 'shimmer 1.3s ease-in-out infinite' }}>
      <style>{`@keyframes shimmer{0%,100%{opacity:.5}50%{opacity:1}}`}</style>
    </div>
  );
  if (!data) return null;

  const { score, delta, status, inputs } = data;
  const color   = statusColor(status);
  const bgColor = statusBg(status);
  const deltaPos = delta >= 0;

  return (
    <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', overflow: 'hidden', fontFamily: '"Google Sans", Inter, system-ui, sans-serif', boxShadow: '0 1px 3px rgba(60,64,67,0.08)' }}>

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f3f4', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '16px' }}>⚡</span>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#202124' }}>Momentum Score</span>
      </div>

      <div style={{ padding: '20px' }}>

        {/* Hero number */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontSize: '52px', fontWeight: 900, color, letterSpacing: '-3px', lineHeight: 1 }}>
              {score}
            </span>
          </div>

          <div style={{ paddingBottom: '8px' }}>
            {/* Delta */}
            <div style={{ fontSize: '14px', fontWeight: 700, color: deltaPos ? '#137333' : '#c5221f', marginBottom: '2px' }}>
              {deltaPos ? '↑' : '↓'} {Math.abs(delta)} today
            </div>
            {/* Status pill */}
            <div style={{ padding: '3px 10px', background: bgColor, borderRadius: '20px', display: 'inline-block' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color }}>{status}</span>
            </div>
          </div>
        </div>

        {/* Microcopy */}
        <div style={{ fontSize: '12px', color: '#5f6368', marginBottom: '16px', lineHeight: 1.5 }}>
          {scoreMicrocopy(status)}
        </div>

        {/* Input breakdown */}
        {!compact && (
          <div style={{ paddingTop: '12px', borderTop: '1px solid #f1f3f4' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#80868b', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px' }}>
              Score breakdown
            </div>
            <InputBar label="Engine"     value={inputs?.strength   ?? 0} color="#1a73e8" />
            <InputBar label="Streak"     value={inputs?.streak     ?? 0} color="#188038" />
            <InputBar label="Velocity"   value={inputs?.velocity   ?? 0} color="#e37400" />
            <InputBar label="Rank"       value={inputs?.percentile ?? 0} color="#7c3aed" />
          </div>
        )}
      </div>
    </div>
  );
}

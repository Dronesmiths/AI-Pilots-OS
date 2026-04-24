'use client';

import { useState, useEffect } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// GrowthStreakCard — Google Material light design
//
// Fetches from /api/client/streak (cookie auth) or
//             /api/admin/brain/streak?userId=... (admin)
//
// Usage:
//   <GrowthStreakCard />                  ← client dashboard (cookie)
//   <GrowthStreakCard userId="..." />     ← admin view
// ──────────────────────────────────────────────────────────────────────────────

interface StreakData {
  current:     number;
  best:        number;
  lastWinDate: string | null;
  atRisk:      boolean;
  icon:        string;
  microcopy:   string;
  history:     { date: string; won: boolean }[];
}

interface Props {
  userId?: string;  // if omitted, uses cookie-auth client endpoint
}

function DayDot({ won, isToday }: { won: boolean; isToday: boolean }) {
  return (
    <div style={{
      width:        '10px',
      height:       '10px',
      borderRadius: '50%',
      background:   won ? '#3b82f6' : '#e2e8f0',
      border:       isToday ? '2px solid #1d4ed8' : '2px solid transparent',
      transition:   'all 0.2s ease',
      flexShrink:   0,
    }} />
  );
}

export default function GrowthStreakCard({ userId }: Props) {
  const [data,    setData]    = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);

  const endpoint = userId
    ? `/api/admin/brain/streak?userId=${userId}`
    : '/api/client/streak';

  useEffect(() => {
    fetch(endpoint)
      .then(r => r.json())
      .then(d => { if (d.current !== undefined) setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [endpoint]);

  if (loading) return (
    <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', padding: '20px', height: '160px', animation: 'shimmer 1.3s ease-in-out infinite' }}>
      <style>{`@keyframes shimmer{0%,100%{opacity:.5}50%{opacity:1}}`}</style>
    </div>
  );
  if (!data) return null;

  const { current, best, atRisk, icon, microcopy, history } = data;

  // Color scheme
  const isActive = current > 0 && !atRisk;
  const accentColor = atRisk ? '#f59e0b' : current >= 7 ? '#ef4444' : '#3b82f6';
  const accentBg    = atRisk ? '#fffbeb' : current >= 7 ? '#fef2f2' : '#eff6ff';

  // Build last 14 days calendar with history
  const today = new Date().toISOString().slice(0, 10);
  const days: { date: string; won: boolean; isToday: boolean }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d   = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const entry = history.find(h => h.date === iso);
    days.push({ date: iso, won: entry?.won ?? false, isToday: iso === today });
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', overflow: 'hidden', fontFamily: '"Google Sans", Inter, system-ui, sans-serif', boxShadow: '0 1px 3px rgba(60,64,67,0.08)' }}>

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f3f4', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '16px' }}>🔥</span>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#202124' }}>Growth Streak</span>
        {atRisk && (
          <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '3px 10px', borderRadius: '10px' }}>
            ⚠️ At risk
          </span>
        )}
      </div>

      <div style={{ padding: '18px 20px' }}>

        {/* Hero number */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
          <div style={{ padding: '12px 20px', background: accentBg, borderRadius: '12px', textAlign: 'center', minWidth: '80px' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '2px' }}>Current</div>
            <div style={{ fontSize: '30px', fontWeight: 800, color: accentColor, lineHeight: 1, letterSpacing: '-1px' }}>
              {current}
            </div>
            <div style={{ fontSize: '10px', color: accentColor, opacity: 0.7, marginTop: '2px' }}>day{current !== 1 ? 's' : ''}</div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#202124', marginBottom: '4px' }}>
              {icon} {current === 0 ? 'Streak reset' : current >= 7 ? `${current} Day Streak` : `${current} Day Streak`}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>{microcopy}</div>
          </div>
        </div>

        {/* Best streak */}
        {best > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', marginBottom: '14px' }}>
            <span style={{ fontSize: '12px', color: '#64748b' }}>Best streak</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#202124' }}>🏆 {best} day{best !== 1 ? 's' : ''}</span>
          </div>
        )}

        {/* 14-day calendar dots */}
        <div>
          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>Last 14 days</div>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {days.map(d => (
              <DayDot key={d.date} won={d.won} isToday={d.isToday} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ fontSize: '9px', color: '#cbd5e1' }}>14d ago</span>
            <span style={{ fontSize: '9px', color: '#3b82f6', fontWeight: 600 }}>today</span>
          </div>
        </div>

      </div>
    </div>
  );
}

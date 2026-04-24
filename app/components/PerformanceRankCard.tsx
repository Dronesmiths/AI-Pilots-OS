'use client';

import { useState, useEffect } from 'react';
import type { LeaderboardTier } from '@/lib/fleetLeaderboard';

// ──────────────────────────────────────────────────────────────────────────────
// PerformanceRankCard — Google Material light
//
// Shows client's fleet ranking: tier, percentile, rank/total, microcopy.
// Designed to sit next to FleetIntelligenceCard or Engine Strength card.
// ──────────────────────────────────────────────────────────────────────────────

interface RankData {
  percentile:    number | null;
  tier:          LeaderboardTier;
  score:         number;
  rank:          number | null;
  total:         number | null;
  microcopy:     string;
  outperforming: number | null;
}

function tierColor(tier: LeaderboardTier): string {
  if (tier === 'Top 1%')  return '#7c3aed';   // purple — elite
  if (tier === 'Top 5%')  return '#059669';   // emerald
  if (tier === 'Top 10%') return '#16a34a';   // green
  if (tier === 'Top 25%') return '#2563eb';   // blue
  return '#64748b';                            // grey — building
}

function tierBg(tier: LeaderboardTier): string {
  if (tier === 'Top 1%')  return '#f5f3ff';
  if (tier === 'Top 5%')  return '#ecfdf5';
  if (tier === 'Top 10%') return '#dcfce7';
  if (tier === 'Top 25%') return '#dbeafe';
  return '#f8fafc';
}

function tierIcon(tier: LeaderboardTier): string {
  if (tier === 'Top 1%')  return '🏆';
  if (tier === 'Top 5%')  return '🥇';
  if (tier === 'Top 10%') return '🥈';
  if (tier === 'Top 25%') return '📈';
  return '🔧';
}

export default function PerformanceRankCard({ userId }: { userId: string }) {
  const [data,    setData]    = useState<RankData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/admin/brain/leaderboard?userId=${userId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  if (loading) return (
    <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', padding: '20px', height: '180px', animation: 'shimmer 1.3s ease-in-out infinite' }}>
      <style>{`@keyframes shimmer{0%,100%{opacity:.5}50%{opacity:1}}`}</style>
    </div>
  );

  if (!data) return null;

  const { tier, percentile, rank, total, microcopy, outperforming } = data;
  const color = tierColor(tier);
  const bg    = tierBg(tier);
  const icon  = tierIcon(tier);
  const hasRank = rank != null && total != null;

  return (
    <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', overflow: 'hidden', fontFamily: '"Google Sans", Inter, system-ui, sans-serif', boxShadow: '0 1px 3px rgba(60,64,67,0.08)' }}>

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f3f4', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '16px' }}>🏆</span>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#202124' }}>Performance Rank</span>
      </div>

      <div style={{ padding: '20px' }}>

        {/* Tier hero */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ padding: '10px 18px', background: bg, border: `1px solid ${color}22`, borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>{icon}</span>
            <span style={{ fontSize: '18px', fontWeight: 800, color, letterSpacing: '-0.5px' }}>{tier}</span>
          </div>
          {hasRank && (
            <div style={{ textAlign: 'right', flex: 1 }}>
              <div style={{ fontSize: '10px', color: '#80868b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rank</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#202124' }}>#{rank} <span style={{ fontSize: '12px', fontWeight: 400, color: '#80868b' }}>of {total}</span></div>
            </div>
          )}
        </div>

        {/* Outperforming stat */}
        {outperforming != null && (
          <div style={{ marginBottom: '14px', padding: '10px 14px', background: '#f8f9fa', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#5f6368', marginBottom: '2px' }}>You are outperforming</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color, lineHeight: 1.1 }}>{outperforming}%</div>
            <div style={{ fontSize: '11px', color: '#80868b', marginTop: '1px' }}>of accounts in this fleet</div>
          </div>
        )}

        {/* Percentile bar */}
        {percentile != null && (
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '10px', color: '#80868b', fontWeight: 600 }}>Percentile</span>
              <span style={{ fontSize: '10px', fontWeight: 700, color }}>{percentile}th</span>
            </div>
            <div style={{ height: '6px', background: '#f1f3f4', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${percentile}%`, height: '100%', background: `linear-gradient(90deg, ${color}99, ${color})`, borderRadius: '4px', transition: 'width 1.2s ease' }} />
            </div>
          </div>
        )}

        {/* Microcopy */}
        <div style={{ fontSize: '12px', color: '#5f6368', lineHeight: 1.6, borderLeft: `3px solid ${color}44`, paddingLeft: '10px' }}>
          {microcopy}
        </div>
      </div>
    </div>
  );
}

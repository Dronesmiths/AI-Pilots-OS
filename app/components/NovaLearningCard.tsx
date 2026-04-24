'use client';

import { useState, useEffect } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// NovaLearningCard — Phase 8 meta-learning UI
//
// Shows what Nova has learned about which reactions actually work.
// Data from /api/admin/brain/nova-learning?userId=...
// ──────────────────────────────────────────────────────────────────────────────

interface ReactionStat {
  reaction:     string;
  wins:         number;
  trials:       number;
  successRate:  number;
}

interface RecentReaction {
  reaction:             string;
  success:              boolean;
  delta:                number;
  evaluatedAt:          string;
  engineStrengthBefore: number;
  engineStrengthAfter:  number;
}

interface LearningData {
  bestReaction:    string | null;
  bestSuccessRate: number;
  totalTrials:     number;
  hasEnoughData:   boolean;
  reactionStats:   ReactionStat[];
  recentReactions: RecentReaction[];
}

function reactionLabel(r: string): string {
  return r.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function reactionIcon(r: string): string {
  if (r === 'BOOST_EXPLORATION')   return '🔭';
  if (r === 'REDUCE_EXPLORATION')  return '🎯';
  if (r === 'FORCE_PUBLISH')       return '📄';
  if (r === 'STREAK_SAVE')         return '🔥';
  return '🧠';
}

function BarCell({ rate, best }: { rate: number; best: boolean }) {
  const pct = Math.round(rate * 100);
  return (
    <div style={{ width: '100%' }}>
      <div style={{ height: '6px', background: '#f1f3f4', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: best ? '#1a73e8' : '#dadce0', borderRadius: '4px', transition: 'width 0.8s ease' }} />
      </div>
    </div>
  );
}

export default function NovaLearningCard({ userId }: { userId: string }) {
  const [data,    setData]    = useState<LearningData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/admin/brain/nova-learning?userId=${userId}`)
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

  const { bestReaction, bestSuccessRate, totalTrials, hasEnoughData, reactionStats, recentReactions } = data;

  return (
    <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px', overflow: 'hidden', fontFamily: '"Google Sans", Inter, system-ui, sans-serif', boxShadow: '0 1px 3px rgba(60,64,67,0.08)' }}>

      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f3f4', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🧠</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#202124' }}>Nova Learning</span>
        </div>
        <span style={{ fontSize: '10px', color: '#80868b' }}>{totalTrials} total trials</span>
      </div>

      <div style={{ padding: '16px 20px' }}>

        {!hasEnoughData ? (
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#80868b', fontSize: '13px' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>📡</div>
            <div style={{ fontWeight: 600, color: '#5f6368', marginBottom: '4px' }}>Nova is improving its own strategy</div>
            <div style={{ fontSize: '12px', lineHeight: 1.5 }}>Gathering data across reaction types.<br />Insights appear after {Math.max(0, 12 - totalTrials)} more trials.</div>
          </div>
        ) : (
          <>
            {/* Best reaction hero */}
            {bestReaction && (
              <div style={{ background: '#e8f0fe', border: '1px solid #c5dbf9', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '22px' }}>{reactionIcon(bestReaction)}</span>
                <div>
                  <div style={{ fontSize: '10px', color: '#1a73e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Best Recovery Action</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#1a1a1a' }}>{reactionLabel(bestReaction)}</div>
                  <div style={{ fontSize: '11px', color: '#5f6368', marginTop: '1px' }}>{Math.round(bestSuccessRate * 100)}% success rate</div>
                </div>
              </div>
            )}

            {/* Reaction stats table */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#80868b', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px' }}>All Reactions</div>
              {reactionStats.map(r => {
                const isBest = r.reaction === bestReaction;
                return (
                  <div key={r.reaction} style={{ display: 'grid', gridTemplateColumns: '20px 1fr 60px 30px', gap: '8px', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #f8f9fa' }}>
                    <span style={{ fontSize: '13px' }}>{reactionIcon(r.reaction)}</span>
                    <BarCell rate={r.successRate} best={isBest} />
                    <span style={{ fontSize: '11px', color: isBest ? '#1a73e8' : '#5f6368', fontWeight: isBest ? 700 : 400, textAlign: 'right' }}>
                      {Math.round(r.successRate * 100)}%
                    </span>
                    <span style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'right' }}>{r.trials}t</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Recent evaluated reactions */}
        {recentReactions.length > 0 && (
          <div>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#80868b', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>Recent</div>
            {recentReactions.map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '11px', borderBottom: i < recentReactions.length - 1 ? '1px solid #f8f9fa' : 'none' }}>
                <span style={{ color: '#5f6368' }}>{reactionIcon(r.reaction)} {reactionLabel(r.reaction)}</span>
                <span style={{ fontWeight: 600, color: r.success ? '#137333' : '#c5221f' }}>
                  {r.success ? `+${r.delta?.toFixed(1)}` : r.delta?.toFixed(1)} pts
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Nova insight footer */}
        {hasEnoughData && bestReaction && (
          <div style={{ marginTop: '14px', background: '#f8f9fa', borderRadius: '8px', padding: '10px 12px', borderLeft: '3px solid #1a73e8' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#1a73e8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>💡 Nova Insight</div>
            <div style={{ fontSize: '12px', color: '#5f6368', lineHeight: 1.5 }}>
              Nova is improving its own strategy. {reactionLabel(bestReaction)} is outperforming other recovery actions in your environment.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

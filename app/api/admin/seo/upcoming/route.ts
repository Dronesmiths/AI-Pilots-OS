import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { SeoCluster } from '@/models/SeoCluster';

const DRONE_CONFIGS: Record<string, { icon: string; color: string; label: string }> = {
  qa:          { icon: '🤖', color: '#6366F1', label: 'LLM QA' },
  location:    { icon: '📍', color: '#D97706', label: 'GEO PAGES' },
  blog:        { icon: '📝', color: '#059669', label: 'BLOG POSTS' },
  cornerstone: { icon: '🏛️', color: '#DC2626', label: 'PILLARS' },
};

export async function GET(req: NextRequest) {
  await connectToDatabase();
  
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });

  const upcoming = [];
  
  for (const [category, config] of Object.entries(DRONE_CONFIGS)) {
    const queuedCount = await SeoCluster.countDocuments({ 
      tenantId, 
      category, 
      status: { $in: ['idle', 'queued', 'generating'] } 
    });
    
    const samples = await SeoCluster.find({ 
      tenantId, 
      category, 
      status: { $in: ['idle', 'queued', 'generating'] } 
    }).sort({ scheduledTime: 1 }).limit(3).lean();

    const firstJob = samples[0];
    const nextIn = firstJob ? true : false;
    // Auto-detect past launch: "lastSeen" logic expected by frontend
    const lastSeen = firstJob ? new Date().toISOString() : 'never';

    upcoming.push({
      category,
      icon: config.icon,
      color: config.color,
      label: config.label,
      queued: queuedCount,
      nextIn,
      lastSeen,
      samples: samples.map(s => ({
        keyword: s.keyword,
        status: s.status,
      }))
    });
  }

  return NextResponse.json({ upcoming }, { headers: { 'Cache-Control': 'no-store' } });
}

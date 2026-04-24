import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { SeoCluster } from '@/models/SeoCluster';

export async function GET(req: NextRequest) {
  await connectToDatabase();
  
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });

  const allClusters = await SeoCluster.find({ tenantId }).lean();
  
  const queued = allClusters.filter(c => ['idle', 'queued', 'generating'].includes(c.status));
  const published = allClusters.filter(c => ['published', 'Live'].includes(c.status));

  return NextResponse.json({
    totalQueued: queued.length,
    totalPublished: published.length,
    queued,
    published,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

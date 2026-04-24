import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import connectToDatabase from '@/lib/mongodb';
import SeoTelemetryLog from '@/models/SeoTelemetryLog';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const adminToken = cookieStore.get('admin_token')?.value;
    if (!adminToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await connectToDatabase();
    
    // Fetch last 30 days of centralized ignition telemetry
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const logs = await SeoTelemetryLog.find({ timestamp: { $gte: thirtyDaysAgo } }).sort({ timestamp: 1 });
    
    return NextResponse.json({ logs });
  } catch (err: any) {
    console.error('API /admin/seo-metrics Telemetry Aggregation Error:', err);
    return NextResponse.json({ error: 'Failed to fetch autonomous telemetry logs' }, { status: 500 });
  }
}

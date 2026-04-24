import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import MarketInsight from '@/models/MarketInsight';
import User from '@/models/User';

/**
 * Phase 6: Autonomous Market Insights Queue
 * Receives external GSC/Trends analytics telemetry (usually from Jules) and parses them into tangible mapped SEO Expansion payloads.
 */
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { client_id, keyword, impressions_surge, proposed_payload, confidence_score } = payload;

    if (!client_id || !keyword) {
      return NextResponse.json({ error: 'Missing client_id or core keyword parameter.' }, { status: 400 });
    }

    await connectToDatabase();
    
    // Formally validate that the CRM ledger possesses tracking rights to this anomaly payload
    const user = await User.findById(client_id).lean();
    if (!user) {
      return NextResponse.json({ error: 'Client Ledger mapping anomaly: Target does not exist in CRM.' }, { status: 404 });
    }

    // Compile Insight Data Block
    const insight = await MarketInsight.create({
      user: client_id,
      keyword,
      impressions_surge: impressions_surge || '+0%',
      proposed_payload: Array.isArray(proposed_payload) ? proposed_payload : [proposed_payload],
      confidence_score: confidence_score || 85,
      status: 'pending' // Force safe lock. Humans MUST 1-click approve these via UI.
    });

    console.log(`[GSC INSIGHTS] Remote Network banked a new market recommendation for ${user.name}: ${keyword}`);

    return NextResponse.json({ success: true, insightId: insight._id });
  } catch (error: any) {
    console.error(`[GSC INSIGHTS] Webhook ledger construction failed intrinsically:`, error.message);
    return NextResponse.json({ error: 'Internal Server Error orchestrating db mapping.' }, { status: 500 });
  }
}

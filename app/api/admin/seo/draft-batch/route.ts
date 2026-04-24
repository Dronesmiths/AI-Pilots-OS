import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as Record<string, any>;
      if (decoded.role !== 'superadmin') throw new Error('Insufficient privileges');
    } catch (e) {
      return NextResponse.json({ error: 'Invalid master key signature.' }, { status: 401 });
    }

    const { userId, queries, action } = await req.json();
    if (!userId || !queries || !Array.isArray(queries)) {
      return NextResponse.json({ error: 'Missing parameters. Ensure queries array is passed.' }, { status: 400 });
    }

    await connectToDatabase();
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Fetch raw BSON to access legacy keys that were stripped by Mongoose strict schema
    const rawUser: any = await User.findById(userId).lean();
    
    // Completely rebuild the array using the raw BSON data to prevent data loss
    const rawClusters = rawUser.seoClusters || [];
    user.seoClusters = rawClusters.map((rawCluster: any) => ({
        ...rawCluster,
        keyword: rawCluster.keyword || rawCluster.target || 'Unknown Keyword',
        status: ['idea', 'queued', 'draft', 'Drafting', 'deploying', 'published', 'Live', 'generated', 'error', 'failed'].includes(rawCluster.status) ? rawCluster.status : 'idea',
        serviceProduct: rawCluster.serviceProduct || rawCluster.clusterType || 'Semantic Gap'
    }));

    const targetStatus = action === 'idea' ? 'idea' : 'draft';

    // Prevent duplicates and apply Geographic Carpet Bombing
    const injectionNodes: any[] = [];
    
    queries.forEach((q: any) => {
        const rawQueryText = (typeof q === 'string' ? q : q.query).trim();
        const views = typeof q === 'object' ? (q.impressions || q.volume || 0) : 0;
        let category = typeof q === 'object' ? (q.category || 'service') : 'service';
        const isLlmQA = typeof q === 'object' ? (q.isLlmQA || false) : false;

        // Geographic Carpet Bomb Mechanism
        if (!isLlmQA && user.targetServiceAreas && user.targetServiceAreas.length > 0) {
            category = 'location'; // Forces the local schema builder downstream
            user.targetServiceAreas.forEach((localArea: string) => {
                let localizedKeyword = rawQueryText;
                // Only append if they didn't manually type the city already
                if (!localizedKeyword.toLowerCase().includes(localArea.toLowerCase())) {
                     localizedKeyword = `${rawQueryText} ${localArea}`;
                }
                injectionNodes.push({ queryText: localizedKeyword, views, category, isLlmQA, localArea });
            });
        } else {
            injectionNodes.push({ queryText: rawQueryText, views, category, isLlmQA, localArea: null });
        }
    });

    injectionNodes.forEach(node => {
        const existingIndex = user.seoClusters.findIndex((c: any) => c.keyword.toLowerCase() === node.queryText.toLowerCase());
        if (existingIndex === -1) {
            user.seoClusters.push({
                keyword: node.queryText,
                category: node.category,
                location: node.localArea || null,
                impressions: node.views,
                serviceProduct: 'Semantic Gap Injection',
                status: targetStatus,
                isLlmQA: node.isLlmQA,
                pushedAt: new Date()
            });
        } else {
            // Hotfix: Forcefully update metrics and elevate from staging to active target
            if (user.seoClusters[existingIndex].status === 'idea' && targetStatus === 'draft') {
                 user.seoClusters[existingIndex].status = 'draft';
                 user.seoClusters[existingIndex].pushedAt = new Date();
            }
            user.seoClusters[existingIndex].impressions = node.views;
            if (node.localArea) user.seoClusters[existingIndex].location = node.localArea;
        }
    });

    await user.save();
    return NextResponse.json({ success: true, message: `Action Complete. ${queries.length} items injected as ${targetStatus}.`, clusters: user.seoClusters });
    
  } catch (error: any) {
    console.error("[SEO DRAFT BATCH ERROR]", error);
    return NextResponse.json({ error: `Draft crash: ${error.message}` }, { status: 500 });
  }
}

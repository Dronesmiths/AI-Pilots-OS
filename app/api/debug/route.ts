import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

export async function GET() {
    if (!mongoose.connections[0].readyState) {
        await mongoose.connect(process.env.MONGODB_URI as string);
    }
    const targetId = new mongoose.Types.ObjectId("69d1279de59c3b3a20a7829b");
    await User.collection.updateOne(
        { _id: targetId },
        { $set: { "seoClusters.$[elem].githubSyncRequired": true } },
        { arrayFilters: [{ "elem.status": "draft" }] }
    );
    const u = await User.findById(targetId).lean();
    return NextResponse.json({ id: u?._id, clusters: u?.seoClusters?.filter((c: any) => c.status === "draft").map((c: any) => ({ keyword: c.keyword, sync: c.githubSyncRequired })) });
}

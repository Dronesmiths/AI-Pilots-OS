import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import User from "@/models/User";

export async function POST(req: NextRequest) {
    if (req.headers.get("Authorization") !== `Bearer ${process.env.DRONE_API_KEY}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { userId, keyword, category = 'service' } = body;

        if (!userId || !keyword) {
            return NextResponse.json({ error: "Missing userId or keyword" }, { status: 400 });
        }

        await connectToDatabase();
        
        const user = await User.findById(userId);
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Ensure we don't spam duplicates
        const exists = user.seoClusters?.some((c: any) => c.keyword.toLowerCase() === keyword.toLowerCase());
        if (exists) {
            return NextResponse.json({ error: "Cluster already exists" }, { status: 409 }); // Conflict
        }

        const newCluster = {
            keyword,
            category,
            status: 'idea',
            impressions: 0,
            clicks: 0,
            engagementRate: 0,
            sessions: 0,
            pushedAt: new Date()
        };

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $push: { seoClusters: newCluster } },
            { new: true, runValidators: true }
        ).lean();

        if (!updatedUser) {
           return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: `Keyword '${keyword}' formally injected into CRM queue.` });

    } catch (e: any) {
        console.error("DRONE CREATE CLUSTER ERROR:", e);
        return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 });
    }
}

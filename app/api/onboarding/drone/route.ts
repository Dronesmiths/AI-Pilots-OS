import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import User from "@/models/User";

// Secret check mechanism from the header.
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.DRONE_API_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();
    
    // Parse the payload sent by the Onboarding Drone
    const { 
        name, 
        brandTheme, 
        pageBuilderTemplates,
        seoKeywords, 
        targetDomain,
        targetServiceAreas
    } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "Missing client/folder name" }, { status: 400 });
    }

    const synthesizedEmail = `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@onboarded-client.local`;

    // Upsert the client based on checking for the generated email or passed name
    let user = await User.findOne({ 
        $or: [ { email: synthesizedEmail }, { name: name } ]
    });

    if (user) {
        // Update existing context
        user.brandTheme = brandTheme;
        if (pageBuilderTemplates) user.pageBuilderTemplates = { ...user.pageBuilderTemplates, ...pageBuilderTemplates };
        if (targetDomain) user.targetDomain = targetDomain;
        if (targetServiceAreas) user.targetServiceAreas = targetServiceAreas;
        user.seoAutomation = true; // Ignite the chain reaction
        await user.save();
    } else {
        // Build new Client Identity
        user = await User.create({
            name,
            email: synthesizedEmail,
            brandTheme,
            pageBuilderTemplates,
            targetDomain,
            targetServiceAreas: targetServiceAreas || ["Local"],
            seoAutomation: true, // Ignite the chain reaction
        });
    }

    // Re-wire to DataForSEO: Use LLM-generated keywords as high-intent seeds
    let initializedClusters = 0;
    
    if (seoKeywords && Array.isArray(seoKeywords) && seoKeywords.length > 0) {
        const login = user.dataForSeoLogin || process.env.DATAFORSEO_LOGIN;
        const pwd = user.dataForSeoPassword || process.env.DATAFORSEO_PASSWORD;
        
        if (login && pwd) {
            try {
                const authString = Buffer.from(`${login}:${pwd}`).toString('base64');
                const postData = [{
                    keywords: seoKeywords.slice(0, 5), // Provide the 3-5 LLM seeds
                    location_code: 2840, // United States
                    language_name: "English",
                    limit: 20, // Inject top 20 ideas
                    include_serp_info: false,
                    order_by: ["keyword_info.search_volume,desc"]
                }];

                const dfResponse = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live', {
                    method: 'POST',
                    headers: { 'Authorization': `Basic ${authString}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(postData)
                });
                
                const dfData = await dfResponse.json();
                
                if (dfData.status_code === 20000) {
                    const items = dfData.tasks?.[0]?.result?.[0]?.items || [];
                    if (!user.seoClusters) user.seoClusters = [];

                    for (const item of items) {
                        const keywordTarget = item.keyword;
                        const searchVolume = item.keyword_info?.search_volume || 0;
                        const cpc = item.keyword_info?.cpc || 0;
                        const competition = item.keyword_info?.competition_level || 'UNKNOWN';

                        if (searchVolume < 10) continue; // Prune zero-volume junk

                        const exists = user.seoClusters.some((c: any) => c.keyword.toLowerCase() === keywordTarget.toLowerCase());
                        
                        if (!exists) {
                            user.seoClusters.push({
                                keyword: keywordTarget,
                                target: keywordTarget,
                                category: 'service',
                                clusterType: 'service',
                                status: 'idea',
                                impressions: searchVolume,
                                cpc: Number(cpc.toFixed(2)),
                                competition,
                                isLlmQA: false,
                                pushedAt: new Date()
                            });
                            initializedClusters++;
                        }
                    }
                } else {
                    console.error("DataForSEO returned error status:", dfData.status_message);
                }
            } catch (e: any) {
                console.error("DataForSEO fetch failed during onboarding:", e.message);
            }
        } else {
            console.warn("No DataForSEO credentials found, skipping real-time analysis expansion.");
            // Fallback: Drop the raw LLM keywords directly
            for (const kw of seoKeywords) {
                const exists = user.seoClusters?.some((c: any) => c.keyword.toLowerCase() === kw.toLowerCase());
                if (!exists) {
                    if (!user.seoClusters) user.seoClusters = [];
                    user.seoClusters.push({
                        keyword: kw, category: 'service', status: 'idea', impressions: 10, clicks: 0 
                    });
                    initializedClusters++;
                }
            }
        }
        await user.save();
    }

    return NextResponse.json({ 
        message: "Successfully onboarded & ignited AI drones for " + name, 
        userId: user._id, 
        clustersAdded: initializedClusters 
    });

  } catch (error: any) {
    console.error("Onboarding Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

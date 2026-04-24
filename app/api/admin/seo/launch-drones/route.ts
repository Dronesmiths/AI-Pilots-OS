import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { SeoCluster } from '@/models/SeoCluster';
import { Tenant } from '@/models/Tenant';

const CATEGORY_TARGETS: Record<string, number> = {
  qa: 180,
  location: 30,
  blog: 30,
  cornerstone: 8,
};

// Pull keyword IDEAS from DataForSEO
async function fetchDataForSeoKeywords(seeds: string[], authString: string, limitPerSeed = 20): Promise<string[]> {
    try {
        const postData = seeds.slice(0, 6).map(seed => ({
            keywords: [seed],
            location_code: 2840,
            language_name: 'English',
            limit: limitPerSeed,
            include_serp_info: false,
            order_by: ['keyword_info.search_volume,desc']
        }));

        const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${authString}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(postData)
        });
        const data = await res.json() as any;
        if (data.status_code !== 20000) throw new Error(`DataForSEO: ${data.status_message}`);

        const keywords: string[] = [];
        (data.tasks || []).forEach((task: any) => {
            (task.result?.[0]?.items || []).forEach((item: any) => {
                if (item.keyword && (item.keyword_info?.search_volume ?? 0) > 10) {
                    keywords.push(item.keyword);
                }
            });
        });
        return keywords;
    } catch (e) {
        console.error('DataForSEO Keyword Error:', e);
        return [];
    }
}

// Pull real PAA questions directly from Google SERPs via DataForSEO
async function fetchRealPAAQuestions(seeds: string[], authString: string): Promise<string[]> {
    try {
        const postData = seeds.slice(0, 5).map(seed => ({
            keyword: seed,
            location_code: 2840,
            language_code: 'en',
            device: 'desktop',
            os: 'windows',
            depth: 1
        }));

        const res = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${authString}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(postData)
        });
        const data = await res.json() as any;
        if (data.status_code !== 20000) throw new Error(`DataForSEO: ${data.status_message}`);

        const questions = new Set<string>();
        (data.tasks || []).forEach((task: any) => {
            (task.result?.[0]?.items || []).forEach((item: any) => {
                if (item.type === 'people_also_ask' && item.items) {
                    item.items.forEach((paa: any) => {
                        if (paa.title) questions.add(paa.title);
                    });
                }
            });
        });
        return Array.from(questions);
    } catch (e) {
        console.error('DataForSEO PAA Error:', e);
        return [];
    }
}

export async function POST(req: NextRequest) {
  await connectToDatabase();
  
  const body = await req.json();
  const tenantId = body.userId || body.tenantId;
  const category = body.category;

  if (!tenantId || !category) {
    return NextResponse.json({ error: 'Missing tenantId or category' }, { status: 400 });
  }

  const count = CATEGORY_TARGETS[category];
  if (!count) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }

  // Fetch all currently scheduled job times for this tenant that are in the future
  const now = Date.now();
  const existingJobs = await SeoCluster.find({ 
    tenantId, 
    scheduledTime: { $gte: new Date(now) } 
  }).select('scheduledTime').lean();

  const existingTimesMs = existingJobs.map(j => new Date(j.scheduledTime).getTime());

  // Function to find a safe time at least 10 minutes (600,000 ms) away from any existing job
  const getSafeTime = (baseTimeMs: number) => {
    let safeTime = baseTimeMs;
    let conflict = true;
    while (conflict) {
      conflict = false;
      for (const t of existingTimesMs) {
        if (Math.abs(safeTime - t) < 10 * 60 * 1000) {
          safeTime = t + 10 * 60 * 1000;
          conflict = true;
          break;
        }
      }
    }
    existingTimesMs.push(safeTime);
    return safeTime;
  };

  const tenant = await Tenant.findOne({ tenantId }).lean();
  const seedKeywords = tenant?.niche?.keywords || ['kitchen remodel', 'bathroom remodel', 'home additions'];
  
  const d4sAuth = process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD
      ? Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')
      : null;

  let keywords: string[] = [];
  if (d4sAuth) {
    if (category === 'qa') {
      keywords = await fetchRealPAAQuestions(seedKeywords, d4sAuth);
    } else {
      keywords = await fetchDataForSeoKeywords(seedKeywords, d4sAuth, Math.ceil(count / seedKeywords.length) + 10);
    }
  }

  const jobsToInsert = [];
  // Distribute over 60 days
  const days = 60;
  const totalDurationMs = days * 24 * 60 * 60 * 1000;
  // Start the first one today, right now. Then space them out by interval.
  const intervalMs = count > 1 ? totalDurationMs / (count - 1) : totalDurationMs;

  for (let i = 0; i < count; i++) {
    const baseTimeMs = now + (i * intervalMs);
    const scheduledTime = new Date(getSafeTime(baseTimeMs));
    
    // Assign real keyword, or fallback if DataForSEO failed/exhausted
    const keyword = keywords[i] || `${category.charAt(0).toUpperCase() + category.slice(1)} Target ${i + 1} (${tenantId})`;

    jobsToInsert.push({
      tenantId,
      category,
      keyword,
      status: 'queued',
      scheduledTime,
    });
  }

  await SeoCluster.insertMany(jobsToInsert);

  return NextResponse.json({ 
    success: true, 
    message: `Injected ${count} ${category} targets starting today`,
    injected: count 
  });
}

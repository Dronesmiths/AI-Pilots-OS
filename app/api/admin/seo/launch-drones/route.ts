import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '../../../../../lib/mongodb';
import User from '@/models/User';
import OpenAI from 'openai';
import { Resend } from 'resend';

export const maxDuration = 300;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const bannedWords = ['rugs', 'tiles', 'doors', 'decor', 'stores', 'curtain', 'retailers', 'products', 'supplies', 'furnishings', 'furniture', 'hardware', 'accessories', 'fixtures', 'parts', 'materials', 'cleaner', 'cleaning'];

// Pull keyword IDEAS from DataForSEO (commercial/informational discovery)
async function fetchDataForSeoKeywords(seeds: string[], authString: string, limitPerSeed = 20): Promise<string[]> {
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
}

// Pull real PAA questions directly from Google SERPs via DataForSEO
async function fetchRealPAAQuestions(seeds: string[], authString: string): Promise<string[]> {
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
    if (data.status_code !== 20000) return []; // silently fall back

    const questions: string[] = [];
    (data.tasks || []).forEach((task: any) => {
        (task.result?.[0]?.items || []).forEach((item: any) => {
            // PAA boxes have type 'people_also_ask'
            if (item.type === 'people_also_ask' && Array.isArray(item.items)) {
                item.items.forEach((paa: any) => {
                    if (paa.title && paa.title.length > 10) questions.push(paa.title);
                });
            }
        });
    });
    return questions;
}

// Pull informational keywords from DataForSEO for blog seeds
async function fetchDataForSeoInformational(seeds: string[], authString: string): Promise<string[]> {
    const postData = seeds.slice(0, 6).map(seed => ({
        keywords: [seed],
        location_code: 2840,
        language_name: 'English',
        limit: 20,
        include_serp_info: false,
        order_by: ['keyword_info.search_volume,desc']
    }));
    const res = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live', {
        method: 'POST',
        headers: { 'Authorization': `Basic ${authString}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(postData)
    });
    const data = await res.json() as any;
    if (data.status_code !== 20000) return [];
    const keywords: string[] = [];
    (data.tasks || []).forEach((task: any) => {
        (task.result?.[0]?.items || []).forEach((item: any) => {
            if (item.keyword && (item.keyword_info?.search_volume ?? 0) > 10) {
                keywords.push(item.keyword);
            }
        });
    });
    return keywords;
}

// Generate PAA-style questions using GPT-4o to fill gaps after DataForSEO PAA extraction
async function generateQAQuestions(niche: string, locations: string[], count: number, existingQuestions: string[] = []): Promise<string[]> {
    const locationStr = locations.join(', ') || 'the local area';
    const existing = existingQuestions.length > 0 ? `\n\nDo NOT repeat these already-collected questions:\n${existingQuestions.slice(0, 20).join('\n')}` : '';
    const prompt = `You are an elite SEO strategist. Generate exactly ${count} highly realistic "People Also Ask" questions for a ${niche} business serving ${locationStr}.

Focus on:
- Cost questions ("How much does X cost in [city]?")
- Timeline questions ("How long does X take?")
- Comparison questions ("What is better: X or Y?")
- Process questions ("How do I choose a good X contractor?")
- Local questions ("Do I need a permit for X in [city]?")
- ROI questions ("Is X worth it in [city]?")

Distribute locations randomly across questions.${existing}

Return ONLY a JSON array of strings. No markdown, no numbering.`;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: 'Output pure JSON arrays of strings only. No markdown.' },
            { role: 'user', content: prompt }
        ]
    });

    const raw = response.choices[0]?.message?.content || '[]';
    try {
        const cleaned = raw.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
        return JSON.parse(cleaned);
    } catch {
        const matches = raw.match(/"([^"]+)"/g);
        return matches ? matches.map(m => m.replace(/"/g, '')) : [];
    }
}

// Generate blog titles using GPT-4o, grounded by DataForSEO keyword context
async function generateBlogTopics(niche: string, locations: string[], count: number, keywordContext: string[] = []): Promise<string[]> {
    const locationStr = locations.slice(0, 3).join(', ') || 'your area';
    const kwContext = keywordContext.length > 0 ? `\n\nBase your titles on these verified high-search-volume keywords from DataForSEO:\n${keywordContext.slice(0, 15).join(', ')}` : '';
    const prompt = `You are an SEO content strategist. Generate exactly ${count} blog article titles for a ${niche} business serving ${locationStr}.

Each title should be:
- Informational (how-to, guides, tips, ideas, comparisons)
- Specific and practical (never generic)
- 6-12 words long
- Include a city name where it fits naturally
- Appeal to homeowners actively researching before hiring${kwContext}

Return ONLY a JSON array of strings. No markdown, no numbering.`;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: 'Output pure JSON arrays of strings only. No markdown.' },
            { role: 'user', content: prompt }
        ]
    });

    const raw = response.choices[0]?.message?.content || '[]';
    try {
        const cleaned = raw.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
        return JSON.parse(cleaned);
    } catch {
        const matches = raw.match(/"([^"]+)"/g);
        return matches ? matches.map(m => m.replace(/"/g, '')) : [];
    }
}

const getNextMonday = (from: Date): Date => {
    const d = new Date(from);
    const day = d.getDay();
    const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 7;
    d.setDate(d.getDate() + daysUntilMonday);
    d.setHours(9, 0, 0, 0);
    return d;
};

export async function POST(req: NextRequest) {
    try {
        await dbConnect();
        const { userId, category } = await req.json();

        if (!userId) return NextResponse.json({ error: 'Missing userId.' }, { status: 400 });
        if (!category) return NextResponse.json({ error: 'Missing category.' }, { status: 400 });

        const user = await User.findById(userId);
        if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

        const serviceAreas: string[] = user.targetServiceAreas || [];
        const niche: string = user.adsBaseServices || user.niche ||
            (user.clusterGroups || [])
                .map((cg: any) => cg.primaryKeyword || '')
                .filter((kw: string) => kw && !bannedWords.some(bw => kw.toLowerCase().includes(bw)))
                .slice(0, 3)
                .join(', ') || 'home remodeling';

        const existingKeywords = new Set(
            (user.seoClusters || []).map((c: any) => (c.keyword || '').toLowerCase().trim())
        );

        if (!user.seoClusters) user.seoClusters = [];
        let injectedCount = 0;
        let injectedKeywords: string[] = [];

        // ─────────────────────────────────────────────────────────────────
        // QA / LLM: DataForSEO SERP PAA boxes (real Google data) → GPT-4o fills gaps
        // Result: 90 questions = 30 days at 3/day
        // ─────────────────────────────────────────────────────────────────
        if (category === 'qa') {
            const login = user.dataForSeoLogin || process.env.DATAFORSEO_LOGIN;
            const pwd = user.dataForSeoPassword || process.env.DATAFORSEO_PASSWORD;
            const authString = (login && pwd) ? Buffer.from(`${login}:${pwd}`).toString('base64') : null;

            const TARGET = 180;

            // Step 1: Pull real PAA questions from Google SERPs via DataForSEO
            const nicheTerms = niche.split(',').map((s: string) => s.trim()).slice(0, 5);
            let realPAA: string[] = [];
            if (authString) {
                realPAA = await fetchRealPAAQuestions(nicheTerms, authString);
                console.log(`[QA] DataForSEO SERP PAA returned ${realPAA.length} real questions`);
            }

            // Self-healing: up to 3 GPT batches until TARGET is reached
            const collected: string[] = [...realPAA];
            let attempts = 0;
            while (collected.filter(q => !existingKeywords.has(q.toLowerCase().trim())).length < TARGET && attempts < 3) {
                attempts++;
                const needed = TARGET - collected.filter(q => !existingKeywords.has(q.toLowerCase().trim())).length;
                console.log(`[QA] Batch ${attempts}: requesting ${needed} more questions`);
                const batch = await generateQAQuestions(niche, serviceAreas, needed + 20, collected); // +20 buffer for dedup loss
                collected.push(...batch);
            }

            const unique = collected
                .filter(q => typeof q === 'string' && q.length > 10)
                .filter(q => !existingKeywords.has(q.toLowerCase().trim()))
                .slice(0, TARGET);

            if (unique.length === 0) return NextResponse.json({ error: 'No QA questions generated.' }, { status: 400 });

            // Schedule: 3/day starting from day 1 of current month — fills 60 days
            const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(8, 0, 0, 0);
            unique.forEach((kw, i) => {
                const scheduledTime = new Date(monthStart);
                scheduledTime.setDate(1 + Math.floor(i / 3));
                // Space them out: 8:00 AM, 12:00 PM, 4:00 PM
                scheduledTime.setHours(8 + (i % 3) * 4, 0, 0, 0);
                user.seoClusters.push({ keyword: kw, category: 'qa', status: 'queued', impressions: 0, pushedAt: new Date(), scheduledTime, isLlmQA: true });
                injectedCount++;
            });
            injectedKeywords = unique;
        }

        // ─────────────────────────────────────────────────────────────────
        // LOCATION: clusterGroups service terms × service areas — 15 pages, every 2 days
        // Uses client's OWN verified service keywords — no DataForSEO pollution
        // ─────────────────────────────────────────────────────────────────
        else if (category === 'location' || category === 'service') {
            // Pull verified service terms from the client's cluster intelligence
            const clusterKeywords: string[] = (user.clusterGroups || [])
                .map((cg: any) => cg.primaryKeyword || '')
                .filter((kw: string) => kw && !bannedWords.some(bw => kw.toLowerCase().includes(bw)))
                .slice(0, 5);

            // Fall back to niche terms if no clusters
            const serviceTerms = clusterKeywords.length > 0
                ? clusterKeywords
                : niche.split(',').map((s: string) => s.trim()).filter(Boolean).slice(0, 5);

            const cities = serviceAreas.length > 0 ? serviceAreas : ['near me'];

            const TARGET_LOC = 30;

            // Self-healing: try up to 3 expansion passes to reach 30 unique geo pages
            const collected: string[] = [];
            let attempts = 0;
            while (collected.filter(v => !existingKeywords.has(v.toLowerCase())).length < TARGET_LOC && attempts < 3) {
                attempts++;
                for (const term of serviceTerms) {
                    for (const city of cities) {
                        const variant = `${term} ${city}`;
                        if (!existingKeywords.has(variant.toLowerCase()) && !collected.includes(variant)) {
                            collected.push(variant);
                        }
                    }
                    // Also try reversed: city + term
                    for (const city of cities) {
                        const variant2 = `${city} ${term}`;
                        if (!existingKeywords.has(variant2.toLowerCase()) && !collected.includes(variant2)) {
                            collected.push(variant2);
                        }
                    }
                }
            }

            const expanded = collected
                .filter(v => !existingKeywords.has(v.toLowerCase()))
                .slice(0, TARGET_LOC);

            console.log(`[Location] Self-healing: ${attempts} pass(es), ${expanded.length}/${TARGET_LOC} unique geo pages generated`);

            if (expanded.length === 0) return NextResponse.json({ error: 'No location keywords generated. Ensure clusterGroups or service areas are set.' }, { status: 400 });

            // Schedule: 1 every 2 days starting day 2 of month — fills 60 days
            const monthStart = new Date(); monthStart.setDate(2); monthStart.setHours(10, 0, 0, 0);
            expanded.forEach((kw, i) => {
                const scheduledTime = new Date(monthStart);
                scheduledTime.setDate(2 + (i * 2));
                // Space it safely: 10:15 AM
                scheduledTime.setHours(10, 15, 0, 0);
                user.seoClusters.push({ keyword: kw, category, status: 'queued', impressions: 0, pushedAt: new Date(), scheduledTime, isLlmQA: false });
                injectedCount++;
            });
            injectedKeywords = expanded;
        }

        // ─────────────────────────────────────────────────────────────────
        // BLOG: DataForSEO informational seeds → GPT-4o crafts compelling titles
        // Result: 30 articles = 60 days at 1 every 2 days
        // ─────────────────────────────────────────────────────────────────
        else if (category === 'blog') {
            const login = user.dataForSeoLogin || process.env.DATAFORSEO_LOGIN;
            const pwd = user.dataForSeoPassword || process.env.DATAFORSEO_PASSWORD;
            const authString = (login && pwd) ? Buffer.from(`${login}:${pwd}`).toString('base64') : null;

            // Step 1: Get verified informational keywords from DataForSEO as grounding context
            const nicheTerms = niche.split(',').map((s: string) => s.trim()).slice(0, 3);
            const infoSeeds = nicheTerms.flatMap((s: string) => [`how to ${s}`, `${s} tips`, `${s} ideas`, `${s} guide`]);
            let kwContext: string[] = [];
            if (authString) {
                const rawInfo = await fetchDataForSeoInformational(infoSeeds, authString);
                // Filter for informational intent
                kwContext = rawInfo
                    .filter(kw => !bannedWords.some(bw => kw.toLowerCase().includes(bw)))
                    .filter(kw => !kw.toLowerCase().match(/\b(near me|contractor|company|hire)\b/))
                    .slice(0, 20);
                console.log(`[Blog] DataForSEO informational context: ${kwContext.length} keywords`);
            }

            const TARGET_BLOG = 30;

            // Step 2: Self-healing — up to 3 GPT batches to reach 30 unique blog topics
            const collected: string[] = [];
            let attempts = 0;
            while (collected.filter(t => !existingKeywords.has(t.toLowerCase().trim())).length < TARGET_BLOG && attempts < 3) {
                attempts++;
                const needed = TARGET_BLOG - collected.filter(t => !existingKeywords.has(t.toLowerCase().trim())).length;
                console.log(`[Blog] Batch ${attempts}: requesting ${needed + 10} more topics`);
                const batch = await generateBlogTopics(niche, serviceAreas, needed + 10, kwContext);
                collected.push(...batch);
            }

            const unique = collected
                .filter(t => typeof t === 'string' && t.length > 10)
                .filter(t => !existingKeywords.has(t.toLowerCase().trim()))
                .slice(0, TARGET_BLOG);

            console.log(`[Blog] Self-healing: ${attempts} batch(es), ${unique.length}/${TARGET_BLOG} unique topics generated`);

            if (unique.length === 0) return NextResponse.json({ error: 'No blog topics generated.' }, { status: 400 });

            // Schedule: 1 every 2 days starting day 3 of month — interleaved with location, fills 60 days
            const monthStart = new Date(); monthStart.setDate(3); monthStart.setHours(10, 0, 0, 0);
            unique.forEach((kw, i) => {
                const scheduledTime = new Date(monthStart);
                scheduledTime.setDate(3 + (i * 2));
                // Space it safely: 2:30 PM
                scheduledTime.setHours(14, 30, 0, 0);
                user.seoClusters.push({ keyword: kw, category: 'blog', status: 'queued', impressions: 0, pushedAt: new Date(), scheduledTime, isLlmQA: false });
                injectedCount++;
            });
            injectedKeywords = unique;
        }

        // ─────────────────────────────────────────────────────────────────
        // CORNERSTONE — DataForSEO top-volume terms → 8 hub titles on Mondays
        // ─────────────────────────────────────────────────────────────────
        else if (category === 'cornerstone') {
            const login = user.dataForSeoLogin || process.env.DATAFORSEO_LOGIN;
            const pwd = user.dataForSeoPassword || process.env.DATAFORSEO_PASSWORD;
            if (!login || !pwd) return NextResponse.json({ error: 'Missing DataForSEO credentials.' }, { status: 400 });
            const authString = Buffer.from(`${login}:${pwd}`).toString('base64');

            // Seeds scoped to contractor/service intent to get authoritative hub terms
            const nicheTermsCS = niche.split(',').map((s: string) => s.trim()).slice(0, 3);
            const seeds = nicheTermsCS.flatMap((s: string) => [`${s} contractor`, `${s} services`, s]);
            const rawKws = await fetchDataForSeoKeywords(seeds, authString, 30);

            // Cornerstone = broad, high-level, short phrases (the "hub" of a topic cluster)
            const csFiltered = rawKws
                .filter(kw => !bannedWords.some(bw => kw.toLowerCase().includes(bw)))
                .filter(kw => !existingKeywords.has(kw.toLowerCase().trim()))
                .filter(kw => !kw.toLowerCase().match(/^(how|what|why|when|where|do|does|is|are)\s/))
                .filter(kw => kw.split(' ').length <= 4); // Hub pages = concise, authoritative terms

            const cornerstoneTargets = Array.from(new Set(csFiltered.map(k => k.toLowerCase()))).slice(0, 8);

            if (cornerstoneTargets.length === 0) {
                // Fall back to top cluster keywords as cornerstone hubs
                const fallback = (user.clusterGroups || [])
                    .map((cg: any) => (cg.primaryKeyword || '').toLowerCase())
                    .filter((kw: string) => kw && !bannedWords.some(bw => kw.includes(bw)))
                    .slice(0, 8);
                if (fallback.length === 0) return NextResponse.json({ error: 'No cornerstone topics found.' }, { status: 400 });
                cornerstoneTargets.push(...fallback);
            }

            // Schedule: 8 Mondays — covers 2 months of authority hub publishing
            let nextMonday = getNextMonday(new Date());
            const firstOfMonth = new Date(); firstOfMonth.setDate(1);
            nextMonday = getNextMonday(firstOfMonth);

            cornerstoneTargets.forEach(kw => {
                const scheduledTime = new Date(nextMonday);
                scheduledTime.setHours(9, 45, 0, 0); // Space it safely: 9:45 AM
                user.seoClusters.push({
                    keyword: kw, category: 'cornerstone', status: 'queued',
                    impressions: 0, pushedAt: new Date(),
                    scheduledTime, isLlmQA: false
                });
                nextMonday = getNextMonday(nextMonday);
                injectedCount++;
            });
            injectedKeywords = cornerstoneTargets;
        }

        else {
            return NextResponse.json({ error: `Category '${category}' not implemented.` }, { status: 400 });
        }

        await user.save();

        // Email notification
        if (process.env.RESEND_API_KEY && injectedCount > 0) {
            try {
                const resend = new Resend(process.env.RESEND_API_KEY);
                await resend.emails.send({
                    from: 'onboarding@resend.dev',
                    to: 'dronesmiths2@gmail.com',
                    subject: `🚀 AI Pilots: ${injectedCount} ${category.toUpperCase()} targets queued for ${user.targetDomain || user.name}`,
                    html: `<div style="font-family:Arial,sans-serif;padding:20px;"><h2>📅 ${injectedCount} ${category.toUpperCase()} keywords queued for <strong>${user.targetDomain || user.name}</strong>.</h2><ul>${injectedKeywords.slice(0, 30).map((k: string) => `<li>${k}</li>`).join('')}${injectedKeywords.length > 30 ? `<li>...and ${injectedKeywords.length - 30} more</li>` : ''}</ul><p>They will be published autonomously on schedule.</p></div>`
                });
            } catch (e) { console.error('[Launch Drones - Email Error]:', e); }
        }

        const TARGET_MAP: Record<string, number> = { qa: 180, location: 30, service: 30, blog: 30, cornerstone: 8 };
        const target = TARGET_MAP[category] ?? injectedCount;
        const shortfall = Math.max(0, target - injectedCount);

        return NextResponse.json({
            success: true,
            injected: injectedCount,
            target,
            shortfall,
            message: shortfall > 0
                ? `⚠️ Partially filled: ${injectedCount}/${target} targets for [${category}]. ${shortfall} still needed — re-run to top up.`
                : `✅ Successfully injected ${injectedCount}/${target} targets for [${category}] into the deployment calendar.`
        });

    } catch (err: any) {
        console.error('[Launch Drones API Error]:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

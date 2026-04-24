import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import User from '@/models/User';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { userId, sitemapUrl } = await req.json();

    if (!userId || !sitemapUrl) {
      return NextResponse.json({ error: 'Missing userId or sitemapUrl' }, { status: 400 });
    }

    if (!mongoose.connections[0].readyState) {
      await mongoose.connect(process.env.MONGODB_URI as string);
    }

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 1. Format URL (ensure it has a protocol and points to an XML file)
    let fetchUrl = sitemapUrl.trim();
    if (!/^https?:\/\//i.test(fetchUrl)) {
      fetchUrl = `https://${fetchUrl}`;
    }
    // If it's just a root domain, try appending /sitemap.xml
    if (!fetchUrl.endsWith('.xml') && fetchUrl.split('/').length < 4) {
      fetchUrl = fetchUrl.endsWith('/') ? `${fetchUrl}sitemap.xml` : `${fetchUrl}/sitemap.xml`;
    }

    // 2. Fetch the XML Buffer with Smart Fallbacks for WordPress/Yoast
    console.log(`[SCRAPER] Fetching target XML: ${fetchUrl}`);
    
    const fetchWithFallback = async (url: string) => {
       const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) width/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };
       let res = await fetch(url, { headers }).catch(() => null);
       let text = (res && res.ok) ? await res.text() : '';
       
       // If no <loc> found, it might be a 404 HTML page. Fallback to /sitemap_index.xml
       if (!text.includes('<loc>')) {
           let fallbackUrl = url.replace(/sitemap\.xml$/i, 'sitemap_index.xml');
           if (!fallbackUrl.endsWith('.xml')) fallbackUrl = `${fallbackUrl.replace(/\/$/, '')}/sitemap_index.xml`;
           
           console.log(`[SCRAPER] Primary failed. Initiating fallback to: ${fallbackUrl}`);
           res = await fetch(fallbackUrl, { headers }).catch(() => null);
           text = (res && res.ok) ? await res.text() : text;
       }
       return text;
    };

    const xmlData = await fetchWithFallback(fetchUrl);

    // 3. High-Speed Native RegExp Extraction
    let urlMatches = [...xmlData.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());

    // 3.5 Auto-Unwrap Nested Sitemap Indexes (e.g. Yoast `sitemap_index.xml` pointing to `page-sitemap.xml`)
    const nestedSitemaps = urlMatches.filter(url => url.toLowerCase().endsWith('.xml'));
    if (nestedSitemaps.length > 0) {
        console.log(`[SCRAPER] Detected Sitemap Index structure. Unwrapping ${nestedSitemaps.length} nested XML maps...`);
        
        // Prioritize pages and services over massive generic post feeds
        const prioritySitemaps = nestedSitemaps.sort((a,b) => {
            const A = a.toLowerCase();
            if (A.includes('page') || A.includes('service') || A.includes('portfolio') || A.includes('location')) return -1;
            return 1;
        }).slice(0, 4); // Protect against infinite timeouts

        const childFetches = prioritySitemaps.map(childUrl => 
            fetch(childUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.text()).catch(() => '')
        );
        const childTexts = await Promise.all(childFetches);
        const joinedXML = childTexts.join('\n');
        
        // Extract the REAL URLs from all combined child maps
        const childMatches = [...joinedXML.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
        if (childMatches.length > 0) urlMatches = childMatches;
    }

    if (!urlMatches || urlMatches.length === 0) {
      return NextResponse.json({ error: 'No valid <loc> XML nodes found in target sitemap or its index children.' }, { status: 400 });
    }

    let extractedUrls = urlMatches;

    // 4. Scrub Junk URLs (images, pdfs, tags, category feeds)
    extractedUrls = extractedUrls.filter(url => {
       const lower = url.toLowerCase();
       return !lower.match(/\.(jpg|jpeg|png|webp|gif|pdf|mp4|css|js)$/) && 
              !lower.includes('/tag/') && 
              !lower.includes('/category/') &&
              !lower.includes('/author/');
    });

    // 5. Restrict Payload Size (Max 150 for Context Window Efficiency)
    const targetPayload = extractedUrls.slice(0, 150);

    if (targetPayload.length === 0) {
       return NextResponse.json({ error: 'Sitemap contained no viable commercial URLs after filtering.' }, { status: 400 });
    }

    // 6. Pipe into Gemini for Semantic Mapping & Mathematical Deductions
    console.log(`[SCRAPER] Piping ${targetPayload.length} URLs into Gemini 1.5 Flash...`);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-pro-preview' });
    
    // Inject Target Domain Context for localized reasoning
    const clientDomain = user.targetDomain || user.seoEngine || 'this client';

    const prompt = `You are a Tier 1 SEO Data Architect.
    I am providing you an array of ${targetPayload.length} URLs physically extracted from a direct competitor's sitemap.
    
    Competitor URLs:
    ${JSON.stringify(targetPayload, null, 2)}
    
    Your directive is to mathematically analyze their URL routing architecture and reverse-engineer their core semantic traffic gaps.
    Extract the 15 most profitable, high-value commercial SEO concepts (keywords) that my client (${clientDomain}) should steal to systematically siphon their organic traffic.
    
    Ignore basic pages ('contact us', 'about', 'home'). Focus strictly on commercial intent (services, products, high-value geo-locations).
    
    Return the payload STRICTLY as a raw JSON API response matching this array schema:
    [
      {
         "keyword": "exact matched target keyword phrase derived from their url structure",
         "category": "Must be exactly one of: 'service', 'location', 'product', or 'core'"
      }
    ]
    
    DO NOT wrap the JSON in markdown blocks like \`\`\`json. Return only the raw array string.
    `;

    const result = await model.generateContent(prompt);
    let responseText = result.response.text().trim();
    
    if (responseText.startsWith('\`\`\`json')) {
       responseText = responseText.replace(/^\`\`\`json/i, '').replace(/\`\`\`$/i, '').trim();
    }
    
    let aiClusters: any[] = [];
    try {
       aiClusters = JSON.parse(responseText);
    } catch (e) {
       console.error("Gemini parse failed. Output was:", responseText);
       return NextResponse.json({ error: 'AI failed to construct valid JSON schema from Competitor Architecture.' }, { status: 500 });
    }

    if (!Array.isArray(aiClusters) || aiClusters.length === 0) {
       return NextResponse.json({ error: 'AI returned empty or invalid intelligence array.' }, { status: 500 });
    }

    // 7. Prevent forced Database Injection - Pipe directly to Tactical Dashboard UI
    console.log(`[SCRAPER] Gemini successfully mapped ${aiClusters.length} critical traffic nodes.`);
    const filteredGaps = [];
    for (const node of aiClusters) {
       const keywordStr = String(node.keyword || '').trim().toLowerCase();
       if (!keywordStr) continue;
       
       // Deduplication Check
       const existingCluster = user.seoClusters?.find((c: any) => c.keyword === keywordStr);
       if (existingCluster) continue;

       filteredGaps.push({
          keyword: keywordStr,
          category: node.category || 'service'
       });
    }
    
    return NextResponse.json({ 
       success: true, 
       ideasCount: filteredGaps.length,
       totalNodesParsed: extractedUrls.length,
       competitorGaps: filteredGaps
    });

  } catch (error: any) {
    console.error('Sitemap Scraper Error:', error);
    return NextResponse.json({ error: error.message || 'Internal pipeline failure' }, { status: 500 });
  }
}

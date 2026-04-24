import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import OpenAI from 'openai';

export const maxDuration = 300;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

export async function POST(req: Request) {
  try {
    const authError = await requireAdminAuth('superadmin');
    if (authError) return authError;

    const { userId, clusterId, keyword, isLlmQA } = await req.json();
    if (!userId || !clusterId || !keyword) {
      return NextResponse.json({ error: 'Missing parameters.' }, { status: 400 });
    }

    await connectToDatabase();
    
    // Extract dynamic aesthetic profile from CRM Master Configuration
    const userDoc = await User.findById(userId);
    const brandTheme = userDoc?.brandTheme || "Corporate Modern Blue";
    
    let designTokens = "";
    
    // First Priority: Fetch the exact HTML Component Architecture directly from the mapped GitHub Branch
    let templateUrl = '';
    if (userDoc?.githubOwner && userDoc?.githubRepo) {
        templateUrl = `https://raw.githubusercontent.com/${userDoc.githubOwner}/${userDoc.githubRepo}/main/seo-templates.json`;
    } else {
        const activeDomain = userDoc?.targetDomain || userDoc?.seoEngine;
        if (activeDomain) {
            templateUrl = `https://${activeDomain.replace(/^https?:\/\//, '')}/seo-templates.json`;
        }
    }

    if (templateUrl) {
       try {
           const controller = new AbortController();
           const timeoutId = setTimeout(() => controller.abort(), 4000); 
           
           const liveRes = await fetch(templateUrl, { signal: controller.signal });
           clearTimeout(timeoutId);
           
           if (liveRes.ok) {
               const rawConfig = await liveRes.text();
               // Ensure we didn't accidentally catch a Cloudflare HTML redirect page
               if (rawConfig.trim().startsWith('{')) {
                   try {
                       const parsedTemplates = JSON.parse(rawConfig);
                       if (!parsedTemplates.templates.heroSection) {
                           parsedTemplates.templates.heroSection = `<section class="hero overlay" style="background: linear-gradient(rgba(26, 26, 26, 0.75), rgba(26, 26, 26, 0.85)), url('{{IMAGE_1}}'); background-size: cover; background-position: center;">\n  <div class="container">\n    <span style="color: var(--accent-yellow); font-weight: 700; text-transform: uppercase;">Licensed & Insured</span>\n    <h1>{{TITLE}}</h1>\n    <p>{{SUBTITLE}}</p>\n    <div class="hero-btns"><a href="/contact/" class="btn btn-primary" style="padding: 15px 40px; font-size: 1.1rem;">Get Free Estimate</a></div>\n  </div>\n</section>`;
                       }
                       const processedJson = JSON.stringify(parsedTemplates, null, 2);
                       designTokens = `\n\n=== NATIVE COMPONENT TEMPLATE LIBRARY ===\n${processedJson}\n======================================================\n\nCRITICAL INSTRUCTION 5 (COMPONENT INJECTION): I have provided the exact Native HTML Component Templates from the client's repository above. You are STRICTLY FORBIDDEN from generating generic wrapper structs or guessing Tailwind classes! You MUST assemble the entire HTML payload strictly by injecting your generated SEO copy, H2 titles, and imagery verbatim into the provided {{PLACEHOLDERS}} inside these specific template blocks.`;
                       console.log(`[SEO-GEN] Successfully synced UI components from ${templateUrl}`);
                   } catch (parseError) {
                       console.log(`[TEMPLATE WARN] Failed to parse JSON component library: ${parseError}`);
                   }
               } else {
                   console.log(`[TEMPLATE WARN] Invalid JSON (HTML Intercepted) at ${templateUrl}`);
               }
           } else {
               console.log(`[TEMPLATE WARN] ${templateUrl} not found, HTTP ${liveRes.status}`);
           }
       } catch (e: any) {
           console.log(`[DESIGN TOKEN WARN] Failed to pull webhook configuration: ${e.message}`);
       }
    }
    
    let scrapedHomepageContext = "";
    if (!designTokens) {
        try {
            const domainToScrape = userDoc?.targetDomain || userDoc?.seoEngine || 'urbanhomeremodel.com';
            const urlToScrape = domainToScrape.startsWith('http') ? domainToScrape : `https://${domainToScrape}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000); 
            const scrapeRes = await fetch(urlToScrape, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (scrapeRes.ok) {
                let htmlRaw = await scrapeRes.text();
                // Strip unnecessary bloat to conserve token window
                htmlRaw = htmlRaw.replace(/<head[\s\S]*?<\/head>/i, '');
                htmlRaw = htmlRaw.replace(/<script[\s\S]*?<\/script>/gi, '');
                htmlRaw = htmlRaw.replace(/<style[\s\S]*?<\/style>/gi, '');
                htmlRaw = htmlRaw.replace(/<svg[\s\S]*?<\/svg>/gi, '<svg>...</svg>');
                
                scrapedHomepageContext = `\n\n=== LIVE HOMEPAGE CSS DOM REFERENCE ===\n${htmlRaw.substring(0, 6000)}\n======================================================\n\nCRITICAL INSTRUCTION (DOM CLONING): Analyze the client's live homepage HTML above. You MUST natively clone their EXACT CSS styling framework! Look identically at how they build their service cards, container grids, section titles, and buttons (e.g., if they use '<div class="col-lg-4 service-box">'). Natively replicate those EXACT class methodologies to ensure 100% flawless aesthetic integration. DO NOT INVENT CLASSES like 'featureGrid' or 'featureCard'!`;
                console.log(`[SEO-GEN] Autonomously Ripped LIVE Homepage DOM for Native CSS Extraction.`);
            }
        } catch(e) {}
    }

    const cluster = userDoc.seoClusters.id(clusterId);
    
    // FETCH CATEGORICAL MASTER TEMPLATE
    let categoricalTemplate = '';
    if (userDoc?.pageBuilderTemplates) {
        if (cluster?.category === 'location') categoricalTemplate = userDoc.pageBuilderTemplates.location || '';
        if (cluster?.category === 'service' || !cluster?.category) categoricalTemplate = userDoc.pageBuilderTemplates.service || '';
        if (cluster?.category === 'blog') categoricalTemplate = userDoc.pageBuilderTemplates.blog || '';
        if (cluster?.category === 'cornerstone') categoricalTemplate = userDoc.pageBuilderTemplates.cornerstone || '';
    }

    let categoricalInjectionPrompt = '';
    if (categoricalTemplate && categoricalTemplate.trim() !== '') {
        categoricalInjectionPrompt = `\n\n=== STRICT CATEGORICAL HTML TEMPLATE ===\n${categoricalTemplate}\n======================================================\n\nCRITICAL INSTRUCTION (TEMPLATE OVERRIDE): You MUST use the exact HTML template provided above as your unalterable structural blueprint. DO NOT invent your own <sections>, <article>, or layout wrappers! You must map your generated conversational paragraphs and headers identically into the {{CONTENT}} interpolation tags inside the provided template. If there are other placeholders like {{IMAGE_1}}, {{IMAGE_2}}, or {{TITLE}}, fill them accurately. MAINTAIN EXACT COMPONENT AND CLASSNAME ARCHITECTURE to ensure perfect front-end visual continuity!`;
    }
    
    // FETCH PREVIOUSLY GENERATED CLUSTERS FOR INTERNAL LINKING (AI Pilots Mode Phase 12)
    const historicalClusters = userDoc.seoClusters
        .filter((c: any) => c._id.toString() !== clusterId && c.htmlContent && c.keyword)
        .map((c: any) => ({ keyword: c.keyword, url: `/articles/${c.keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` }))
        .slice(0, 5); // Scoped limit to prevent prompt bleeding

    let internalLinkContext = '';
    if (historicalClusters.length > 0) {
        internalLinkContext = `\n\nCRITICAL INSTRUCTION (PROGRAMMATIC INTERNAL LINKING): You MUST weave contextual HTML hyperlinks (<a href="...">) into your organic paragraphs pointing to the following existing sister pages. Ensure the anchor text is highly natural. DO NOT list them as simple bullet points.\n`;
        historicalClusters.forEach((hc: any) => {
            internalLinkContext += `- Target Semantic Anchor: "${hc.keyword}" | Target URL: "${hc.url}"\n`;
        });
    }

    // 1. Generate SEO HTML Content payload via OpenAI GPT-4o
    
    // Unconditionally enforce local vectors: scrape Footer schemas or fallback to generic overrides
    const targetGeo = cluster?.location || "the specific service areas listed in your footer template";
    let locationContext = `
    CRITICAL LOCATION DIRECTIVE (HYPER-LOCAL SEO): You are generating a localized landing page targeting ${targetGeo}!
    If the provided Native Component Template Library or Master Layout contains a Footer listing geographical 'Service Areas' or 'Locations', you MUST treat those exact locations as your primary local SEO targets.
    You MUST explicitly organically weave in references to ${targetGeo}, adjacent local municipalities, recognized county names, and prominent local landmarks.
    If possible, structure a specific section answering local FAQs or providing directions for ${targetGeo}.
    IMPORTANT ANTISPAM RULE: Do NOT "keyword stuff" the exact city name unnaturally! Integrate the geolocation contextually and grammatically correctly, and use colloquial synonyms rather than blindly repeating the same exact phrase. Humans must find it completely natural to read.`;

    let prompt = '';
    
    // FETCH EXISTING CANONICAL NODES FOR DEDUPLICATION
    const existingCanonicalNodes = userDoc.seoClusters
        .filter((c: any) => c._id.toString() !== clusterId && c.isLlmQA && (c.status === 'published' || c.status === 'Live' || c.status === 'generated' || c.status === 'queued'))
        .map((c: any) => ({
            id: c._id.toString(),
            topic: c.target || c.keyword
        }));

    let canonicalNodesContext = 'EXISTING KNOWLEDGE GRAPH NODES:\n';
    if (existingCanonicalNodes.length > 0) {
        canonicalNodesContext += JSON.stringify(existingCanonicalNodes, null, 2);
    } else {
        canonicalNodesContext += 'None currently exist.';
    }
    
    if (isLlmQA) {
        prompt = `We are building a clean, structured, high-signal knowledge layer for an AI Answer Engine (ChatGPT, Perplexity, Claude).
This content is NOT for Google indexing. It is explicitly designed for exact, encyclopedic RAG extraction.

INPUT QUERY: "${keyword}"
LOCATION CONTEXT: "${targetGeo}"

TASK 1: CLASSIFY THE QUESTION
- type: one of ["cost","timeline","design","process","problem","comparison","materials","roi"]
- intent: one of ["buyer","research","support"]
- stage: one of ["early","mid","late"]

TASK 2: DEDUPE CHECK (LOGIC ONLY)
${canonicalNodesContext}

Evaluate if this question is semantically identical to or distinctly answered by one of the Existing Knowledge Graph Nodes provided above.
If YES -> return action: "merge", provide a 'reason', and provide "mergedInto" as the EXACT string 'id' of the matching canonical node.
If NO  -> return action: "create".

TASK 3: GENERATE STRUCTURED ANSWER (ONLY IF action = "create")
Use this EXACT HTML structure. DO NOT deviate. DO NOT output markdown blocks.
<h1>${keyword}</h1>
<p><strong>Answer:</strong> Provide a direct, clear, confident answer in 1-2 sentences. No fluff. This first paragraph MUST fully answer the question independently and be completely understandable if extracted alone without context.</p>
<h2>Key Factors</h2>
<ul>
<li>Factor 1 (short explanation)</li>
<li>Factor 2</li>
<li>Factor 3</li>
</ul>
<h2>Details</h2>
<p>Explain clearly in simple language. No filler. No marketing hype. Ensure this section or the one above explicitly references "${keyword}", "${targetGeo}", and the service contextually to tie the answer to real-world entities.</p>
<h2>Local Context (${targetGeo})</h2>
<p>Include relevant local considerations (permits, weather, housing types, terrain, regulations).</p>
<h2>When to Act</h2>
<p>Explain exactly when they should move forward or take action.</p>

HARD RULES:
- CANONICAL ANCHOR ENFORCEMENT: If this question is closely related but not identical to an existing node, expand your answer to align with the core topic. Ensure terminology flawlessly matches canonical nodes to prevent semantic drift. Do not fragment topics.
- SECTION CONSISTENCY LOCK: Do NOT skip sections. Do NOT rename sections. All answers must rigidly follow the exact HTML structure provided above. No exceptions.
- No keyword stuffing. NO marketing hype. NO salesy language.
- No generic intros like "In today's world".
- Keep answers strictly factual, structured, and scannable.
- Optimize for AI retrieval clarity, not human persuasion.

OUTPUT FORMAT:
Provide your response strictly as a valid JSON object matching this schema:
{
  "classification": { "type": "...", "intent": "...", "stage": "..." },
  "action": "create" | "merge",
  "reason": "<explain only if merge>",
  "mergedInto": "<exact id of canonical node only if merge>",
  "confidence": <float between 0.0 and 1.0 based on clarity, uniqueness, and completeness>,
  "html": "<full structured HTML using instructions above if create, else null>"
}`;
    } else {
        prompt = `You are an elite, million-dollar producing SEO web developer and UI/UX Designer.
        Your job is to generate the high-converting "meat" of a landing page specifically targeting the focus keyword: "${keyword}".
        You are strictly forbidden from outputting <html>, <head>, <body>, <header>, <nav>, or <footer> tags. 
        You must output ONLY the semantic HTML content that strictly fits inside an existing <main> layout wrapper.
        ${locationContext}
        ${internalLinkContext}
        ${categoricalInjectionPrompt ? categoricalInjectionPrompt : designTokens}
        ${scrapedHomepageContext}
        
        CRITICAL INSTRUCTION (ANTI-DUPLICATION): Do NOT repeat generic boilerplate text from previous prompts. Produce highly unique, original, contextually rich paragraphs specifically engineered strictly around the core topic. Google penalizes duplicate spun content.
        CRITICAL INSTRUCTION (AI DETECTION BYPASS & HUMANITY): You MUST write with 100% human-like perplexity and burstiness to bypass AI detectors. Do NOT write predictable sentences of equal length. Write short, punchy, aggressive sentences immediately followed by long, complex, highly detailed, meandering explanatory sentences. NEVER use AI flagged words.
        CRITICAL INSTRUCTION (CRO & TRUST): Maintain an authoritative, first-person plural perspective ("We", "Our team"). Speak directly to the customer's pain points. Embed strong trust signals natively into the copy.
        CRITICAL INSTRUCTION (BRAND AESTHETICS): You MUST strictly utilize the client's stated brand scheme: "${userDoc.brandTheme || '#202124'}" for ALL active elements, buttons, hyperlinks, font-awesome icons, and accent borders. Do NOT use generic blue (#0056b3).
        
        CRITICAL INSTRUCTION 1 (HERO SECTION): At the very top of THE HTML, assemble the Hero equivalent. If perfectly supplied in the json/html references, use it. Otherwise, construct a natively matching Hero.
        
        CRITICAL INSTRUCTION 2 (MANDATORY PAGE OUTLINE & CARDS): The generated HTML MUST exceed 1500+ words and strictly follow this layout architecture:
        1. Hero Section (strictly mapping the exact template structure)
        2. Trust & Features Section (Must rigidly use native grid/card CSS classes extracted from the Homepage Reference or Master Template)
        3. Detailed Subject Matter Content (Massive informational text block using <h2>, <h3>, <ul>, and <p>)
        4. Core Services / Capabilities Grid (Must rigidly use native grid/card CSS classes extracted from the Homepage Reference or Master Template)
        5. Deep Dive LSI & Geographic Factors (Another massive informational text block citing statistics, codes, or local facts)
        6. Comprehensive FAQ Section. CRITICAL DIRECTIVE: You must output a powerful 4 to 6 question FAQ. You MUST construct an interactive FAQ accordion using native HTML5 <details> and <summary> tags! DO NOT invent custom JavaScript or inline <style> blocks. To ensure perfect visual integration, apply the exact CSS typography classes you analyzed from the 'Live Homepage Reference' directly onto the <summary> elements so they look exactly like native section headers. Wrap the answers cleanly in <p> tags inside the <details> block.
        You are STRICTLY FORBIDDEN from using ad-hoc inline flexbox styles for your grid layouts. For Sections 2 and 4, you MUST rigorously wrap them in the IDENTICAL matching class blocks extracted from the live site parsing above. DO NOT INVENT CLASSES like "featureGrid".
        CRITICAL INSTRUCTION 3 (IMAGE PLACEMENT): You have TWO physical AI images to insert (src="{{IMAGE_1}}" and src="{{IMAGE_2}}"). You MUST inject {{IMAGE_1}} directly into the Hero background. You MUST inject {{IMAGE_2}} inside an <img> tag organically into the Deep Dive textual blocks.
        CRITICAL INSTRUCTION 4 (AESTHETICS): Never output raw unicode emojis; use SVG icons natively or font-awesome icons (<i class="fas fa-xxx"></i>). Incorporate ${userDoc.brandTheme || '#202124'} deeply into these icons. Keep semantic groupings flawless.
        CRITICAL INSTRUCTION 5 (SCHEMA.ORG JSON-LD): The very last element of your HTML payload MUST be a <script type="application/ld+json"> element containing an advanced JSON array with both '${cluster?.category === 'location' ? 'LocalBusiness' : 'Article'}' schema AND 'FAQPage' schema perfectly mapping the headers and questions you just wrote. You MUST set the schema "image" attribute precisely to "{{IMAGE_1}}".
        
        Make it 1500+ words of incredibly valuable, deeply comprehensive contextual content perfectly integrated inside the analyzed CSS UI hierarchy. Do not wrap the response in markdown code blocks. Just output raw HTML (and the trailing JSON-LD script).`;
    }

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        ...(isLlmQA && { response_format: { type: "json_object" } })
    });
    
    let htmlMeat = '';
    let isMergedState = false;
    let mergeParsedReason = '';
    let mergedIntoId = null;
    let classificationJSON = '';
    let promptConfidence = 1.0;
    
    if (isLlmQA) {
        try {
            const rawJson = response.choices[0].message?.content || '{}';
            const parsed = JSON.parse(rawJson);
            const actionState = parsed.action || "create";
            
            if (actionState === "merge") {
                isMergedState = true;
                mergeParsedReason = parsed.reason || 'Semantically identical to overarching root entity.';
                mergedIntoId = parsed.mergedInto || null;
                promptConfidence = parsed.confidence !== undefined ? parsed.confidence : 1.0;
            } else {
                htmlMeat = parsed.html || '';
                classificationJSON = parsed.classification ? JSON.stringify(parsed.classification) : '';
                promptConfidence = parsed.confidence !== undefined ? parsed.confidence : 1.0;
            }
        } catch (je) {
            console.warn("[JSON ENGINE WARN] Answer Engine format failed fallback to raw.", je);
            htmlMeat = response.choices[0].message?.content || '';
        }
    } else {
        htmlMeat = response.choices[0].message?.content || '';
        htmlMeat = htmlMeat.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '').trim();
    }

    // 2. Generate Metadata structurally cleanly via OpenAI JSON Mode
    const metaCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [{ 
            role: "user", 
            content: `Provide highly optimized SEO metadata for the keyword: "${keyword}". Return EXACTLY a JSON object with two string keys: "metaTitle" and "metaDescription".` 
        }],
        temperature: 0.4,
    });
    const metaRaw = JSON.parse(metaCompletion.choices[0].message?.content || '{}');

    // 3. Inject into Master Schema
    let updatePayload: any = {};
    if (isMergedState) {
        updatePayload = {
            "seoClusters.$.status": "Merged",
            "seoClusters.$.mergeReason": mergeParsedReason,
            "seoClusters.$.llmConfidence": promptConfidence,
            ...(mergedIntoId ? { "seoClusters.$.mergedInto": mergedIntoId } : {})
        };
    } else {
        updatePayload = {
            "seoClusters.$.htmlContent": htmlMeat,
            "seoClusters.$.status": "draft",
            "seoClusters.$.llmConfidence": promptConfidence,
            "seoClusters.$.metaTitle": metaRaw.metaTitle || `${keyword} - Top Rated Services`,
            "seoClusters.$.metaDescription": metaRaw.metaDescription || `Discover the best solutions for ${keyword}. Expert services tailored perfectly to your requirements.`
        };
        // Option to inject classification physically instead of HTML comment if preferred, though comment works too. 
        // Note: as per user, do NOT pollute htmlContent with comments if possible, wait! The user said 
        // "4. Do NOT store HTML comments inside htmlContent. Keep htmlContent strictly reserved for real generated content only."
        // Ah! But where do we store classification? We don't have a classification field... We'll leave it out for now or assume they extract it later? Wait, they said `classification` is returned. Let's just output htmlMeat without comment. 
    }

    const result = await User.updateOne(
        { _id: userId, "seoClusters._id": clusterId },
        { $set: updatePayload }
    );

    if (result.modifiedCount === 0) {
        return NextResponse.json({ error: 'Cluster not found in database.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'HTML Payload generated securely.', htmlContent: htmlMeat }, { status: 200 });
    
  } catch (error: any) {
    console.error("[GENERATE CONTENT ERROR]", error);
    require('fs').appendFileSync('/tmp/seo_error.log', '\n' + new Date().toISOString() + ' ERROR: ' + (error.stack || error.message || error) + '\n');
    return NextResponse.json({ error: `Generation crash: ${error.message}` }, { status: 500 });
  }
}


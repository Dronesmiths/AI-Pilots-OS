import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import User from "@/models/User";
import mongoose from "mongoose";
import { google } from 'googleapis';

export async function POST(req: NextRequest) {
  return NextResponse.json({ status: "disabled", message: "Drone execution moved to ai-pilots-drones external repository" });
  
  try {
    const { userId, clusterId, htmlContent, slug } = await req.json();

    if (!userId || !htmlContent || !slug) {
      return NextResponse.json({ error: "Missing required payload parameters: userId, htmlContent, or slug." }, { status: 400 });
    }

    if (!process.env.GITHUB_TOKEN) {
      return NextResponse.json({ error: "Master System GITHUB_TOKEN is physically missing from the deployment environment." }, { status: 500 });
    }

    await connectToDatabase();
    const userDoc = await User.findById(userId);

    if (!userDoc || !userDoc.githubOwner || !userDoc.githubRepo) {
      return NextResponse.json({ error: "The targeted client does not map to a registered GitHub Repo & Owner natively inside the CRM Dashboard." }, { status: 400 });
    }

    // STEP 2: Fetch exact cluster
    const cluster = userDoc.seoClusters.id(clusterId);
    if (!cluster) {
      return NextResponse.json({ error: "Cluster not found" }, { status: 404 });
    }

    // STEP 3: Validate
    if (!cluster.htmlContent || cluster.htmlContent.length < 100) {
      throw new Error("Invalid or empty HTML content");
    }

    // STEP 4: Debug Logging
    console.log("Publishing cluster:", {
      id: cluster._id,
      slug: cluster.slug || slug,
      htmlLength: cluster.htmlContent.length
    });

    // STEP 5: Verify Match
    if (!cluster.htmlContent.includes("<section")) {
      throw new Error("Content does not match expected generated HTML");
    }

    // STEP 6: Ensure Correct Routing (No Transformation)
    const base64Content = Buffer.from(cluster.htmlContent).toString('base64');
    
    const githubPath = `articles/${slug}/page.tsx`;

    // 1. Check if the file already structurally exists to retrieve its SHA matrix for overwrites
    let existingSha: string | undefined = undefined;
    try {
        const probeHtmlRes = await fetch(`https://api.github.com/repos/${userDoc.githubOwner}/${userDoc.githubRepo}/contents/${githubPath}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "AIPilots-CRM-Autonomous-Engine"
            },
            signal: AbortSignal.timeout(10000)
        });
        if (probeHtmlRes.ok) {
            existingSha = (await probeHtmlRes.json()).sha;
        } else {
             // Backward compatibility cleanup: actively delete the old .html version if it exists
             const oldPath = `articles/${slug}.html`;
             const probeOld = await fetch(`https://api.github.com/repos/${userDoc.githubOwner}/${userDoc.githubRepo}/contents/${oldPath}`, {
                 method: "GET",
                 headers: { "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`, "Accept": "application/vnd.github.v3+json", "User-Agent": "AIPilots-CRM" },
                 signal: AbortSignal.timeout(10000)
             });
             
             if (probeOld.ok) {
                 const oldData = await probeOld.json();
                 await fetch(`https://api.github.com/repos/${userDoc.githubOwner}/${userDoc.githubRepo}/contents/${oldPath}`, {
                     method: "DELETE",
                     headers: { "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`, "Accept": "application/vnd.github.v3+json", "User-Agent": "AIPilots-CRM" },
                     signal: AbortSignal.timeout(15000),
                     body: JSON.stringify({ message: `chore(seo): Migrating ${slug} natively to index.html directory format`, sha: oldData.sha })
                 }).catch(console.warn);
             }
        }
    } catch (e) {
        console.warn("[SHA PROBE EXCEPTION]", e);
    }

    // Dispatch the payload directly into the target GitHub Repository
    const gitRes = await fetch(`https://api.github.com/repos/${userDoc.githubOwner}/${userDoc.githubRepo}/contents/${githubPath}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "AIPilots-CRM-Autonomous-Engine"
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        message: `feat(seo): Autonomous structural clustering deployed for keyword: ${slug.replace(/-/g, ' ')}`,
        content: base64Content,
        ...(existingSha && { sha: existingSha })
      })
    });

    if (!gitRes.ok) {
       const gitErr = await gitRes.text();
       console.error("[GITHUB PUSH ERROR]", gitErr);
       return NextResponse.json({ error: `GitHub API execution physically failed. Ensure your PAT is valid and has Write permissions. Trace: ${gitErr}` }, { status: 500 });
    }

    // PHASE 12: Sync 301 Redirects Array to Cloudflare _redirects Native Configuration File
    if (userDoc.redirects && userDoc.redirects.length > 0) {
        let redirectsBlob = "";
        for (const rule of userDoc.redirects) {
            redirectsBlob += `${rule.source} ${rule.destination} 301\n`;
        }
        
        try {
            const redirectPath = "_redirects";
            
            let existingSha: string | undefined = undefined;
            const probeRes = await fetch(`https://api.github.com/repos/${userDoc.githubOwner}/${userDoc.githubRepo}/contents/${redirectPath}`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
                    "Accept": "application/vnd.github.v3+json",
                    "User-Agent": "AIPilots-CRM-Autonomous-Engine"
                },
                signal: AbortSignal.timeout(15000)
            });
            
            if (probeRes.ok) {
                const probeData = await probeRes.json();
                existingSha = probeData.sha;
            }
            
            const redirectBase64 = Buffer.from(redirectsBlob).toString('base64');
            const redirectPutRes = await fetch(`https://api.github.com/repos/${userDoc.githubOwner}/${userDoc.githubRepo}/contents/${redirectPath}`, {
                method: "PUT",
                headers: {
                    "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
                    "Accept": "application/vnd.github.v3+json",
                    "User-Agent": "AIPilots-CRM-Autonomous-Engine"
                },
                signal: AbortSignal.timeout(15000),
                body: JSON.stringify({
                    message: `chore(seo): Syncing autonomous 301 redirect map for semantic tracking`,
                    content: redirectBase64,
                    ...(existingSha && { sha: existingSha })
                })
            });
            
            if (!redirectPutRes.ok) {
                console.warn("[REDIRECT SYNC ERROR]", await redirectPutRes.text());
            }
        } catch (rErr) {
            console.warn("[REDIRECT SYNC EXCEPTION]", rErr);
        }
    }

    // PHASE 12.1: CSS Layout Matrix Synchronization (Safety Target Repo Mirroring)
    // Synchronize CRM-driven base layout locally onto the client's repository domain.
    // We execute for both root and public/ to perfectly map against Next.js vs standard static builders.
    try {
        const cssPaths = ["public/seo-engine.css", "seo-engine.css"];
        
        for (const cssPath of cssPaths) {
            let existingCssSha: string | undefined = undefined;
            
            console.log(`[CSS PIPELINE] Probing target repository for ${cssPath}...`);
            const cssProbeRes = await fetch(`https://api.github.com/repos/${userDoc.githubOwner}/${userDoc.githubRepo}/contents/${cssPath}`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
                    "Accept": "application/vnd.github.v3+json",
                    "User-Agent": "AIPilots-CRM-Autonomous-Engine"
                },
                signal: AbortSignal.timeout(15000)
            });
        
        if (cssProbeRes.ok) {
            const cssData = await cssProbeRes.json();
            existingCssSha = cssData.sha;
            console.log(`[CSS PIPELINE] Found existing target CSS file (SHA: ${existingCssSha}). Extracting CRM public cache...`);
        } else {
            console.log(`[CSS PIPELINE] Initializing first-time CRM universal layout sync to ${cssPath}.`);
        }

        // Generate the strict base styling matching seoWrapper layout tokens
        const defaultCssBlob = `:root {
  --primary-color: #1a73e8;
  --text-main: #202124;
  --text-muted: #5f6368;
  --bg-main: #ffffff;
  --bg-muted: #f8f9fa;
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
}

body {
  margin: 0;
  padding: 0;
  color: var(--text-main);
  background-color: var(--bg-main);
  font-family: var(--font-sans);
  line-height: 1.6;
}

.aw-main-content {
  min-height: 100vh;
  margin: 0 auto;
  width: 100%;
}

img {
  max-width: 100%;
  height: auto;
  display: block;
}

h1, h2, h3, h4, h5, h6 {
  color: #111;
  font-weight: 700;
  line-height: 1.2;
}

a {
  color: var(--primary-color);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

section {
  padding: 4rem 2rem;
}

@media (max-width: 768px) {
  section {
    padding: 2rem 1rem;
  }
}`;
        
        // We evaluate remote structural drift to prevent endless empty commits
        if (cssProbeRes.ok) {
           const cssProbeData = await cssProbeRes.json();
           const remoteContent = Buffer.from(cssProbeData.content, 'base64').toString('utf-8');
           if (remoteContent === defaultCssBlob) {
               console.log(`[CSS PIPELINE] Remote CSS is structurally identical to local version. Skipping remote write loop.`);
               existingCssSha = "MATCH"; // Safe flag
           }
        }
        
        if (existingCssSha !== "MATCH") {
            console.log(`[CSS PIPELINE] Executing remote repository push for ${cssPath}...`);
            const cssBase64 = Buffer.from(defaultCssBlob).toString('base64');
            const cssPutRes = await fetch(`https://api.github.com/repos/${userDoc.githubOwner}/${userDoc.githubRepo}/contents/${cssPath}`, {
                method: "PUT",
                headers: {
                    "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
                    "Accept": "application/vnd.github.v3+json",
                    "User-Agent": "AIPilots-CRM-Autonomous-Engine"
                },
                signal: AbortSignal.timeout(15000),
                body: JSON.stringify({
                    message: "chore(seo): Syncing AI Pilots CRM baseline css layout configuration",
                    content: cssBase64,
                    ...(existingCssSha && { sha: existingCssSha })
                })
            });
            
            if (!cssPutRes.ok) {
                console.warn("[CSS PIPELINE SYNC ERROR]", await cssPutRes.text());
            } else {
                console.log(`[CSS PIPELINE] Core stylesheet successfully synchronized to client Vercel environment.`);
            }
        }
        } // close for loop
    } catch (cErr) {
        console.warn("[CSS PIPELINE EXCEPTION]", cErr);
    }

    // PHASE 12.5: Auto-Sync Live Sitemap.xml For 100% LLM/Google Crawlability
    let targetDomainForSitemap = userDoc.targetDomain;
    if (!targetDomainForSitemap && typeof userDoc.seoEngine === 'string' && userDoc.seoEngine !== 'true' && userDoc.seoEngine !== 'false') {
        targetDomainForSitemap = userDoc.seoEngine;
    }

    if (targetDomainForSitemap) {
        try {
            const sitemapPath = "public/sitemap.xml"; // NextJS / General static standard
            let existingSha: string | undefined = undefined;
            let existingXml = "";
            let sitemapLoc = sitemapPath;
            
            // Need to double check both root sitemap.xml and public/sitemap.xml based on structure
            let probeRes = await fetch(`https://api.github.com/repos/${userDoc.githubOwner}/${userDoc.githubRepo}/contents/${sitemapPath}`, {
                method: "GET",
                headers: { "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`, "Accept": "application/vnd.github.v3+json", "User-Agent": "AIPilots-CRM" },
                signal: AbortSignal.timeout(15000)
            });

            if (!probeRes.ok) {
                 sitemapLoc = "sitemap.xml"; // Fallback to root if public/sitemap.xml fails
                 probeRes = await fetch(`https://api.github.com/repos/${userDoc.githubOwner}/${userDoc.githubRepo}/contents/${sitemapLoc}`, {
                    method: "GET",
                    headers: { "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`, "Accept": "application/vnd.github.v3+json", "User-Agent": "AIPilots-CRM" },
                    signal: AbortSignal.timeout(15000)
                 });
            }

            if (probeRes.ok) {
                const probeData = await probeRes.json();
                existingSha = probeData.sha;
                existingXml = Buffer.from(probeData.content, 'base64').toString('utf-8');
            } else {
                // Generate a foundational schema if no sitemap existed physically on the repo
                existingXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>`;
            }

            const cleanedDomain = targetDomainForSitemap.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
            const targetUrl = `https://${cleanedDomain}/articles/${slug}`;

            // Prevent duplicating the exact same slug twice in the XML if the drone re-ran an existing payload
            if (!existingXml.includes(targetUrl)) {
                const newUrlNode = `  <url><loc>${targetUrl}</loc><priority>0.9</priority></url>\n</urlset>`;
                existingXml = existingXml.replace('</urlset>', newUrlNode);

                const sitemapBase64 = Buffer.from(existingXml).toString('base64');
                const sitemapPutRes = await fetch(`https://api.github.com/repos/${userDoc.githubOwner}/${userDoc.githubRepo}/contents/${sitemapLoc}`, {
                    method: "PUT",
                    headers: { "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`, "Accept": "application/vnd.github.v3+json", "User-Agent": "AIPilots-CRM" },
                    signal: AbortSignal.timeout(15000),
                    body: JSON.stringify({
                        message: `chore(seo): Syncing autonomous node [${slug}] securely into global sitemap`,
                        content: sitemapBase64,
                        ...(existingSha && { sha: existingSha })
                    })
                });

                if (!sitemapPutRes.ok) {
                    console.warn("[SITEMAP SYNC ERROR]", await sitemapPutRes.text());
                } else {
                    console.log(`[SITEMAP SYNC] Successfully bound ${targetUrl} into XML.`);
                }
            }
        } catch (sErr) {
            console.warn("[SITEMAP SYNC EXCEPTION]", sErr);
        }
    }

    // PHASE 13: Google Indexing API Auto-Ping System
    let indexingStatus = "Skipped (No Target Domain)";
    try {
        let rawCreds = process.env.GOOGLE_CREDENTIALS_JSON || '{}';
        rawCreds = rawCreds.replace(/[\u0000-\u001F]/g, (match) => {
            if (match === '\n') return '\\n';
            if (match === '\r') return '';
            if (match === '\t') return '\\t';
            return '';
        });
        const credentialsObj = JSON.parse(rawCreds);
        
        let targetDomain = userDoc.targetDomain;
        if (!targetDomain && typeof userDoc.seoEngine === 'string' && userDoc.seoEngine !== 'true' && userDoc.seoEngine !== 'false') {
            targetDomain = userDoc.seoEngine;
        }

        if (targetDomain && credentialsObj.client_email && credentialsObj.private_key) {
            const auth = new google.auth.GoogleAuth({
                credentials: credentialsObj,
                scopes: ['https://www.googleapis.com/auth/indexing']
            });
            const indexing = google.indexing({ version: 'v3', auth });
            
            const cleanedDomain = targetDomain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
            const targetUrl = `https://${cleanedDomain}/articles/${slug}`;
            
            await indexing.urlNotifications.publish({
                requestBody: {
                    url: targetUrl,
                    type: 'URL_UPDATED'
                }
            });
            indexingStatus = `Successfully index-pinged Google Crawler for: ${targetUrl}`;
            console.log(`[INDEXING API] ${indexingStatus}`);
        } else if (!targetDomain) {
            console.log(`[INDEXING API SKIPPED] Missing canonical target domain.`);
        } else {
             console.log(`[INDEXING API SKIPPED] Missing GOOGLE_CREDENTIALS_JSON.`);
             indexingStatus = "Skipped (Missing Credentials)";
        }
    } catch (indexError: any) {
        console.warn("[INDEXING API ERROR]", indexError.message);
        indexingStatus = `Failed to ping Google: ${indexError.message}`;
    }

    // Update MongoDB cluster to record pushed time
    if (clusterId) {
        await User.updateOne(
            { _id: userId, "seoClusters._id": clusterId },
            { $set: { "seoClusters.$.status": "published", "seoClusters.$.pushedAt": new Date() } }
        );

        // ── Activity log ───────────────────────────────────────
        try {
            const db = mongoose.connection.db!;
            const liveUrl = userDoc.targetDomain
                ? `https://${userDoc.targetDomain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '')}/articles/${slug}`
                : `/articles/${slug}`;

            await db.collection("activityLogs").insertOne({
                userId,
                type:      "PAGE_CREATED",
                message:   `🚀 Page published: "${slug.replace(/-/g, ' ')}"`,
                level:     "success",
                metadata:  { url: liveUrl, slug, keyword: slug.replace(/-/g, ' '), indexingStatus },
                timestamp: new Date().toISOString(),
            });
        } catch (_) {/* never break publish */}

        // ── Email notification ─────────────────────────────────
        try {
            const liveUrl = userDoc.targetDomain
                ? `https://${userDoc.targetDomain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '')}/articles/${slug}`
                : `/articles/${slug}`;

            await fetch(
                new URL("/api/admin/seo/notify-publication", req.url).toString(),
                {
                    method:  "POST",
                    headers: { "Content-Type": "application/json" },
                    body:    JSON.stringify({
                        userId,
                        keyword: slug.replace(/-/g, ' '),
                        url:     liveUrl,
                        type:    cluster?.type || 'Unknown'
                    }),
                }
            );
        } catch (_) {/* email failure must never block publish response */}
    }

    return NextResponse.json({ success: true, message: `Successfully pushed HTML cluster natively to ${userDoc.githubOwner}/${userDoc.githubRepo}/${githubPath}. indexing_status: ${indexingStatus}` }, { status: 200 });

  } catch (err: any) {
    console.error("[SEO GITHUB PUBLISH ERROR]", err);
    return NextResponse.json({ error: err.message || "Failed to violently publish to GitHub" }, { status: 500 });
  }
}

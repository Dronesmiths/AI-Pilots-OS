import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { EmailService } from '@/lib/email';
import axios from 'axios';
import { google } from 'googleapis';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    
    // The SEO Engine callback payload will look like:
    // {
    //   "client_id": "unique_crm_client_id_123",
    //   "status": "success" | "failed",
    //   "action": "autopilot_v42",
    //   "pages_generated": "See repository",
    //   "error": "[Python traceback]" // if failed
    // }

    const { client_id, status, error, gmb_content } = payload;
    let { pages_generated } = payload;

    if (!client_id || !status) {
      return NextResponse.json(
        { error: 'Invalid payload: missing client_id or status.' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const user = await User.findById(client_id).lean();
    if (!user) return NextResponse.json({ error: 'CRM Client matching webhook ID was not found.' }, { status: 404 });

    // The remote edge payload could be an array of strings or a comma separated text dump
    if (typeof pages_generated === 'string') {
      pages_generated = pages_generated.split(',').map((u: string) => u.trim()).filter((u: string) => u);
    }

    if (status === 'success') {
      console.log(`✅ SEO Engine formally completed edge deployment for: ${user.name}`);
      
      // Release the Engine lock so the User Dashboard knows it stopped generating 
      await User.findByIdAndUpdate(client_id, { $set: { seoEngineRunning: false } });

      // PHASE 3.5: MASTER SAAS AUTOPILOT (JULES QA -> EDGE DEPLOYMENT)
      // The moment the Python Engine finishes, we trigger the rest of the factory entirely without human intervention!
      try {
        const baseUrl = new URL(request.url).origin;
        console.log(`[AUTOPILOT TRIGGER] Automatically initiating Jules QA Inspector...`);
        const qaRes = await fetch(`${baseUrl}/api/admin/seo-qa-inspector`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: client_id })
        });
        const qaData = await qaRes.json();
        
        if (qaData.approved > 0) {
          console.log(`[AUTOPILOT QA] Jules passed ${qaData.approved} Blueprints. Activating GitHub Deployment Push...`);
          // Note: The publisher grabs the absolute oldest 3 Approved blueprints by default!
          const deployRes = await fetch(`${baseUrl}/api/admin/seo-publish-drip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId: client_id })
          });
          const deployData = await deployRes.json();
          console.log(`[AUTOPILOT DEPLOYMENT] Success: ${deployData.exportedCount} files physically pushed to the Cloud Edge.`);
        } else {
          console.log(`[AUTOPILOT QA] Inspector mathematically rejected or found zero valid blueprints. Deployment skipped.`);
        }
      } catch (autoErr) {
        console.error('[AUTOPILOT ENGINE CATASTROPHE] The automatic deploy chain completely failed:', autoErr);
      }

      const emailEngine = new EmailService();
      const urlsArray = Array.isArray(pages_generated) ? pages_generated : [];
      const domain = user.targetDomain || `${user.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
      const clientEmail = user.email || '';
      
      // Fire the async HTML completion alert directly to the Client (if email exists)
      if (clientEmail) {
        emailEngine.sendSeoCompletionAlert(user.name, clientEmail, domain, urlsArray)
          .catch(e => console.error("Failed executing Resend alert to client:", e));
      } else {
        console.log(`⚠️ User ${user.name} has no email address. Skipping SEO receipt.`);
      }

      // PHASE 4: Autonomous Vapi Knowledge Sync Loop
      const agentId = user.agents?.[0]?.vapiAgentId || user.vapiAgentId;
      if (agentId && process.env.VAPI_API_KEY && urlsArray.length > 0) {
        console.log(`[VAPI SYNC] Bridging SEO Expansion payload into Voice Agent [${agentId}]...`);
        try {
          // Step 1: Securely extract current persona to prevent character destruction
          const vapiRes = await axios.get(`https://api.vapi.ai/assistant/${agentId}`, {
            headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` }
          });
          
          let currentPrompt = vapiRes.data?.model?.messages?.[0]?.content || '';
          
          // Step 2: Dynamically construct the SEO capabilities block
          const dynamicKnowledge = `\n\n### LIVE MARKET CAPABILITIES (Updated ${new Date().toLocaleDateString()})\nWe recently expanded our active service areas. You are fully authorized to sell and reference the following dynamic pages and markets:\n` + urlsArray.map((u: string) => `- ${u}`).join('\n');
          
          // Purge preceding dynamic blocks to preempt system limit bloat
          if (currentPrompt.includes('### LIVE MARKET CAPABILITIES')) {
             currentPrompt = currentPrompt.split('### LIVE MARKET CAPABILITIES')[0].trim();
          }
          const masterPrompt = currentPrompt + dynamicKnowledge;
          
          // Step 3: Patch the mutated prompt securely to the live AI Model
          await axios.patch(`https://api.vapi.ai/assistant/${agentId}`, {
            model: {
              ...vapiRes.data.model, 
              messages: [{ role: "system", content: masterPrompt }]
            }
          }, {
            headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` }
          });
          
          console.log(`[VAPI SYNC] Mission Accomplished. Voice Agent's strategic parameters successfully upgraded limitlessly.`);
        } catch (v_err: any) {
          console.error(`[VAPI SYNC] Mission Failed during AI Knowledge Append pipeline:`, v_err.message || v_err.response?.data);
        }
      }

      // PHASE 9: Autonomous Google Business Profile Posting Loop
      if (gmb_content && Array.isArray(gmb_content) && gmb_content.length > 0 && user.gmbAccountId && user.gmbLocationId) {
        console.log(`[GMB POST] Intercepted Map Payload. Requesting Authentication Matrix...`);
        try {
          // Native lookup of the Master Admin Auth Token
          const admin = await User.findOne({ googleRefreshToken: { $exists: true, $ne: '' } });
          
          if (admin) {
            const oauth2Client = new google.auth.OAuth2(
              process.env.GOOGLE_CLIENT_ID, 
              process.env.GOOGLE_CLIENT_SECRET, 
              'https://dashboard.aipilots.site/api/oauth/google/callback'
            );
            oauth2Client.setCredentials({ refresh_token: admin.googleRefreshToken });
            const resTokens = await oauth2Client.getAccessToken();
            const mapToken = resTokens.token;

            if (mapToken) {
              // OPTION 1 THROTTLE: We intentionally only grab the FIRST item logically to enforce 1 post per execution
              const post = gmb_content[0];
              
              const postBody: any = {
                languageCode: "en-US",
                summary: post.summary,
                callToAction: {
                  actionType: "LEARN_MORE",
                  url: post.url
                }
              };

              // Formally bridge Replicate Diffusion Images directly into Google Maps
              if (post.image_url) {
                postBody.media = [
                  {
                    mediaFormat: "PHOTO",
                    sourceUrl: post.image_url
                  }
                ];
              }

              const gmbRes = await fetch(`https://mybusiness.googleapis.com/v4/accounts/${user.gmbAccountId}/locations/${user.gmbLocationId}/localPosts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mapToken}` },
                body: JSON.stringify(postBody)
              });

              if (!gmbRes.ok) {
                 const errData = await gmbRes.text();
                 console.error(`[GMB HTTP ${gmbRes.status}] Failed posting to Map Node:`, errData);
              } else {
                 console.log(`[GMB THROTTLE POST] Formally posted EXACTLY 1 active Local Update to Google Map: ${user.gmbLocationId}`);
              }
            }
          } else {
             console.warn(`[GMB POST] Rejected: No Master Admin tokens located in the database.`);
          }
        } catch (mErr: any) {
           console.error("[GMB POST] Critical failure orchestrating Phase 9 maps integration:", mErr.message);
        }
      }
      
    } else if (status === 'failed') {
      console.error(`❌ SEO Engine failed for Client ID: ${client_id}. Error: ${error}`);
      // TODO: Update CRM database to mark status as "Failed" and store the error log.
    }

    // Acknowledge receipt of the callback
    return NextResponse.json({ received: true });

  } catch (err: any) {
    console.error('Error processing SEO Engine callback:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

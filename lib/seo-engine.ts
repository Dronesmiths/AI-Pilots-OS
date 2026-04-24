'use server';

import { spawn } from 'child_process';
import path from 'path';

export async function triggerSeoExpansion({
  clientId,
  domain,
  gscSiteUrl,
  mongoUri,
  llmApiKey,
  replicateApiKey,
}: {
  clientId: string;
  repoUrl?: string;
  gscSiteUrl?: string;
  domain: string;
  llmApiKey?: string;
  aiPilotId?: string;
  mongoUri?: string;
  deployTarget?: string;
  vercelToken?: string;
  replicateApiKey?: string;
}) {
  try {
    // Smart fallbacks to existing environment variables to power the backend CLI
    const finalMongoUri = mongoUri || process.env.MONGODB_URI || '';
    const finalLlmKey = llmApiKey || process.env.GEMINI_API_KEY || '';
    const finalReplicateKey = replicateApiKey || process.env.REPLICATE_API_KEY || '';
    
    // Resolve the strict absolute path to the local Python Engine architecture we brought into the CRM Monolith
    const scriptPath = path.join(process.cwd(), '_seo_master_kit', 'engine', 'core', 'seo_factory.py');
    
    console.log(`[MONOLITH] Native Ignition Triggered for Domain: ${domain}`);
    console.log(`[MONOLITH] Spawning local background process at: ${scriptPath}`);

    // Execute the Python Payload completely detached from the Node runtime
    // This allows the Vercel Edge Function to return HTTP 200 instantly without waiting 5 minutes for Python to finish!
    const pythonProcess = spawn('python3', [scriptPath, 'autopilot'], {
      detached: true,
      stdio: 'ignore', // Physically sever stdio so Node doesn't wait
      env: {
        ...process.env,
        MONGO_URI: finalMongoUri,
        LLM_API_KEY: finalLlmKey,
        REPLICATE_API_KEY: finalReplicateKey,
        DOMAIN: domain,
        // Google strictly requires the sc-domain: prefix for domain-level properties
        GSC_SITE_URL: gscSiteUrl || `sc-domain:${domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}`, 
        CLIENT_ID: clientId,
        WEBHOOK_URL: process.env.NODE_ENV === 'production' 
          ? 'https://ai-pilots-crm.vercel.app/api/webhooks/seo-engine-complete' 
          : 'http://localhost:3000/api/webhooks/seo-engine-complete'
      }
    });

    // Strip the child process from the Node event loop (Fire-And-Forget Architecture)
    pythonProcess.unref();

    return { 
      success: true, 
      data: { message: `Local Python Engine successfully dispatched for ${domain}` } 
    };

  } catch (error) {
    console.error('[MONOLITH] Failed to execute native SEO engine expansion:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown Python Execution Error' };
  }
}

import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Target Production URL
const DOMAIN = process.env.NEXT_PUBLIC_APP_URL || 'https://app.aipilots.site';
const SECRET = process.env.JWT_SECRET;

if (!SECRET) {
  console.error("❌ CRITICAL: JWT_SECRET missing from environment.");
  process.exit(1);
}

// Generate Admin Cookie to bypass CRM Security
const adminToken = jwt.sign({ role: 'superadmin', email: 'drone@aipilots.com' }, SECRET, { expiresIn: '1h' });
const cookieHeader = `admin_token=${adminToken}`;

async function runTick() {
  console.log(`\n[${new Date().toLocaleTimeString()}] 🚁 WAKING UP: Checking CRM for scheduled payloads...`);

  try {
    // 1. Ask the CRM what is due right now
    const nextRes = await fetch(`${DOMAIN}/api/admin/seo/queue/next`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${SECRET}` }
    });

    if (!nextRes.ok) throw new Error(`Queue check failed: ${await nextRes.text()}`);
    const nextData = await nextRes.json();

    if (!nextData.job) {
      console.log(`💤 No jobs due at this time. Going back to sleep.`);
      return;
    }

    const { userId, clusterId, keyword, category, isLlmQA } = nextData.job;
    console.log(`\n🎯 TARGET ACQUIRED:`);
    console.log(`- Keyword:  "${keyword}"`);
    console.log(`- Category: ${category}`);
    console.log(`- Tenant:   ${userId}`);
    
    // 2. Generate Content (The Heavy Lift)
    console.log(`\n🧠 INITIATING LLM GENERATION (This may take 45-90 seconds)...`);
    const genRes = await fetch(`${DOMAIN}/api/admin/seo/generate-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader
      },
      body: JSON.stringify({ userId, clusterId, keyword, isLlmQA })
    });

    if (!genRes.ok) throw new Error(`Generation failed: ${await genRes.text()}`);
    const genData = await genRes.json();
    console.log(`✅ Generation Complete! (${genData.htmlContent.length} bytes of HTML)`);

    // 3. Publish to target GitHub Repo natively
    console.log(`\n🚀 PUSHING TO GITHUB...`);
    
    // Convert 'roofing contractor South Jordan' -> 'roofing-contractor-south-jordan'
    const slug = keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const pubRes = await fetch(`${DOMAIN}/api/admin/seo/publish-github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader
      },
      body: JSON.stringify({ 
        userId, 
        clusterId, 
        slug,
        htmlContent: genData.htmlContent 
      })
    });

    if (!pubRes.ok) throw new Error(`GitHub Publish failed: ${await pubRes.text()}`);
    const pubData = await pubRes.json();
    
    console.log(`✅ ${pubData.message}`);
    console.log(`\n🏆 DRONE CYCLE COMPLETE. SLEEPING.`);

  } catch (err) {
    console.error(`\n❌ DRONE FATAL ERROR:`, err.message);
  }
}

// Execute the tick immediately
runTick();

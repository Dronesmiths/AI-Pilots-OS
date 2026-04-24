import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import SeoDraft from '@/models/SeoDraft';
import User from '@/models/User';
import { EmailService } from '@/lib/email';
import fs from 'fs';
import path from 'path';
import { Octokit } from '@octokit/rest';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { clientId } = payload;

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is explicitly required to trigger the remote deployment hook.' }, { status: 400 });
    }

    await connectToDatabase();

    // 1. Locate the master User Object to acquire their cloud deployment variables (GitHub Repo, Domain)
    const user = await User.findById(clientId).lean();
    if (!user) {
      return NextResponse.json({ error: 'Orphaned Client ID.' }, { status: 404 });
    }

    // 2. Mathematically isolate the absolute oldest 3 'Approved' drafts for this specific namespace (FIFO Deployment)
    const approvedDrafts = await SeoDraft.find({ clientId, status: 'Approved' })
      .sort({ createdAt: 1 })
      .limit(3)
      .lean();

    if (!approvedDrafts || approvedDrafts.length === 0) {
      return NextResponse.json({ error: 'You have zero Approved drafts currently resting in the Vault. Please authorize pending drafts first.' }, { status: 400 });
    }

    const exportedUrls: string[] = [];
    const targetDomain = user.targetDomain || `${user.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`;
    const GITHUB_PAT = process.env.GITHUB_PAT;
    
    let deploymentModality = 'Local Export';

    // 3. AUTONOMOUS GITHUB INTEGRATION 
    if (user.githubOwner && user.githubRepo && GITHUB_PAT) {
      deploymentModality = 'GitHub Pull Request';
      const octokit = new Octokit({ auth: GITHUB_PAT });
      const branchName = `jules-auto-deploy-${Date.now()}`;
      
      try {
        // Step A: Acquire the main branch SHA to branch off of
        const { data: refData } = await octokit.git.getRef({
          owner: user.githubOwner,
          repo: user.githubRepo,
          ref: 'heads/main'
        });
        const baseSha = refData.object.sha;

        // Step B: Create a brand new Autonomous deployment branch
        await octokit.git.createRef({
          owner: user.githubOwner,
          repo: user.githubRepo,
          ref: `refs/heads/${branchName}`,
          sha: baseSha
        });

        // Step C: Initialize the Tree Array to construct the massive Git payload
        const treeItems = [];

        for (const draft of approvedDrafts) {
          const categoryPath = draft.topicCategory === 'location' ? 'locations' : draft.topicCategory === 'service' ? 'features' : 'blog';
          const targetPath = `public/${categoryPath}/${draft.targetUrlSlug}/index.html`;
          
          treeItems.push({
            path: targetPath,
            mode: '100644', // Static File
            type: 'blob',
            content: draft.contentMarkdown
          });
          
          exportedUrls.push(`https://${targetDomain}/${categoryPath}/${draft.targetUrlSlug}`);
        }

        // Step D: Construct the massive Git Tree physically
        const { data: treeData } = await octokit.git.createTree({
          owner: user.githubOwner,
          repo: user.githubRepo,
          base_tree: baseSha,
          // @ts-ignore
          tree: treeItems
        });

        // Step E: Create a formal Git Commit
        const { data: commitData } = await octokit.git.createCommit({
          owner: user.githubOwner,
          repo: user.githubRepo,
          message: `🚀 Jules Auto-Deploy: Pushed ${approvedDrafts.length} Approved SEO Architectures`,
          tree: treeData.sha,
          parents: [baseSha]
        });

        // Step F: Formally point the deployment branch at the newly forged commit
        await octokit.git.updateRef({
          owner: user.githubOwner,
          repo: user.githubRepo,
          ref: `heads/${branchName}`,
          sha: commitData.sha
        });

        // Step G: Generate a formal Pull Request on the remote repository
        await octokit.pulls.create({
          owner: user.githubOwner,
          repo: user.githubRepo,
          title: `🚀 Automated Mass Deployment: ${approvedDrafts.length} SEO Pages`,
          head: branchName,
          base: 'main',
          body: `Jules the Auto-Inspector has formally cleared these ${approvedDrafts.length} structural blueprints for deployment. Merging this PR will physically output them to the live edge target domain (\`${targetDomain}\`).`
        });

        console.log(`[GITHUB SWARM] Generated formal architecture branch and PR on ${user.githubOwner}/${user.githubRepo}`);

      } catch (githubErr: any) {
        console.error('[GITHUB SWARM] Remote Deployment Architecture Failed:', githubErr);
        // Fallback to local
        deploymentModality = 'Local Export Fallback (GitHub Failed)';
      }
    }

    // 4. NATIVE LOCAL EXPORT BACKUP
    // If GitHub variables are missing, or GitHub crashed, natively drop to local MacOS Export drive
    if (deploymentModality.includes('Local')) {
      const exportsDir = path.join(process.cwd(), '_seo_exports', targetDomain.replace('https://', '').replace('http://', ''));
      
      for (const draft of approvedDrafts) {
        const categoryPath = draft.topicCategory === 'location' ? 'locations' : draft.topicCategory === 'service' ? 'features' : 'blog';
        const targetPath = path.join(exportsDir, 'public', categoryPath, draft.targetUrlSlug);
        fs.mkdirSync(targetPath, { recursive: true });
        fs.writeFileSync(path.join(targetPath, 'index.html'), draft.contentMarkdown, 'utf-8');
        
        exportedUrls.push(`https://${targetDomain}/${categoryPath}/${draft.targetUrlSlug}`);
      }
      console.log(`[LOCAL EXPORT] Saved ${approvedDrafts.length} Approved Drafts locally to ${exportsDir}`);
    }

    // 5. Fire formal completion telemetry tracking arrays via native Email logic
    if (user.email) {
      const emailEngine = new EmailService();
      await emailEngine.sendSeoCompletionAlert(user.name, user.email, targetDomain, exportedUrls);
    }

    // 6. Permanently preserve the deployed items inside MongoDB as 'Published' so the Dashboard maintains a historical ledger
    const draftIds = approvedDrafts.map((d: any) => d._id);
    await SeoDraft.updateMany({ _id: { $in: draftIds } }, { $set: { status: 'Published' } });

    return NextResponse.json({ 
      success: true, 
      message: `System Deployment Hook Formally Executed via ${deploymentModality}.`,
      exportedCount: approvedDrafts.length,
      modality: deploymentModality
    });

  } catch (error: any) {
    console.error('[DEPLOYMENT ENGINE] Catastrophic Architecture Error:', error);
    return NextResponse.json({ error: 'Internal Server Error during Edge deployment.' }, { status: 500 });
  }
}

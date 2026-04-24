import { NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import User from '@/models/User';
import connectToDatabase from '@/lib/mongodb';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get('clientId');

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID completely missing.' }, { status: 400 });
    }

    if (!process.env.GITHUB_PAT) {
      return NextResponse.json({ error: 'System architecture lacks a Master GITHUB_PAT.' }, { status: 500 });
    }

    await connectToDatabase();
    
    // Acquire formal database mapping
    const user = await User.findById(clientId).lean();
    if (!user) {
      return NextResponse.json({ error: 'Client node missing from Vault.' }, { status: 404 });
    }

    const { githubOwner, githubRepo } = user;

    if (!githubOwner || !githubRepo) {
      return NextResponse.json({ error: 'Cloud Telemetry Failed: This client lacks formally defined githubOwner and/or githubRepo mappings.' }, { status: 400 });
    }

    const octokit = new Octokit({ auth: process.env.GITHUB_PAT });

    // Step 1: Rapidly derive the active master edge branch pointer 
    const { data: refData } = await octokit.rest.git.getRef({
      owner: githubOwner,
      repo: githubRepo,
      ref: 'heads/main',
    }).catch(async () => {
       // Graceful fallback to legacy master branches if main is entirely absent
       return await octokit.rest.git.getRef({ owner: githubOwner, repo: githubRepo, ref: 'heads/master'});
    });

    const commitSha = refData.object.sha;

    // Step 2: Lock onto the Master Root Commit Geometry
    const { data: commitData } = await octokit.rest.git.getCommit({
      owner: githubOwner,
      repo: githubRepo,
      commit_sha: commitSha,
    });

    // Step 3: Physically execute a Recursive Recursive Multi-level Tree extract globally across the repository limits
    const { data: treeData } = await octokit.rest.git.getTree({
      owner: githubOwner,
      repo: githubRepo,
      tree_sha: commitData.tree.sha,
      recursive: 'true',
    });

    // We strictly filter for `.html` assets mapped into the `public/` directory matrix
    const publicHtmlFiles = treeData.tree.filter((node: any) => {
       return node.type === 'blob' && node.path?.startsWith('public/') && node.path?.endsWith('.html');
    });

    return NextResponse.json({ success: true, files: publicHtmlFiles });
    
  } catch (error: any) {
    console.error('Master GitHub Sync Failure:', error.message);
    return NextResponse.json({ error: 'Failed to recursively ping the Cloud Edge topology.' }, { status: 500 });
  }
}

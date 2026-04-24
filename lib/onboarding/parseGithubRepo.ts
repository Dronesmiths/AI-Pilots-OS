/**
 * lib/onboarding/parseGithubRepo.ts
 * lib/onboarding/verifyGithubRepoAccess.ts
 *
 * Combined in one file — parse a GitHub URL and verify write access.
 */

// ── parseGithubRepo ─────────────────────────────────────────────────────────
export interface ParsedGithubRepo {
  repoUrl:   string;
  owner:     string;
  name:      string;
  branch:    string;
  isValid:   boolean;
  error:     string;
}

export function parseGithubRepo(rawUrl: string, defaultBranch = 'main'): ParsedGithubRepo {
  const base: ParsedGithubRepo = { repoUrl: rawUrl, owner: '', name: '', branch: defaultBranch, isValid: false, error: '' };
  const raw = (rawUrl ?? '').trim().replace(/\.git$/, '');

  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const parts = url.pathname.replace(/^\//, '').split('/').filter(Boolean);
    if (parts.length < 2) return { ...base, error: 'GitHub URL must be https://github.com/owner/repo' };

    const [owner, name] = parts;
    return { repoUrl: `https://github.com/${owner}/${name}`, owner, name, branch: defaultBranch, isValid: true, error: '' };
  } catch {
    return { ...base, error: `Cannot parse "${rawUrl}" as a GitHub URL` };
  }
}

// ── verifyGithubRepoAccess ──────────────────────────────────────────────────
export interface GithubAccessResult {
  writable:      boolean;
  defaultBranch: string;
  private:       boolean;
  provider:      string; // vercel | cloudflare | github_pages | unknown
  error:         string;
}

export async function verifyGithubRepoAccess(
  owner:  string,
  name:   string,
): Promise<GithubAccessResult> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { writable: false, defaultBranch: 'main', private: false, provider: 'unknown', error: 'GITHUB_TOKEN not configured' };

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
      headers: {
        Authorization:  `Bearer ${token}`,
        Accept:         'application/vnd.github.v3+json',
        'User-Agent':   'AIPilots-CRM-Onboarding',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 404) return { writable: false, defaultBranch: 'main', private: false, provider: 'unknown', error: 'Repository not found — check owner/name and token permissions' };
    if (res.status === 403) return { writable: false, defaultBranch: 'main', private: false, provider: 'unknown', error: 'Access denied — token lacks read access to this repository' };
    if (!res.ok) return { writable: false, defaultBranch: 'main', private: false, provider: 'unknown', error: `GitHub API returned ${res.status}` };

    const data = await res.json();
    const defaultBranch = data.default_branch ?? 'main';
    const isPrivate = data.private ?? false;

    // Detect hosting provider from repo metadata
    let provider = 'unknown';
    const topics: string[] = data.topics ?? [];
    const desc: string = (data.description ?? '').toLowerCase();
    if (topics.includes('vercel') || desc.includes('vercel')) provider = 'vercel';
    else if (topics.includes('cloudflare') || desc.includes('cloudflare') || desc.includes('pages')) provider = 'cloudflare';
    else if (data.has_pages) provider = 'github_pages';

    // Test write: try to read a file (if we can read, we'll assume push is allowed via token)
    const writable = !data.permissions || data.permissions?.push === true;

    return { writable, defaultBranch, private: isPrivate, provider, error: '' };
  } catch (err: any) {
    return { writable: false, defaultBranch: 'main', private: false, provider: 'unknown', error: err.message };
  }
}

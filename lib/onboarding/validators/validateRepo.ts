/**
 * lib/onboarding/validators/validateRepo.ts
 *
 * Preflight check: is the GitHub repo accessible with our token?
 *
 * Read-only check — calls GET /repos/{owner}/{repo}.
 * Does NOT attempt a write. Write access is verified during runInstallFlow.
 */
import type { PreflightCheckResult } from '../types';

function parseRepo(repoUrl: string): { owner: string; repo: string } | null {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/\s]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

export async function validateRepo(repoUrl: string): Promise<PreflightCheckResult> {
  const parsed = parseRepo(repoUrl);
  if (!parsed) return { ok: false, message: 'Invalid GitHub URL' };

  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, message: 'Missing GITHUB_TOKEN env variable' };

  try {
    const res = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
      {
        headers: {
          Authorization:  `Bearer ${token}`,
          'User-Agent':   'AIPilots-Preflight',
          Accept:         'application/vnd.github.v3+json',
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) {
      return { ok: false, message: `Repo not accessible (HTTP ${res.status}) — check token permissions` };
    }

    const data = await res.json();
    return {
      ok:   true,
      meta: { defaultBranch: data.default_branch, private: data.private },
    };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'GitHub check failed' };
  }
}

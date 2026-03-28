import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { GitBranchSummary, GitInspectResult } from "@pocket-codex/protocol";

const execFileAsync = promisify(execFile);
const MAX_BUFFER_BYTES = 8 * 1024 * 1024;

type GitRunResult = {
  stdout: string;
  stderr: string;
};

async function runGit(cwd: string, args: string[]): Promise<GitRunResult> {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      maxBuffer: MAX_BUFFER_BYTES,
    });

    return {
      stdout: result.stdout || "",
      stderr: result.stderr || "",
    };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    const detail = String(failure.stderr || failure.stdout || failure.message || "Git command failed.").trim();
    throw new Error(detail || "Git command failed.");
  }
}

async function safeRunGit(cwd: string, args: string[]): Promise<GitRunResult | null> {
  try {
    return await runGit(cwd, args);
  } catch {
    return null;
  }
}

function parseAheadBehind(lines: string[]): { ahead: number; behind: number } {
  const branchAbLine = lines.find((line) => line.startsWith("# branch.ab "));
  if (!branchAbLine) {
    return { ahead: 0, behind: 0 };
  }

  const match = branchAbLine.match(/\+(\d+)\s+\-(\d+)/);
  return {
    ahead: match ? Number(match[1]) : 0,
    behind: match ? Number(match[2]) : 0,
  };
}

function parseBranch(lines: string[]): string | null {
  const branchHeadLine = lines.find((line) => line.startsWith("# branch.head "));
  if (!branchHeadLine) {
    return null;
  }

  const branch = branchHeadLine.replace("# branch.head ", "").trim();
  return branch && branch !== "(detached)" ? branch : null;
}

function parseBranches(stdout: string): GitBranchSummary[] {
  return stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({
      current: line.startsWith("*"),
      name: line.slice(1).trim(),
    }))
    .filter((branch) => branch.name);
}

export async function inspectGitRepository(cwd: string): Promise<GitInspectResult> {
  const [rootResult, statusResult, branchesResult, diffAgainstHead, diffWorkingTree] = await Promise.all([
    runGit(cwd, ["rev-parse", "--show-toplevel"]),
    runGit(cwd, ["status", "--porcelain=2", "--branch"]),
    safeRunGit(cwd, ["branch", "--format=%(HEAD) %(refname:short)"]),
    safeRunGit(cwd, ["diff", "--stat", "--patch", "--compact-summary", "HEAD"]),
    safeRunGit(cwd, ["diff", "--stat", "--patch", "--compact-summary"]),
  ]);

  const statusText = statusResult.stdout.trim();
  const statusLines = statusText ? statusText.split("\n") : [];
  const entryLines = statusLines.filter((line) => !line.startsWith("#"));
  const diffText = (diffAgainstHead?.stdout || diffWorkingTree?.stdout || "").trim();

  return {
    cwd,
    root: rootResult.stdout.trim() || null,
    branch: parseBranch(statusLines),
    clean: entryLines.length === 0,
    ...parseAheadBehind(statusLines),
    branches: parseBranches(branchesResult?.stdout || ""),
    statusText,
    diffText,
  };
}

export async function commitGitRepository(cwd: string, message?: string | null): Promise<GitInspectResult> {
  const resolvedMessage = message?.trim() || "Update via Pocket Codex";
  await runGit(cwd, ["add", "-A"]);
  try {
    await runGit(cwd, ["commit", "-m", resolvedMessage]);
  } catch (error) {
    const detail = error instanceof Error ? error.message.toLowerCase() : "";
    if (detail.includes("nothing to commit") || detail.includes("no changes added to commit")) {
      throw new Error("No changes to commit. The repository is already clean.");
    }
    throw error;
  }
  return inspectGitRepository(cwd);
}

export async function pushGitRepository(cwd: string): Promise<GitInspectResult> {
  await runGit(cwd, ["push"]);
  return inspectGitRepository(cwd);
}

export async function pullGitRepository(cwd: string): Promise<GitInspectResult> {
  await runGit(cwd, ["pull", "--ff-only"]);
  return inspectGitRepository(cwd);
}

export async function checkoutGitBranch(cwd: string, branch: string): Promise<GitInspectResult> {
  const resolvedBranch = branch.trim();
  if (!resolvedBranch) {
    throw new Error("Branch name is required.");
  }
  await runGit(cwd, ["checkout", resolvedBranch]);
  return inspectGitRepository(cwd);
}

export async function createGitBranch(cwd: string, branch: string): Promise<GitInspectResult> {
  const resolvedBranch = branch.trim();
  if (!resolvedBranch) {
    throw new Error("Branch name is required.");
  }
  await runGit(cwd, ["checkout", "-b", resolvedBranch]);
  return inspectGitRepository(cwd);
}

#!/usr/bin/env node

'use strict';

/**
 * Report whether the commits since the last release would actually produce a
 * Release Please release PR.
 *
 * Release Please drops any commit whose subject it cannot parse as a
 * Conventional Commit — including a squash merge that took a non-conventional
 * pull request title — and proposes nothing when zero releasable commits
 * remain. The workflow still succeeds, so the failure looks like a missing
 * branch rather than an empty release. This preflight makes that visible
 * before dispatching the workflow.
 *
 * Usage: node tools/release-preflight.js [--json]
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
// Mirrors the Conventional Commits header grammar Release Please parses:
// type, optional (scope), optional ! for breaking, then ": " and a subject.
const CONVENTIONAL = /^(?<type>[a-zA-Z]+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?: (?<subject>.+)$/;
const RELEASABLE_TYPES = new Set(['feat', 'fix']);
const SEPARATOR = '\t';

function git(args) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

// Release Please's own release commit, e.g. "chore(main): release 0.1.0-uat.2".
const RELEASE_COMMIT = /^chore(?:\([^)]*\))?: release /;

/**
 * Find the boundary this release would build on. The release tag is the
 * clearest marker but is absent from a clone fetched without tags, so fall
 * back to Release Please's own release commit, which is always on the branch.
 */
function lastRelease() {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.release-please-manifest.json'), 'utf8'));
  const version = manifest['.'];
  const tag = `v${version}`;
  try {
    git(['rev-parse', '--verify', `refs/tags/${tag}`]);
    return { version, ref: tag, anchor: 'tag' };
  } catch {
    // Not fetched; fall through.
  }
  const history = git(['log', `--format=%H${SEPARATOR}%s`, '-n', '400']);
  for (const line of history.split('\n')) {
    const [sha, subject] = line.split(SEPARATOR);
    if (RELEASE_COMMIT.test(subject || '')) {
      return { version, ref: sha, anchor: 'release-commit' };
    }
  }
  return { version, ref: null, anchor: 'none' };
}

function classify(range) {
  const raw = git(['log', `--format=%H${SEPARATOR}%s`, ...range]);
  if (!raw) return [];
  return raw.split('\n').map((line) => {
    const [sha, subject] = line.split(SEPARATOR);
    const match = CONVENTIONAL.exec(subject);
    if (!match) return { sha, subject, parsed: false, releasable: false };
    const { type, breaking } = match.groups;
    return {
      sha,
      subject,
      parsed: true,
      type,
      releasable: RELEASABLE_TYPES.has(type) || Boolean(breaking),
    };
  });
}

function main() {
  const json = process.argv.includes('--json');
  const release = lastRelease();
  if (release.anchor === 'none') {
    console.error(`Could not locate the ${release.version} release tag or release commit; fetch tags or deepen the clone.`);
    process.exit(2);
  }
  const rangeSpec = `${release.ref}..HEAD`;
  const commits = classify([rangeSpec]);
  const releasable = commits.filter((commit) => commit.releasable);
  const unparsed = commits.filter((commit) => !commit.parsed);

  const report = {
    last_release: release.version,
    anchor: release.anchor,
    range: rangeSpec,
    commits: commits.length,
    releasable: releasable.length,
    unparsed: unparsed.length,
    would_release: releasable.length > 0,
    unparsed_subjects: unparsed.map((commit) => commit.subject),
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Release preflight since ${release.version} (anchor: ${release.anchor})`);
    console.log(`  commits: ${report.commits}; releasable (feat/fix/breaking): ${report.releasable}; unparseable: ${report.unparsed}`);
    for (const commit of unparsed) {
      console.log(`  ! ignored by Release Please, not a Conventional Commit: ${commit.subject}`);
    }
    if (!report.would_release) {
      console.log('');
      console.log('Release Please would propose NO release PR from this history.');
      console.log('Squash merges take the pull request title as the commit subject, so the');
      console.log('title must itself be a Conventional Commit (e.g. "feat: ..."). To release');
      console.log('work that already landed unparseable, merge a conventional commit, pinning');
      console.log('the version with a "Release-As: <version>" footer if it must be exact.');
    }
  }
  process.exit(report.would_release ? 0 : 1);
}

main();

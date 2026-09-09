#!/usr/bin/env node

'use strict';

/**
 * Estimate release eligibility from local commit subjects since the last release.
 * This is not Release Please's parser: commit-body footers, PR-body overrides,
 * and remote release state can change the actual result.
 *
 * Usage: node tools/release-preflight.js [--json]
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
// Recognizes ordinary Conventional Commit headers:
// type, optional (scope), optional ! for breaking, then ": " and a subject.
const CONVENTIONAL = /^(?<type>[a-zA-Z]+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?: (?<subject>.+)$/;
// Visible default sections in googleapis/release-please src/util/filter-commits.ts.
const RELEASABLE_TYPES = new Set(['feat', 'fix', 'perf', 'revert']);
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
  const nonReleasable = commits.filter((commit) => commit.parsed && !commit.releasable);

  const report = {
    last_release: release.version,
    anchor: release.anchor,
    range: rangeSpec,
    commits: commits.length,
    releasable: releasable.length,
    unparsed: unparsed.length,
    parsed_non_releasable: nonReleasable.length,
    // Retained for compatibility; this is a local-subject estimate only.
    would_release: releasable.length > 0,
    basis: 'local-subjects-only',
    limitations: 'Commit-body footers, PR-body overrides, and remote release state are not evaluated.',
    unparsed_subjects: unparsed.map((commit) => commit.subject),
    parsed_non_releasable_subjects: nonReleasable.map((commit) => commit.subject),
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Release preflight since ${release.version} (anchor: ${release.anchor})`);
    console.log(`  commits: ${report.commits}; releasable subjects (feat/fix/perf/revert/breaking !): ${report.releasable}; parsed non-release: ${report.parsed_non_releasable}; unparseable: ${report.unparsed}`);
    console.log(`  Local estimate only. ${report.limitations}`);
    for (const commit of unparsed) {
      console.log(`  ! not recognized as a Conventional Commit header: ${commit.subject}`);
    }
    if (!report.would_release) {
      console.log('');
      console.log('No release-eligible subjects found locally; this does not prove Release Please will do nothing.');
      if (report.commits === 0) {
        console.log('There are no commits since the release boundary.');
      }
      if (nonReleasable.length > 0) {
        console.log('Parsed non-release types are valid Conventional Commits, but do not trigger a release by default:');
        for (const commit of nonReleasable) console.log(`  - ${commit.subject}`);
      }
      if (unparsed.length > 0) {
        console.log('For future squash merges, use a Conventional Commit PR title that accurately describes the change.');
      }
      console.log('If footers or PR-body overrides supply release intent, run prepare directly to let Release Please evaluate it:');
      console.log('  gh workflow run release-please.yml --ref main -f operation=prepare');
    }
  }
  process.exit(report.would_release ? 0 : 1);
}

main();

// Task demonstration contracts; fm-control owns locks and metadata publication.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { worktreeContent } from './fm-worktree-content.mjs';
import { contentDigest, validateMission, currentAssignment, readArtifact } from './fm-mdd-lib.mjs';

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function required(value, label) {
  if (typeof value !== 'string' || !value.trim() || /\0/.test(value)) throw Error(`${label} is required`);
  return value;
}
function reference(file, base) {
  const full = fs.realpathSync(path.resolve(base, required(file, 'evidence path')));
  if (!fs.statSync(full).isFile()) throw Error(`evidence is not a regular file: ${full}`);
  const bytes = fs.readFileSync(full);
  if (!bytes.length) throw Error(`evidence is empty: ${full}`);
  return { path: full, digest: hash(bytes) };
}
function context(metaPath, taskId) {
  required(process.env.FM_HOME, 'FM_HOME');
  const meta = Object.fromEntries(fs.readFileSync(metaPath, 'utf8').split('\n').filter(Boolean).map(line => {
    const at = line.indexOf('=');
    if (at < 1) throw Error('malformed task metadata');
    return [line.slice(0, at), line.slice(at + 1)];
  }));
  if (meta.kind !== 'ship') throw Error('demonstration requires a ship task');
  const id = taskId || path.basename(metaPath, '.meta');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) throw Error('invalid demonstration task id');
  const data = path.resolve(process.env.FM_DATA_OVERRIDE || path.join(process.env.FM_HOME, 'data'), id);
  const recordPath = path.join(data, 'demonstration.json');
  if (meta.demonstration && meta.demonstration !== recordPath) throw Error('demonstration does not belong to this task');
  const stat = fs.lstatSync(recordPath, { throwIfNoEntry: false });
  if (stat && (!stat.isFile() || stat.nlink !== 1)) throw Error('demonstration record must be an ordinary single-link file');
  return { metaPath, id, meta, data, recordPath, worktree: fs.realpathSync(meta.worktree) };
}
function atomicJson(file, value) {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}
function validatePlan(plan, worktree) {
  if (plan.version !== 1 || !['visual', 'nonvisual', 'waived'].includes(plan.kind)) throw Error('unknown demonstration version or kind');
  const authority = reference(plan.authority, worktree);
  if (plan.kind === 'waived') required(plan.reason, 'explicit waiver reason');
  if (!Array.isArray(plan.journey) || (plan.kind !== 'waived' && !plan.journey.length)) throw Error('demonstration requires the approved journey');
  const ids = new Set();
  for (const scene of plan.journey) {
    required(scene.id, 'scene id');
    if (!/^[a-zA-Z0-9._-]+$/.test(scene.id) || ids.has(scene.id)) throw Error('scene ids must be unique');
    ids.add(scene.id);
    for (const key of ['actor', 'context', 'action', 'result']) required(scene[key], `scene ${scene.id} ${key}`);
  }
  if (!Array.isArray(plan.criteria)) throw Error('project criteria must be declared, including an empty list when inapplicable');
  const criteria = new Set();
  for (const criterion of plan.criteria) {
    required(criterion.id, 'criterion id');
    if (criteria.has(criterion.id)) throw Error('duplicate project criterion');
    criteria.add(criterion.id);
    required(criterion.description, 'criterion description');
    criterion.reference = reference(criterion.reference, worktree);
  }
  required(plan.evidenceRoot, 'durable evidence root');
  if (plan.amendment) {
    required(plan.amendment.reason, 'amendment reason');
    plan.amendment.authority = reference(plan.amendment.authority, worktree);
  }
  return { ...plan, authority };
}
export function retainPlan(metaPath, input, output, taskId) {
  const ctx = context(metaPath, taskId);
  const plan = validatePlan(JSON.parse(fs.readFileSync(input, 'utf8')), ctx.worktree);
  fs.mkdirSync(ctx.data, { recursive: true });
  const record = { version: 1, task: ctx.id, worktree: ctx.worktree, baseCommit: git(ctx, ['rev-parse', 'HEAD']), plan, scenes: {} };
  if (fs.existsSync(ctx.recordPath)) {
    const previous = readRecord({ ...ctx, meta: { ...ctx.meta, demonstration: ctx.recordPath } }, false);
    record.baseCommit = previous.baseCommit ?? record.baseCommit;
    if (JSON.stringify(previous.plan) === JSON.stringify(plan)) {
      fs.writeFileSync(output, Object.entries({ ...ctx.meta, demonstration: ctx.recordPath }).map(([key, value]) => `${key}=${value}\n`).join(''));
      return previous;
    }
    if (!plan.amendment || [previous.plan.authority.digest, previous.plan.amendment?.authority.digest].includes(plan.amendment.authority.digest)) throw Error('a revised journey requires an explicit amendment with new authority evidence');
    const preserved = JSON.stringify(previous, null, 2) + '\n';
    const file = path.join(ctx.data, `demonstration-superseded-${hash(preserved)}.json`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, preserved, { flag: 'wx', mode: 0o600 });
    record.previous = reference(file, ctx.data);
  }
  record.planDigest = hash(JSON.stringify(plan));
  atomicJson(ctx.recordPath, record);
  fs.writeFileSync(output, Object.entries({ ...ctx.meta, demonstration: ctx.recordPath }).map(([key, value]) => `${key}=${value}\n`).join(''));
  return record;
}
function unchanged(ref) {
  if (!ref || reference(ref.path, '/').digest !== ref.digest) throw Error('evidence is missing or changed');
}
function readRecord(ctx, verifyEvidence = true) {
  if (!ctx.meta.demonstration) throw Error('task has no demonstration contract; register one explicitly');
  const record = JSON.parse(fs.readFileSync(ctx.recordPath, 'utf8'));
  if (record.version !== 1 || record.worktree !== ctx.worktree || record.task !== ctx.id || record.planDigest !== hash(JSON.stringify(record.plan))) throw Error('demonstration contract identity changed');
  if (record.baseCommit !== undefined && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(record.baseCommit)) throw Error('invalid demonstration base commit');
  if (verifyEvidence) {
    unchanged(record.plan.authority);
    if (record.plan.amendment) unchanged(record.plan.amendment.authority);
    for (const criterion of record.plan.criteria) unchanged(criterion.reference);
  }
  return record;
}
function git(ctx, args) {
  const result = spawnSync('git', ['-C', ctx.worktree, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw Error(`cannot inspect demonstration source: ${result.stderr.trim()}`);
  return result.stdout.trim();
}
function source(ctx, record, administrative = []) {
  return ctx.meta.mdd_state ? contentDigest(validateMission(ctx.metaPath), administrative) : hash(worktreeContent(ctx.worktree, new Set(administrative), record.baseCommit));
}
function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function sceneProof(ctx, record, file) {
  const ref = reference(file, ctx.worktree);
  const root = fs.realpathSync(path.resolve(ctx.worktree, record.plan.evidenceRoot));
  if ((!inside(ctx.worktree, root) && !inside(ctx.data, root)) || !inside(root, ref.path)) throw Error('scene evidence must be in the task/project durable evidence root');
  return ref;
}
function coverage(actual, expected, label, whole = true) {
  const allowed = new Set(expected);
  if (!Array.isArray(actual) || new Set(actual).size !== actual.length || actual.some(id => !allowed.has(id)) || (whole && actual.length !== allowed.size)) throw Error(`${whole ? 'whole journey ' : ''}${label} coverage is required`);
}
function currentScenes(ctx, record, content, durable = false) {
  for (const expected of record.plan.journey) {
    const scene = record.scenes[expected.id];
    if (!scene || scene.status !== 'observed') throw Error(`incomplete demonstration: missing scene ${expected.id}`);
    if (scene.source !== content) throw Error(`stale scene ${expected.id}; verify applicability or recapture`);
    for (const ref of scene.evidence) {
      unchanged(ref);
      if (durable && inside(ctx.worktree, ref.path)) git(ctx, ['ls-files', '--error-unmatch', '--', path.relative(ctx.worktree, ref.path)]);
    }
    unchanged(scene.report);
    if (scene.applicabilityReport) unchanged(scene.applicabilityReport);
  }
}
function basis(record, content) {
  return hash(JSON.stringify({ plan: record.plan, scenes: record.scenes, content }));
}
function examined(record, content) {
  if (!record.review || record.review.outcome !== 'accepted' || record.review.basis !== basis(record, content)) throw Error('demonstration review is absent or stale');
  unchanged(record.review.report);
}
function published(ctx, url) {
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/[1-9][0-9]*$/.test(url || '')) throw Error('publication verification currently requires a canonical GitHub PR; other forges require an explicit decision');
  const result = spawnSync('gh', ['pr', 'view', url, '--json', 'title,body,headRefOid,url,isDraft'], { cwd: ctx.worktree, encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw Error('published demonstration cannot be read from the forge');
  const remote = JSON.parse(result.stdout);
  if (remote.url !== url || remote.headRefOid !== git(ctx, ['rev-parse', 'HEAD']) || typeof remote.body !== 'string' || typeof remote.title !== 'string') throw Error('published demonstration does not match the task source or PR');
  return { remote, digest: hash(JSON.stringify([remote.title, remote.body, remote.headRefOid, remote.url])) };
}
function publication(ctx, record, report) {
  const pub = report.publication;
  if (!pub) throw Error('published delivery requires a verified demonstration publication');
  const { remote, digest } = published(ctx, pub.url);
  const start = '<!-- pr-demonstration:start -->', end = '<!-- pr-demonstration:end -->';
  if (remote.body.split(start).length !== 2 || remote.body.split(end).length !== 2 || remote.body.indexOf(start) >= remote.body.indexOf(end)) throw Error('published demonstration markers are missing or ambiguous');
  const section = remote.body.slice(remote.body.indexOf(start), remote.body.indexOf(end) + end.length);
  if (!fs.readFileSync(report.artifact, 'utf8').includes(section)) throw Error('reader artifact differs from the published demonstration');
  if (!section.includes(required(pub.trialText, 'published trial status text'))) throw Error('published demonstration omits trial instructions/status');
  for (const scene of Object.values(record.scenes)) {
    if (!section.includes(scene.caption)) throw Error(`published demonstration omits scene caption ${scene.id}`);
  }
  if (!Array.isArray(pub.media)) throw Error('published media mapping must be declared');
  if (record.plan.kind === 'visual') {
    coverage([...new Set(pub.media.map(media => media.scene))], record.plan.journey.map(scene => scene.id), 'published media');
  }
  for (const media of pub.media) {
    if (!record.scenes[media.scene] || !/^https:\/\/github\.com\/user-attachments\/assets\/[a-zA-Z0-9-]+$/.test(media.url || '') || !section.includes(media.url)) throw Error('published media is absent from the demonstration or is not a native attachment');
    const access = spawnSync('gh', ['api', '--silent', media.url], { cwd: ctx.worktree, encoding: 'utf8', timeout: 15000 });
    if (access.status !== 0) throw Error(`published scene media is inaccessible: ${media.scene}`);
  }
  return { url: pub.url, head: remote.headRefOid, digest, media: pub.media, trialText: pub.trialText };
}
export function retainReport(metaPath, input) {
  const ctx = context(metaPath), record = readRecord(ctx);
  if (record.plan.kind === 'waived') throw Error('a waived demonstration has no evidence reports');
  const report = JSON.parse(fs.readFileSync(input, 'utf8'));
  if (report.head !== git(ctx, ['rev-parse', 'HEAD'])) throw Error('demonstration report names another source head');
  const content = source(ctx, record), terminal = reference(report.report, ctx.worktree);
  if (report.stage === 'progress') {
    const previousBasis = basis(record, content), previousProgress = JSON.stringify(record.progress);
    if (!Array.isArray(report.scenes) || !report.scenes.length) throw Error('progress must cover at least one scene or declare its gap');
    const seen = new Set();
    for (const scene of report.scenes) {
      if (seen.has(scene.id) || !record.plan.journey.some(row => row.id === scene.id)) throw Error('unknown or duplicate progress scene');
      seen.add(scene.id);
      if (scene.reuse === true) {
        required(scene.reason, 'scene reuse applicability reason');
        const previous = record.scenes[scene.id];
        if (!previous || previous.status !== 'observed') throw Error('no observed scene to reuse');
        for (const ref of previous.evidence) unchanged(ref);
        record.scenes[scene.id] = { ...previous, source: content, reuseReason: scene.reason, applicabilityReport: terminal };
      } else if (scene.status === 'missing') {
        required(scene.reason, 'missing scene reason');
        record.scenes[scene.id] = { id: scene.id, status: 'missing', reason: scene.reason, source: content };
      } else {
        if (scene.status !== 'observed' || !Array.isArray(scene.evidence) || !scene.evidence.length) throw Error('observed scene requires retained evidence');
        required(scene.caption, 'visible scene caption');
        record.scenes[scene.id] = { id: scene.id, status: 'observed', caption: scene.caption, evidence: scene.evidence.map(file => sceneProof(ctx, record, file)), report: terminal, source: content };
      }
    }
    record.progress = { source: content, report: terminal, generation: ctx.meta.spawn_gen || null };
    if (previousBasis !== basis(record, content) || previousProgress !== JSON.stringify(record.progress)) {
      delete record.review;
      delete record.reader;
    }
  } else if (report.stage === 'review' || report.stage === 'reader') {
    if (report.complete !== true || !['accepted', 'correction_required'].includes(report.outcome)) throw Error('a complete review verdict is required');
    const accepted = report.outcome === 'accepted';
    if (accepted) currentScenes(ctx, record, content);
    coverage(report.scenes, record.plan.journey.map(scene => scene.id), 'scene', accepted);
    const receipt = { source: content, basis: basis(record, content), report: terminal, outcome: report.outcome, head: report.head };
    if (!accepted) receipt.reason = required(report.reason, 'rejection reason');
    if (report.stage === 'review') {
      coverage(report.criteria, record.plan.criteria.map(row => row.id), 'project criterion', accepted);
      if (accepted && record.plan.kind === 'visual' && report.composition !== true) throw Error('visual review must examine full-screen composition against project rules');
      if (ctx.meta.mdd_state) {
        const assignment = currentAssignment(metaPath);
        if (!['reviewer', 'final-reviewer'].includes(assignment.role)) throw Error('MDD demonstration review belongs to its existing reviewer');
        receipt.assignment = assignment.id;
        receipt.generation = required(ctx.meta.spawn_gen, 'review generation');
      }
      if (JSON.stringify(record.review) !== JSON.stringify(receipt)) delete record.reader;
      record.review = receipt;
    } else if (!accepted) {
      record.reader = receipt;
    } else {
      examined(record, content);
      if (!report.trial || !['available', 'unavailable', 'not-applicable'].includes(report.trial.status)) throw Error('explicit trial status is required');
      if (report.trial.status === 'available') {
        if (!/^https?:\/\//.test(report.trial.url || '') || !Array.isArray(report.trial.steps) || !report.trial.steps.length) throw Error('trial URL and steps are required');
        required(report.trial.availability, 'trial availability window');
        receipt.access = reference(report.trial.accessEvidence, ctx.worktree);
      } else required(report.trial.reason, 'trial unavailability reason');
      if (!Array.isArray(report.limits)) throw Error('reader report must declare limitations');
      receipt.trial = report.trial;
      receipt.limits = report.limits;
      receipt.artifact = reference(report.artifact, ctx.worktree);
      if (ctx.meta.mode !== 'local-only') receipt.publication = publication(ctx, record, { ...report, artifact: receipt.artifact.path });
      record.reader = receipt;
    }
  } else throw Error('unknown demonstration report stage');
  atomicJson(ctx.recordPath, record);
  return record;
}
export function check(metaPath, stage = 'delivery', expectedUrl, administrative = []) {
  const ctx = context(metaPath), record = readRecord(ctx);
  if (record.plan.kind === 'waived') return record;
  if (stage === 'contract') return record;
  const content = source(ctx, record, administrative);
  if (stage === 'checkpoint') {
    if (!record.progress || record.progress.source !== content) throw Error('demonstration progress or explicit gaps must be reported for this return');
    if (record.progress.generation !== (ctx.meta.spawn_gen || null)) throw Error('demonstration progress belongs to another execution');
    unchanged(record.progress.report);
    return record;
  }
  currentScenes(ctx, record, content, stage === 'delivery' || stage === 'live');
  examined(record, content);
  if (stage === 'review') return record;
  const reader = record.reader;
  if (!reader || reader.outcome !== 'accepted' || reader.basis !== basis(record, content) || reader.head !== git(ctx, ['rev-parse', 'HEAD'])) throw Error('whole demonstration reader examination is absent or stale');
  unchanged(reader.report);
  unchanged(reader.artifact);
  if (reader.access) unchanged(reader.access);
  if (ctx.meta.mode !== 'local-only') {
    if (!reader.publication || reader.publication.head !== git(ctx, ['rev-parse', 'HEAD'])) throw Error('published demonstration is absent or stale');
    if (expectedUrl && reader.publication.url !== expectedUrl) throw Error('publication belongs to another PR');
    if (stage === 'live' && publication(ctx, record, { artifact: reader.artifact.path, publication: reader.publication }).digest !== reader.publication.digest) throw Error('published presentation changed after reader examination');
  }
  if (git(ctx, ['status', '--porcelain', '--untracked-files=all'])) throw Error('delivery requires the demonstrated content and retained project evidence to be committed');
  return record;
}
export function archiveFiles(metaPath) {
  const ctx = context(metaPath), files = new Map();
  function retain(ref) {
    unchanged(ref);
    files.set(ref.path, ref);
  }
  function collect(file, record) {
    if (files.has(file)) return;
    files.set(file, reference(file, '/'));
    if (record.version !== 1 || record.task !== ctx.id || record.worktree !== ctx.worktree || record.planDigest !== hash(JSON.stringify(record.plan))) throw Error('archived demonstration identity changed');
    for (const ref of [record.plan.authority, record.plan.amendment?.authority, record.progress?.report, record.review?.report, record.reader?.report, record.reader?.artifact, record.reader?.access]) if (ref) retain(ref);
    for (const criterion of record.plan.criteria) retain(criterion.reference);
    for (const scene of Object.values(record.scenes)) {
      for (const ref of [...(scene.evidence || []), scene.report, scene.applicabilityReport]) if (ref) retain(ref);
    }
    if (record.previous) {
      unchanged(record.previous);
      collect(record.previous.path, JSON.parse(fs.readFileSync(record.previous.path, 'utf8')));
    }
  }
  collect(ctx.recordPath, readRecord(ctx));
  return [...files.values()];
}
export function checkAcceptance(metaPath, resultPath) {
  const assignment = currentAssignment(metaPath);
  const finalAcceptance = assignment.role === 'final-reviewer' && readArtifact(resultPath).outcome === 'accepted';
  const record = check(metaPath, finalAcceptance ? 'review' : 'checkpoint', undefined, [fs.realpathSync(resultPath)]);
  if (record.plan.kind !== 'waived' && finalAcceptance) {
    const ctx = context(metaPath);
    if (record.review.assignment !== assignment.id || record.review.generation !== ctx.meta.spawn_gen) throw Error('demonstration examination is not the current final reviewer result');
  }
  return record;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (command === '--help') console.log(`Task demonstration contract (version 1)

fm-spawn/fm-promote: --demonstration <plan.json>
fm-control <task> demonstration: --plan <plan.json> | --report <report.json> | --action check|checkpoint
All paths in inputs resolve against the task worktree. Reports should live in task data.

Plan:
{"version":1,"kind":"visual","authority":"/task/approved-request.md","evidenceRoot":".missions/example/evidence","journey":[{"id":"request","actor":"buyer","context":"/requests/new","action":"submit","result":"request persisted"}],"criteria":[{"id":"layout","description":"Secondary history is in a Drawer","reference":"docs/interface-rules.md"}]}
Kinds: visual, nonvisual, waived. Waived requires an explicit user authority and reason.
Use task-owned evidence storage when the project has no archive convention.
An amended plan also requires amendment: {"authority":"/task/new-decision.md","reason":"Scope change"}.
An identical plan is idempotent. Amendments preserve the previous record and invalidate reports.

Every report includes head (actual Git HEAD) and report (the complete terminal report file).
Progress: {"stage":"progress","scenes":[{"id":"request","status":"observed","caption":"Buyer /requests/new: submits request","evidence":[".missions/example/evidence/request.png"]}]}
Declare a gap with {id, status:"missing", reason}. Reuse with {id, reuse:true, reason} after inspecting applicability.
Unmentioned scenes remain in their journey position; stale scenes cannot pass final review.
Review: {"stage":"review","complete":true,"outcome":"accepted","scenes":["request"],"criteria":["layout"],"composition":true}
Outcomes: accepted, correction_required. Rejections require reason and may cover only the inspected subset; they remain blocking. Accepted visual reviews require composition:true.
MDD reviews bind to the current reviewer assignment and generation; final acceptance requires its final reviewer.
Reader: {"stage":"reader","complete":true,"outcome":"accepted","scenes":["request"],"artifact":"/task/demonstration.md","trial":{"status":"unavailable","reason":"No shared runtime"},"limits":[]}
Available trial access requires url, steps, availability and accessEvidence (a real access-check report).
Trial statuses: available, unavailable, not-applicable. The latter two require a reason.
For publishing modes the reader also provides publication: {"url":"https://github.com/owner/repo/pull/1","media":[{"scene":"request","url":"https://github.com/user-attachments/assets/asset-id"}],"trialText":"Visible trial status"}.
The artifact must contain the exact published demonstration section. PR title/body/head are read live.
Native asset access is checked when recording the reader report; registration and merge recheck both the PR snapshot and its native assets.
Project media must be tracked for delivery; ignored capture workspaces are not durable archives.
The CLI records attestations and applicability, not semantic judgments or publication authority.`);
    else if (command === 'plan' && args.length === 3) retainPlan(...args);
    else if (command === 'initialize' && args.length === 4) retainPlan(...args);
    else if (command === 'brief' && args.length === 1) {
      const record = JSON.parse(fs.readFileSync(args[0], 'utf8'));
      console.log(`\n# Demonstration obligation\nRead the current task contract at ${args[0]}. Preserve its complete ordered journey across corrections. At each work return, save a complete report and submit progress for every affected scene or explicit gap through Firstmate. A draft may be partial. The existing UI reviewer must examine full-screen composition and project criteria; Firstmate must read the whole presentation before delivery. Retain sanitized media under ${record.plan.evidenceRoot}; temporary captures are scratch, not the evidence archive. A return never accepts the work or authorizes publication.\n`);
    } else if (command === 'archive-files' && args.length === 1) console.log(JSON.stringify(archiveFiles(args[0])));
    else if (command === 'report' && args.length === 2) retainReport(...args);
    else if (['check', 'checkpoint'].includes(command) && args.length === 1) check(args[0], command === 'check' ? 'delivery' : 'checkpoint');
    else if (command === 'live-check' && args.length === 2) check(args[0], 'live', args[1]);
    else if (command === 'contract-check' && args.length === 1) check(args[0], 'contract');
    else if (command === 'accept-check' && args.length === 2) checkAcceptance(...args);
    else throw Error('unknown demonstration operation');
  } catch (error) {
    console.error(`demonstration: ${error.message}`);
    process.exitCode = 1;
  }
}

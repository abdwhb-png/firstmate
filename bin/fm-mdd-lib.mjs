// External MDD transport. The qualified bundle owns schemas and mission rules.
// Requires Node >=24. CLI operations below are internal to fm-spawn/control.
// pin <source> <task-data> [project] verifies the qualified file digest, excluding
// .git/node_modules, and snapshots the distribution. Mission/assignment/candidate
// operations call the frozen CLI; MDD alone owns state/history validation.
// authorize/action-check bind explicit coordinator attestations to existing
// evidence. They neither infer natural-language authority nor invoke a pipeline.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { worktreeContent } from './fm-worktree-content.mjs';

const qualifications = [Object.freeze({
  version: 'v0.4-experimental',
  source: '71a3d3570d5dd04992f16dfff617bb31090d7732',
  digest: 'c6790f60fec0d812c8f1fb2a6555547643a7cc717de352291b6d8c0626d8cdc7',
}), Object.freeze({ version: 'v0.5-experimental', deliveryAware: true, source: 'abdwhb-png/agent-stack:de1fca2329576b00baa23a629531f3f196f3c675', digest: '2e05f0d56bf47d215627110021fa26fc7e0b96c24a5736f87bcace661f0345b8' }), Object.freeze({ version: 'v0.6-experimental', deliveryAware: true, portableEvidence: true, earlyDrafts: true, source: 'abdwhb-png/agent-stack:928a50fbcd78a8276f636b56b4526ee25f8e8047', digest: 'dc3ab1d50fa3de44ae0c883d35608d4e17973a98d1fee0a281fc34bb325cfda1' }), Object.freeze({ version: 'v0.7-experimental', deliveryAware: true, portableEvidence: true, earlyDrafts: true, source: 'abdwhb-png/agent-stack:1686f534a51381324e4f040a1d327daaad4fd926', digest: '7705dfc2b75155b7bdc9c0023a198ce383c2f3abd3df2c83001f06c074a6c404' })];
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function requireNode() {
  if (Number(process.versions.node.split('.')[0]) < 24) throw Error('MDD requires Node >=24');
}
function files(root, relative = '') {
  return fs.readdirSync(path.join(root, relative)).sort().flatMap(name => {
    if (name === '.git' || name === 'node_modules') return [];
    const file = path.join(relative, name), stat = fs.lstatSync(path.join(root, file));
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw Error(`unsupported bundle entry: ${file}`);
    return stat.isDirectory() ? files(root, file) : [file];
  });
}
export function bundleDigest(root) {
  return hash(files(root).sort().map(file => `${file}\0${hash(fs.readFileSync(path.join(root, file)))}\n`).join(''));
}
function checkBundle(root) {
  requireNode();
  const digest = bundleDigest(root);
  const qualified = qualifications.find(row => row.digest === digest);
  if (!qualified) throw Error('MDD distribution is unknown, incomplete or altered; a compatibility decision is required');
  return qualified;
}
export function pinBundle(source, data, project) {
  if (project) {
    const local = ['.agents/skills', '.claude/skills', '.pi/skills'].map(dir => path.join(project, dir, 'mission-driven-dev')).filter(file => fs.existsSync(file));
    const identities = new Set(local.map(file => bundleDigest(file)));
    if (identities.size > 1) throw Error('ambiguous project MDD distributions; select one project version explicitly before preparation');
    if (local.length) source = local[0];
  }
  const qualified = checkBundle(source);
  const identity = { ...qualified, sourcePath: fs.realpathSync(source) };
  fs.mkdirSync(data, { recursive: true });
  const target = path.join(data, 'mdd-bundle');
  if (fs.existsSync(target)) throw Error('mission bundle already exists; preserve it and reconcile preparation');
  const temp = fs.mkdtempSync(path.join(data, '.mdd-bundle-'));
  // Preserve a failed copy for diagnosis. It never becomes an active snapshot.
  for (const file of files(source)) {
    const dest = path.join(temp, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(source, file), dest, fs.constants.COPYFILE_EXCL);
  }
  checkBundle(temp);
  fs.renameSync(temp, target);
  fs.writeFileSync(path.join(data, 'mdd-bundle.json'), JSON.stringify(identity, null, 2) + '\n', { flag: 'wx' });
  return identity;
}
export function readMeta(file) {
  const meta = Object.fromEntries(fs.readFileSync(file, 'utf8').trim().split('\n').map(line => {
    const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)];
  }));
  if (!meta.mdd_state || !meta.mdd_data) throw Error('task has no MDD binding');
  return meta;
}
function contained(root, file) {
  const base = fs.realpathSync(root), actual = fs.realpathSync(file), relative = path.relative(base, actual);
  if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw Error(`artifact outside mission worktree: ${file}`);
  return actual;
}
export function readArtifact(file) {
  const text = fs.readFileSync(file, 'utf8');
  return JSON.parse(text.startsWith('---\n') ? text.slice(4, text.indexOf('\n---', 4)) : text);
}
export function validateArtifact(bundle, file, candidate, root) {
  const result = spawnSync(process.execPath, [path.join(bundle, 'scripts/validate.mjs'), file, ...(candidate ? ['--candidate', candidate] : []), ...(root ? ['--root', root] : []), '--json'], { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  let report;
  try { report = JSON.parse(result.stdout); } catch { throw Error(`MDD CLI returned unreadable JSON: ${result.error?.message ?? result.stderr}`); }
  if (result.status !== 0 || report.valid !== true || !Array.isArray(report.issues) || report.issues.length !== 0) throw Error(`MDD validation refused: ${JSON.stringify(report)}`);
}
function taskBundle(meta) {
  const bundle = path.join(meta.mdd_data, 'mdd-bundle');
  const qualified = checkBundle(bundle);
  const manifest = JSON.parse(fs.readFileSync(path.join(meta.mdd_data, 'mdd-bundle.json'), 'utf8'));
  if (manifest.digest !== qualified.digest || manifest.source !== qualified.source) throw Error('mission bundle identity disagrees with qualified distribution');
  return { bundle, qualified };
}
export function validateMission(metaPath) {
  requireNode();
  const meta = readMeta(metaPath), { bundle, qualified } = taskBundle(meta);
  const statePath = contained(meta.worktree, path.resolve(meta.worktree, meta.mdd_state));
  const before = fs.readFileSync(statePath);
  validateArtifact(bundle, statePath);
  if (!before.equals(fs.readFileSync(statePath))) throw Error('mission state changed during validation');
  const state = JSON.parse(before);
  if (state.executionMode !== 'coordinated') throw Error('MDD requires the recorded coordinated mode decision');
  if (state.interruption) throw Error('MDD mission is interrupted; follow its recovery procedure');
  const missionPath = contained(meta.worktree, path.resolve(path.dirname(statePath), state.mission.path));
  const mission = readArtifact(missionPath);
  if (fs.realpathSync(path.resolve(path.dirname(missionPath), mission.repository)) !== fs.realpathSync(meta.worktree)) throw Error('mission repository does not match task worktree');
  if (meta.mdd_mission && meta.mdd_mission !== state.id) throw Error('mission identity changed; reconcile assignment');
  if (!qualified.deliveryAware && mission.delivery) throw Error('delivery-aware mission requires a qualified delivery-aware distribution; do not migrate frozen missions implicitly');
  return { meta, metaFile: metaPath, bundle, qualified, state, statePath, missionPath, mission };
}

function evidencePath(context, reference) {
  return fs.realpathSync(path.resolve(path.dirname(context.statePath), reference.path));
}
function requireAuthority(context, file) {
  if (!file) throw Error('explicit authority evidence is required');
  const absolute = fs.realpathSync(file);
  if (!context.state.evidence.some(ref => evidencePath(context, ref) === absolute) || !fs.readFileSync(absolute, 'utf8').trim()) throw Error('authority must reference nonempty existing mission evidence');
  return { path: absolute, digest: hash(fs.readFileSync(absolute)) };
}
function packetIdentity(context) {
  const ref = context.state.currentPacket;
  if (!ref) return null;
  const file = contained(context.meta.worktree, path.resolve(path.dirname(context.statePath), ref.path));
  const packet = readArtifact(file);
  if (context.mission.delivery && packet.deliveryAssessment?.decision !== 'continue') throw Error('delivery assessment is absent, stale or needs a boundary decision');
  const probe = spawnSync('git', ['-C', context.meta.worktree, 'cat-file', '-e', `${packet.baseCommit}^{commit}`]);
  if (probe.status !== 0) throw Error('packet base is not an available Git commit');
  if (spawnSync('git', ['-C', context.meta.worktree, 'merge-base', '--is-ancestor', packet.baseCommit, 'HEAD']).status !== 0) throw Error('packet base is not in the assigned worktree history');
  return { id: ref.id, revision: ref.revision, path: file, digest: hash(fs.readFileSync(file)) };
}
function writeMeta(meta, output) {
  for (const [key, value] of Object.entries(meta)) {
    if (/[\r\n\0]/.test(String(value)) || !/^[a-z_]+$/.test(key)) throw Error('invalid task metadata field');
  }
  fs.writeFileSync(output, Object.entries(meta).map(([key, value]) => `${key}=${value}\n`).join(''));
}
export function prepareAssignment(metaPath, role, briefFile, authorityFile, output) {
  const context = validateMission(metaPath), { meta, state } = context;
  const authority = requireAuthority(context, authorityFile);
  dependencyCheck(context);
  if (!['implementer', 'reviewer', 'final-reviewer'].includes(role)) throw Error('unknown MDD assignment role');
  const packet = packetIdentity(context);
  if (role === 'implementer' && packet && context.mission.delivery && readArtifact(packet.path).deliveryAssessment.commit !== git(context, ['rev-parse', 'HEAD'])) throw Error('delivery assessment does not cover the actual assignment head');
  if (role === 'final-reviewer') {
    if (state.status !== 'validating' || packet) throw Error('final reviewer requires validating mission without an active packet');
  } else if (!packet || !['executing', 'validating'].includes(state.status)) throw Error('assignment requires a current packet in an active mission');
  if (meta.mdd_assignment) {
    const previous = JSON.parse(fs.readFileSync(meta.mdd_assignment));
    if (previous.packet && previous.packet.id !== packet?.id) {
      const attempt = state.attempts.find(row => row.packet.id === previous.packet.id && row.packet.revision === previous.packet.revision);
      const resultPath = attempt?.result && path.resolve(path.dirname(context.statePath), attempt.result.path);
      if (!resultPath || !records(meta, 'acceptances').some(row => row.result === resultPath && ['accepted', 'correction_required'].includes(row.outcome) && row.resultDigest === hash(fs.readFileSync(resultPath)))) throw Error('previous packet has no examined result; reconcile it before advancing');
    }
    if (previous.role === role && JSON.stringify(previous.packet) === JSON.stringify(packet) && !(role === 'final-reviewer' && records(meta, 'acceptances').some(row => row.assignment === previous.id && row.content !== contentDigest(context)))) throw Error('packet is already assigned; resume its existing assignment instead');
  }
  const id = crypto.randomUUID(), dir = path.join(meta.mdd_data, 'assignments');
  fs.mkdirSync(dir, { recursive: true });
  const brief = path.join(dir, `${id}.md`), file = path.join(dir, `${id}.json`);
  const portable = context.qualified.portableEvidence === true;
  const report = portable ? path.join(path.dirname(context.statePath), 'reports', `${id}.md`) : path.join(meta.mdd_data, `report-${id}.md`);
  if (portable) fs.mkdirSync(path.dirname(report), { recursive: true });
  const handoff = fs.readFileSync(briefFile, 'utf8');
  if (!handoff.trim()) throw Error('empty assignment handoff');
  const text = `${handoff}\n\n# MDD assignment\nRead ${context.bundle}/SKILL.md and ${context.bundle}/references/${role === 'implementer' ? 'execution' : 'validation'}.md. Mission state: ${context.statePath}. Contract: ${context.missionPath}. Packet: ${packet?.path ?? 'whole mission'}. Worktree: ${meta.worktree}. Role: ${role}. Authority evidence: ${authority.path}.\nSave your complete terminal report to ${report} and return its path to FirstMate. Keep MDD contracts and results in the mission worktree. A work return is a candidate, never permission to publish, invoke No-Mistakes, accept your own work or close the mission. Follow only the current handoff.\n`;
  fs.writeFileSync(brief, text + (portable ? '\nThe report target is an authorized administrative output; a reviewer may write that report while keeping implementation and tests read-only.\n' : '') + (meta.demonstration ? `\nDemonstration obligation: read ${meta.demonstration} and retain its whole journey in this assignment and its complete return.\n` : ''), { flag: 'wx' });
  const assignment = { id, role, ...(portable ? { reportTarget: report } : {}), mission: state.id, revision: state.mission.revision, packet, authority, brief, briefDigest: hash(fs.readFileSync(brief)), missionDigest: hash(fs.readFileSync(context.missionPath)), worktree: fs.realpathSync(meta.worktree) };
  fs.writeFileSync(file, JSON.stringify(assignment, null, 2) + '\n', { flag: 'wx' });
  writeMeta({ ...meta, mdd_assignment: file, mdd_brief: brief, mdd_mission: state.id, mdd_revision: state.mission.revision }, output);
  return assignment;
}
export function currentAssignment(metaPath, context = validateMission(metaPath)) {
  const { meta, state } = context;
  if (!meta.mdd_assignment) throw Error('mission has no assignment');
  const assignment = JSON.parse(fs.readFileSync(meta.mdd_assignment));
  if (assignment.brief !== meta.mdd_brief || assignment.revision !== Number(meta.mdd_revision) || assignment.missionDigest !== hash(fs.readFileSync(context.missionPath)) || assignment.worktree !== fs.realpathSync(meta.worktree) || assignment.mission !== state.id || assignment.revision !== state.mission.revision || JSON.stringify(assignment.packet) !== JSON.stringify(packetIdentity(context))) throw Error('current state and task assignment disagree');
  if (hash(fs.readFileSync(assignment.brief)) !== assignment.briefDigest) throw Error('assignment brief changed after publication');
  if (requireAuthority(context, assignment.authority.path).digest !== assignment.authority.digest) throw Error('assignment authority changed');
  return assignment;
}

function recordDirectory(meta, name) {
  const dir = path.join(meta.mdd_data, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function records(meta, name) {
  const dir = recordDirectory(meta, name);
  return fs.readdirSync(dir).filter(file => file.endsWith('.json')).map(file => JSON.parse(fs.readFileSync(path.join(dir, file))));
}
function evidenceDigest(artifact, owner) {
  const references = [];
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.kind === 'evidence' && typeof value.path === 'string') {
      const file = fs.realpathSync(path.resolve(path.dirname(owner), value.path));
      references.push(`${file}\0${hash(fs.readFileSync(file))}`);
    } else for (const child of Object.values(value)) visit(child);
  }
  visit(artifact);
  return hash(references.sort().join('\n'));
}
export function contentDigest(context, extraAdministrative = []) {
  const { meta, state, statePath } = context;
  const administrative = new Set([statePath, path.resolve(path.dirname(statePath), state.history), ...extraAdministrative]);
  for (const ref of [state.validation, ...state.attempts.map(attempt => attempt.result)]) {
    if (ref) administrative.add(path.resolve(path.dirname(statePath), ref.path));
  }
  const reportDigests = [];
  if (context.qualified.portableEvidence === true) {
    const current = meta.mdd_assignment && JSON.parse(fs.readFileSync(meta.mdd_assignment));
    for (const assignment of records(meta, 'assignments')) {
      if (!assignment.reportTarget) continue;
      administrative.add(assignment.reportTarget);
      if (assignment.id !== current?.id && fs.existsSync(assignment.reportTarget)) reportDigests.push(`${assignment.reportTarget}\0${hash(fs.readFileSync(assignment.reportTarget))}`);
    }
  }
  const { integration, ...reviewedState } = state;
  if (context.mission.delivery) for (const row of records(meta, 'acceptances')) administrative.add(row.result);
  const evidence = [...reportDigests.sort(), evidenceDigest(reviewedState, statePath), evidenceDigest(readArtifact(context.missionPath), context.missionPath)];
  for (const attempt of state.attempts) {
    const packet = path.resolve(path.dirname(statePath), attempt.packet.path);
    evidence.push(evidenceDigest(readArtifact(packet), packet));
  }
  return hash(evidence.join('\n') + '\n' + worktreeContent(meta.worktree, administrative, context.mission.delivery?.baseCommit));
}
function executionPath(meta, assignment) {
  if (!/^[A-Za-z0-9._-]+$/.test(meta.spawn_gen ?? '')) throw Error('no verified execution identity');
  return path.join(recordDirectory(meta, 'executions'), `${meta.spawn_gen}-${assignment.id}.json`);
}
export function dispatchCheck(metaPath) {
  const context = validateMission(metaPath);
  dependencyCheck(context);
  return currentAssignment(metaPath, context);
}
export function bindExecution(metaPath) {
  dispatchCheck(metaPath);
  const context = validateMission(metaPath), assignment = currentAssignment(metaPath, context), { meta } = context;
  const file = executionPath(meta, assignment);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file));
  if (assignment.role !== 'implementer' && records(meta, 'executions').some(row => row.generation === meta.spawn_gen)) throw Error('review requires a fresh execution, not an implementer context');
  const task = path.basename(metaPath, '.meta');
  const receipt = { assignment: assignment.id, generation: meta.spawn_gen, actor: `${task}:${meta.spawn_gen}`, role: assignment.role, packet: assignment.packet, mission: assignment.mission, revision: assignment.revision, content: contentDigest(context) };
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  return receipt;
}
function currentExecution(metaPath) {
  const context = validateMission(metaPath), assignment = currentAssignment(metaPath, context);
  const execution = JSON.parse(fs.readFileSync(executionPath(context.meta, assignment)));
  if (execution.assignment !== assignment.id || execution.generation !== context.meta.spawn_gen) throw Error('execution does not match current assignment');
  return { ...context, assignment, execution };
}
export function recordCandidate(metaPath, reportFile, complete) {
  if (complete !== true) throw Error('a complete terminal report is required');
  const context = currentExecution(metaPath), { meta, execution } = context;
  const report = fs.realpathSync(reportFile), text = fs.readFileSync(report, 'utf8');
  if (!text.trim()) throw Error('complete report is empty');
  if (context.assignment.reportTarget && fs.realpathSync(context.assignment.reportTarget) !== report) throw Error('report must use the immutable assignment path');
  const receipt = { ...execution, content: contentDigest(context), report, reportDigest: hash(text), complete: true };
  if (execution.role !== 'implementer' && receipt.content !== execution.content) throw Error('reviewed content changed during review');
  const file = path.join(recordDirectory(meta, 'candidates'), `${execution.generation}-${execution.assignment}.json`);
  if (fs.existsSync(file)) {
    if (JSON.stringify(JSON.parse(fs.readFileSync(file))) !== JSON.stringify(receipt)) throw Error('candidate already recorded with different evidence; preserve it and reconcile');
  } else fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  return receipt;
}
export function acceptResult(metaPath, resultFile) {
  const context = currentExecution(metaPath), { meta, execution, state } = context;
  const resultPath = fs.realpathSync(resultFile);
  validateArtifact(context.bundle, resultPath);
  const result = readArtifact(resultPath);
  const candidateFile = path.join(recordDirectory(meta, 'candidates'), `${execution.generation}-${execution.assignment}.json`);
  const candidate = JSON.parse(fs.readFileSync(candidateFile));
  if (candidate.complete !== true || hash(fs.readFileSync(candidate.report)) !== candidate.reportDigest) throw Error('complete candidate report is missing or changed');
  if (candidate.content !== contentDigest(context, [resultPath])) throw Error('candidate content changed after report');
  if (result.mission.id !== state.id || result.mission.revision !== state.mission.revision) throw Error('result is for another mission revision');
  if (result.outcome === 'accepted') dependencyCheck(context);
  if (context.mission.delivery && result.outcome === 'accepted' && result.deliveryAssessment?.commit !== git(context, ['rev-parse', 'HEAD'])) throw Error('accepted return requires a current delivery assessment');
  const missionReview = result.scope === 'mission';
  if (fs.realpathSync(path.resolve(path.dirname(resultPath), result.mission.path)) !== context.missionPath || (!missionReview && fs.realpathSync(path.resolve(path.dirname(resultPath), result.packet.path)) !== execution.packet?.path)) throw Error('result references do not match the assigned mission and packet');
  if (missionReview && execution.role !== 'final-reviewer') throw Error('mission acceptance requires a fresh final reviewer');
  if (!missionReview && (!result.packet || result.packet.id !== execution.packet?.id || result.packet.revision !== execution.packet?.revision)) throw Error('result does not cover assigned packet');
  const implementers = [...new Set(records(meta, 'executions').filter(row => row.role === 'implementer' && row.mission === state.id && row.revision === state.mission.revision && (missionReview || row.packet?.id === execution.packet?.id)).map(row => row.actor))].sort();
  if (implementers.length === 0 || JSON.stringify([...result.implementers].sort()) !== JSON.stringify(implementers)) throw Error('result implementers do not match actual execution identities');
  if (implementers.includes(result.actor)) throw Error('independent acceptance cannot be performed by an implementer');
  if (execution.role !== 'implementer' && (result.actor !== execution.actor || result.freshContext !== true)) throw Error('review actor or fresh context does not match actual execution');
  if (execution.role === 'implementer' && !result.actor.startsWith('firstmate:')) throw Error('packet coordinator acceptance requires a FirstMate actor');
  if (!result.evidence.some(ref => fs.realpathSync(path.resolve(path.dirname(resultPath), ref.path)) === candidate.report)) throw Error('result must reference the complete execution report');
  const receipt = { ...candidate, result: resultPath, resultDigest: hash(fs.readFileSync(resultPath)), outcome: result.outcome, scope: result.scope, actor: result.actor, evidence: evidenceDigest(result, resultPath) };
  const file = path.join(recordDirectory(meta, 'acceptances'), hash(resultPath) + '.json');
  if (fs.existsSync(file) && JSON.stringify(JSON.parse(fs.readFileSync(file))) !== JSON.stringify(receipt)) throw Error('verdict already recorded; preserve it and use MDD correction procedure');
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  return receipt;
}
function acceptedMission(metaPath) {
  const context = validateMission(metaPath), { meta, state } = context;
  const deliveryAware = context.mission.delivery?.mode === 'pull-request';
  if (!(deliveryAware ? ['validating', 'completed'].includes(state.status) : state.status === 'completed') || state.currentPacket || !state.validation) throw Error('candidate return is not accepted mission completion');
  const result = path.resolve(path.dirname(context.statePath), state.validation.path);
  const receipt = records(meta, 'acceptances').find(row => row.result === result && row.scope === 'mission' && row.outcome === 'accepted');
  if (!receipt || hash(fs.readFileSync(result)) !== receipt.resultDigest || hash(fs.readFileSync(receipt.report)) !== receipt.reportDigest || evidenceDigest(readArtifact(result), result) !== receipt.evidence || contentDigest(context) !== receipt.content) throw Error('final independent acceptance is absent or stale');
  return { context, receipt };
}
export function authorizeAction(metaPath, action, authorityFile) {
  const context = validateMission(metaPath), { meta, state } = context;
  if (!authorityFile) throw Error('explicit scoped authority evidence is required');
  const authorityPath = fs.realpathSync(authorityFile), bytes = fs.readFileSync(authorityPath);
  if (!bytes.toString('utf8').trim()) throw Error('authority evidence is empty');
  const authority = { path: authorityPath, digest: hash(bytes) };
  let receipt;
  if (action === 'draft-delivery') {
    if (!context.qualified.earlyDrafts || context.mission.delivery?.mode !== 'pull-request' || !['executing', 'validating'].includes(state.status)) throw Error('draft authority requires a qualified open PR mission supporting early drafts');
    dependencyCheck(context);
    receipt = { authority, basis: deliveryBasis(context), mission: state.id, revision: state.mission.revision };
  } else if (action === 'delivery') {
    receipt = { authority, resultDigest: acceptedMission(metaPath).receipt.resultDigest, ...(context.mission.delivery ? { basis: deliveryBasis(context) } : {}) };
  } else if (action === 'stack-update') {
    requireAuthority(context, authorityFile);
    if (!context.mission.delivery?.parent || !['executing', 'validating'].includes(state.status)) throw Error('stack update requires an open dependent mission');
    receipt = { authority, mission: state.id, revision: state.mission.revision };
  } else if (action === 'no-mistakes') {
    if (!['executing', 'validating'].includes(state.status) || state.validation && readArtifact(path.resolve(path.dirname(context.statePath), state.validation.path)).outcome === 'accepted') throw Error('a modifying pipeline must run before final acceptance');
    requireAuthority(context, authorityFile);
    receipt = { authority, mission: state.id, revision: state.mission.revision };
  } else throw Error('only draft-delivery, delivery, stack-update or no-mistakes can be authorized');
  const file = action === 'draft-delivery' ? path.join(recordDirectory(meta, 'draft-deliveries'), `${hash(JSON.stringify(receipt))}.json`) : action === 'delivery' && context.mission.delivery ? path.join(recordDirectory(meta, 'deliveries'), `${hash(JSON.stringify(receipt))}.json`) : action === 'stack-update' ? path.join(recordDirectory(meta, 'stack-authorizations'), `${hash(JSON.stringify(receipt))}.json`) : path.join(meta.mdd_data, `${action}.json`);
  if (fs.existsSync(file)) {
    if (JSON.stringify(JSON.parse(fs.readFileSync(file))) !== JSON.stringify(receipt)) throw Error('authorization already recorded with different evidence; reconcile explicitly');
  } else fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  return receipt;
}
export function actionCheck(metaPath, action) {
  if (action === 'draft-delivery') {
    const context = validateMission(metaPath);
    dependencyCheck(context);
    const receipt = records(context.meta, 'draft-deliveries').find(row => row.basis === deliveryBasis(context) && row.mission === context.state.id && row.revision === context.state.mission.revision);
    if (!['executing', 'validating'].includes(context.state.status) || !receipt || hash(fs.readFileSync(receipt.authority.path)) !== receipt.authority.digest) throw Error('draft authorization is absent or stale');
    return receipt;
  }
  if (action === 'delivery') return deliveryCheck(metaPath);
  if (action === 'stack-update') return stackAuthority(validateMission(metaPath));
  if (action !== 'no-mistakes') throw Error('unknown managed action');
  const context = validateMission(metaPath), { meta, state } = context;
  const receipt = JSON.parse(fs.readFileSync(path.join(meta.mdd_data, 'no-mistakes.json')));
  if (receipt.mission !== state.id || receipt.revision !== state.mission.revision || requireAuthority(context, receipt.authority.path).digest !== receipt.authority.digest) throw Error('applicable No-Mistakes authorization is absent or changed');
  if (!['executing', 'validating'].includes(state.status) || state.validation && readArtifact(path.resolve(path.dirname(context.statePath), state.validation.path)).outcome === 'accepted') throw Error('a modifying pipeline must run before final acceptance');
  return receipt;
}
export function deliveryCheck(metaPath) {
  const { context, receipt } = acceptedMission(metaPath);
  dependencyCheck(context);
  const delivery = context.mission.delivery ? records(context.meta, 'deliveries').find(row => row.resultDigest === receipt.resultDigest && row.basis === deliveryBasis(context)) : JSON.parse(fs.readFileSync(path.join(context.meta.mdd_data, 'delivery.json')));
  if (!delivery) throw Error('delivery authorization is absent or stale');
  if (delivery.resultDigest !== receipt.resultDigest || hash(fs.readFileSync(delivery.authority.path)) !== delivery.authority.digest) throw Error('applicable delivery authorization is absent or changed');
  const gitState = spawnSync('git', ['-C', context.meta.worktree, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' });
  if (gitState.status !== 0 || gitState.stdout.trim()) throw Error('delivery requires the accepted work and mission records to be committed; uncommitted changes remain');
  if (context.qualified.portableEvidence === true) portableCheck(context);
  return receipt;
}

function portableCheck(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-mdd-export-'));
  try {
    const head = git(context, ['rev-parse', 'HEAD']);
    const rows = git(context, ['ls-tree', '-rz', head]).split('\0').filter(Boolean);
    const links = [];
    for (const row of rows) {
      const tab = row.indexOf('\t'), [mode, type, oid] = row.slice(0, tab).split(' ');
      if (type !== 'blob') throw Error('portable delivery requires explicit handling of submodules');
      const file = path.resolve(root, row.slice(tab + 1));
      if (path.relative(root, file) === '..' || path.relative(root, file).startsWith('..' + path.sep) || path.isAbsolute(path.relative(root, file))) throw Error('unsafe export path');
      if (mode === '120000') { links.push([file, oid]); continue; }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const fd = fs.openSync(file, 'wx', 0o600);
      try {
        const result = spawnSync('git', ['-C', context.meta.worktree, 'cat-file', 'blob', oid], { stdio: ['ignore', fd, 'pipe'] });
        if (result.status !== 0) throw Error('cannot export committed evidence');
      } finally { fs.closeSync(fd); }
    }
    for (const [file, oid] of links) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const link = spawnSync('git', ['-C', context.meta.worktree, 'cat-file', 'blob', oid], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
      if (link.status !== 0) throw Error('cannot export committed symlink');
      fs.symlinkSync(link.stdout, file);
    }
    validateArtifact(context.bundle, path.resolve(root, path.relative(context.meta.worktree, context.statePath)), undefined, root);
    if (git(context, ['rev-parse', 'HEAD']) !== head) throw Error('head changed during portable validation');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

function git(context, args) {
  const run = spawnSync('git', ['-C', context.meta.worktree, ...args], { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  if (run.status !== 0) throw Error(`Git operation failed: ${args[0]}: ${run.stderr || run.error?.message}`);
  return run.stdout.trimEnd();
}
function githubPr(url) {
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/[1-9][0-9]*$/.test(url)) throw Error('stack delivery is qualified only for github.com PRs');
  const run = spawnSync('gh', ['pr', 'view', url, '--json', 'url,state,headRefOid,headRefName,baseRefName,mergeCommit,headRepository'], { encoding: 'utf8', timeout: 15000 });
  let pr;
  try { pr = JSON.parse(run.stdout); } catch { throw Error('cannot read live dependency or PR identity'); }
  if (run.status !== 0 || pr.url !== url || !/^[a-f0-9]{40}$/.test(pr.headRefOid) || !['OPEN', 'MERGED', 'CLOSED'].includes(pr.state)) throw Error('cannot verify live dependency or PR identity');
  return pr;
}
function githubRepository(value) {
  const url = new URL(value.replace(/^git@github\.com:/, 'https://github.com/'));
  if (!['https:', 'ssh:'].includes(url.protocol) || url.hostname !== 'github.com' || url.search || url.hash || !/^\/[\w.-]+\/[\w.-]+(?:\.git)?$/.test(url.pathname)) throw Error('unsupported GitHub repository identity');
  return `https://github.com${url.pathname.replace(/\.git$/, '')}`.toLowerCase();
}
function requireRepository(context, pr, writing = false) {
  const source = githubRepository(git(context, ['remote', 'get-url', 'origin']));
  const head = pr.headRepository;
  if (!head?.id || githubRepository(`https://github.com/${head.nameWithOwner}`) !== source || githubRepository(pr.url.split('/pull/')[0]) !== source) throw Error('PR repository identity disagrees with the task repository');
  if (writing) {
    const urls = git(context, ['remote', 'get-url', '--push', '--all', 'origin']).split('\n');
    if (!urls.length || urls.some(url => githubRepository(url) !== source)) throw Error('effective push repository differs from the authorized repository');
  }
  return source;
}
function deliveryBase(context) {
  const d = context.mission.delivery;
  return context.state.deliveryBase ?? { commit: d.parent?.head ?? d.baseCommit, target: d.parent?.branch ?? d.target, ...(d.parent ? { parentHead: d.parent.head } : {}) };
}
function dependencyCheck(context, lineage = new Set()) {
  const d = context.mission.delivery;
  if (!d) return;
  if (fs.existsSync(path.join(context.meta.mdd_data, 'stack-update-pending.json'))) throw Error('stack reconciliation is pending; resume it before delivery or dispatch');
  if ((context.meta.mode === 'local-only') !== (d.mode === 'local-only')) throw Error('mission and task delivery modes disagree');
  if (!d.parent) return;
  const pr = githubPr(d.parent.pr), base = deliveryBase(context);
  if (pr.headRefName !== d.parent.branch || pr.headRefOid !== base.parentHead || pr.state === 'CLOSED' ||
      (pr.state === 'OPEN' && base.target !== d.parent.branch) ||
      (pr.state === 'MERGED' && (base.target !== d.target || pr.baseRefName !== d.target))) throw Error('parent changed or integrated; reconcile the delivery dependency first');
  if (pr.state === 'OPEN') {
    if (lineage.has(context.statePath)) throw Error('cyclic delivery dependency');
    lineage.add(context.statePath);
    const stateDir = path.dirname(context.metaFile);
    const file = fs.readdirSync(stateDir).filter(name => name.endsWith('.meta')).map(name => path.join(stateDir, name)).find(file => {
      const text = fs.readFileSync(file, 'utf8');
      return /^mdd_state=/m.test(text) && readMeta(file).pr === d.parent.pr;
    });
    if (!file) throw Error('open dependency requires a tracked independently accepted parent mission');
    const { context: parent } = acceptedMission(file);
    const declared = d.parent.mission;
    if (parent.state.id !== declared.id || parent.state.mission.revision !== declared.revision ||
        hash(fs.readFileSync(parent.missionPath)) !== hash(fs.readFileSync(path.resolve(path.dirname(context.missionPath), declared.path))) ||
        git(parent, ['rev-parse', 'HEAD']) !== pr.headRefOid) throw Error('tracked parent acceptance does not cover the declared dependency');
    dependencyCheck(parent, lineage);
  }
}
function deliveryBasis(context) {
  return hash(JSON.stringify({ head: git(context, ['rev-parse', 'HEAD']), base: deliveryBase(context) }));
}
export function publicationCheck(metaPath, url, merging = false) {
  const context = validateMission(metaPath);
  if (!context.mission.delivery) return;
  if (context.meta.pr && context.meta.pr !== url) throw Error('canonical PR identity cannot be replaced implicitly');
  deliveryCheck(metaPath);
  const pr = githubPr(url), base = deliveryBase(context);
  requireRepository(context, pr);
  if (pr.headRefOid !== git(context, ['rev-parse', 'HEAD']) || pr.headRefName !== context.meta.branch || pr.baseRefName !== base.target) throw Error('PR head, branch or target disagrees with accepted delivery');
  if (merging && base.target !== context.mission.delivery.target) throw Error('dependent PR cannot merge into an intermediate parent branch');
  return pr;
}
function recordSnapshot(context, file) {
  const stat = fs.lstatSync(file), actual = fs.realpathSync(file);
  const owned = [context.meta.worktree, context.meta.mdd_data].some(root => {
    const relative = path.relative(fs.realpathSync(root), actual);
    return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
  });
  if (!stat.isFile() || stat.nlink !== 1 || !owned) throw Error('state and journal must be single-link files in the owned worktree or task data');
  return { dev: stat.dev, ino: stat.ino, bytes: fs.readFileSync(file) };
}
function temporaryBytes(file, bytes) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 });
  return temporary;
}
function saveState(context, changes, reason, evidence) {
  const portable = context.qualified.portableEvidence === true;
  const relativeRef = (ref, owner) => ({ ...ref, path: path.relative(path.dirname(owner), path.resolve(path.dirname(context.statePath), ref.path)) });
  if (portable && changes.integration) changes = { ...changes, integration: { ...changes.integration, evidence: changes.integration.evidence.map(ref => relativeRef(ref, context.statePath)) } };
  const state = { ...context.state, ...changes, revision: context.state.revision + 1, lastSequence: context.state.lastSequence + 1 };
  const journal = path.resolve(path.dirname(context.statePath), state.history);
  const priorState = recordSnapshot(context, context.statePath), priorJournal = recordSnapshot(context, journal);
  if (JSON.stringify(JSON.parse(priorState.bytes)) !== JSON.stringify(context.state)) throw Error('mission state changed before update');
  const eventMission = { ...state.mission, path: portable ? relativeRef({ path: context.missionPath }, journal).path : context.missionPath };
  const eventEvidence = portable ? evidence.map(ref => relativeRef(ref, journal)) : evidence;
  const event = { schemaVersion: 1, kind: 'event', sequence: state.lastSequence, stateRevision: state.revision, at: new Date().toISOString(), actor: 'firstmate:delivery', mission: eventMission, status: state.status, interruption: state.interruption, reason, evidence: eventEvidence };
  const separator = priorJournal.bytes.toString('utf8').endsWith('\n') ? '' : '\n';
  const nextJournalBytes = Buffer.concat([priorJournal.bytes, Buffer.from(separator + JSON.stringify(event) + '\n')]);
  const candidate = temporaryBytes(path.join(context.meta.mdd_data, 'state-candidate'), JSON.stringify({ state, journal: nextJournalBytes.toString('utf8') }));
  let nextState, nextJournal, backup, journalPublished = false, preserveBackup = false;
  try {
    validateArtifact(context.bundle, context.statePath, candidate);
    nextState = temporaryBytes(context.statePath, JSON.stringify(state, null, 2) + '\n');
    nextJournal = temporaryBytes(journal, nextJournalBytes);
    backup = temporaryBytes(journal, priorJournal.bytes);
    for (const [file, previous] of [[context.statePath, priorState], [journal, priorJournal]]) {
      const current = recordSnapshot(context, file);
      if (current.dev !== previous.dev || current.ino !== previous.ino || !current.bytes.equals(previous.bytes)) throw Error('active state or journal changed during candidate validation');
    }
    fs.renameSync(nextJournal, journal);
    journalPublished = true;
    fs.renameSync(nextState, context.statePath);
  } catch (error) {
    if (journalPublished) {
      try { fs.renameSync(backup, journal); }
      catch (rollbackError) {
        preserveBackup = true;
        throw new AggregateError([error, rollbackError], `state publication and journal restoration failed; preserve ${backup} for explicit MDD recovery`);
      }
    }
    throw error;
  } finally {
    for (const file of [candidate, nextState, nextJournal, preserveBackup ? undefined : backup]) if (file) fs.rmSync(file, { force: true });
  }
}
function atomicRecord(file, value) {
  const temporary = temporaryBytes(file, JSON.stringify(value, null, 2) + '\n');
  try { fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
}
function stackAuthority(context) {
  const receipt = records(context.meta, 'stack-authorizations').find(row => row.mission === context.state.id && row.revision === context.state.mission.revision && context.state.evidence.some(ref => evidencePath(context, ref) === row.authority.path) && hash(fs.readFileSync(row.authority.path)) === row.authority.digest);
  if (!context.mission.delivery?.parent || !['executing', 'validating'].includes(context.state.status) || !receipt) throw Error('scoped stack update authority is absent, changed or outside an open mission');
  return receipt;
}
function requireParentIntegration(context, parent, targetCommit) {
  if (parent.state !== 'MERGED') return;
  const merge = parent.mergeCommit?.oid;
  if (!/^[a-f0-9]{40}$/.test(merge ?? '') || spawnSync('git', ['-C', context.meta.worktree, 'merge-base', '--is-ancestor', merge, targetCommit]).status !== 0) throw Error('parent integration is absent from the fetched target');
}
export function reconcileDelivery(metaPath) {
  const context = validateMission(metaPath), { meta, state, mission } = context;
  const parent = mission.delivery?.parent;
  if (!parent || !['executing', 'validating'].includes(state.status) || state.currentPacket) throw Error('reconciliation requires an open dependent mission without an active packet');
  const authorization = stackAuthority(context);
  if (git(context, ['branch', '--show-current']) !== meta.branch) throw Error('worktree HEAD must be attached to the task branch');
  if (git(context, ['status', '--porcelain', '--untracked-files=all'])) throw Error('reconciliation requires committed work; preserve local changes first');
  const ownUrl = meta.pr;
  const own = githubPr(ownUrl), liveParent = githubPr(parent.pr);
  if (own.state !== 'OPEN' || own.headRefName !== meta.branch || liveParent.headRefName !== parent.branch || liveParent.state === 'CLOSED' || ownUrl.split('/pull/')[0] !== parent.pr.split('/pull/')[0]) throw Error('stack PR identities or lifecycle disagree');
  const repository = requireRepository(context, own, true);
  requireRepository(context, liveParent);
  const pendingPath = path.join(meta.mdd_data, 'stack-update-pending.json');
  let pending = fs.existsSync(pendingPath) ? JSON.parse(fs.readFileSync(pendingPath)) : null;
  const allowedTargets = !pending ? [deliveryBase(context).target] : pending.phase === 'pushed' ? [pending.oldTarget, pending.target] : [pending.phase === 'verified' ? pending.target : pending.oldTarget];
  if (!allowedTargets.includes(own.baseRefName)) throw Error('child PR target diverged; explicit reconciliation is required');
  if (!pending) {
    if (own.headRefOid !== git(context, ['rev-parse', 'HEAD'])) throw Error('child remote head diverged from the local worktree');
    const base = deliveryBase(context);
    if (base.parentHead === liveParent.headRefOid && ((liveParent.state === 'OPEN' && base.target === parent.branch) || (liveParent.state === 'MERGED' && base.target === mission.delivery.target))) return { unchanged: true };
    const target = liveParent.state === 'MERGED' ? mission.delivery.target : parent.branch;
    if (liveParent.state === 'MERGED' && liveParent.baseRefName !== target) throw Error('parent integrated into an unexpected target');
    git(context, ['check-ref-format', '--branch', target]);
    git(context, ['fetch', '--no-tags', 'origin', `refs/heads/${target}`]);
    const onto = git(context, ['rev-parse', 'FETCH_HEAD']);
    if (liveParent.state === 'OPEN' && onto !== liveParent.headRefOid) throw Error('parent moved during fetch');
    requireParentIntegration(context, liveParent, onto);
    pending = { id: crypto.randomUUID(), repository, pr: ownUrl, branch: meta.branch, headRepository: own.headRepository.id, mission: state.id, revision: state.mission.revision, authority: authorization.authority, oldHead: own.headRefOid, oldTarget: own.baseRefName, oldBase: base.parentHead, parentHead: liveParent.headRefOid, parentState: liveParent.state, parentMerge: liveParent.mergeCommit?.oid ?? null, onto, target, phase: 'prepared' };
    atomicRecord(pendingPath, pending);
  }
  if (pending.repository !== repository || pending.pr !== ownUrl || pending.branch !== meta.branch || pending.headRepository !== own.headRepository.id || pending.mission !== state.id || pending.revision !== state.mission.revision || pending.authority.digest !== authorization.authority.digest || pending.parentHead !== liveParent.headRefOid || pending.parentState !== liveParent.state || pending.parentMerge !== (liveParent.mergeCommit?.oid ?? null)) throw Error('pending stack update no longer matches; reconcile retained evidence explicitly');
  if (liveParent.state === 'MERGED') {
    git(context, ['fetch', '--no-tags', 'origin', `refs/heads/${pending.target}`]);
    requireParentIntegration(context, liveParent, 'FETCH_HEAD');
    if (spawnSync('git', ['-C', meta.worktree, 'merge-base', '--is-ancestor', pending.onto, 'FETCH_HEAD']).status !== 0) throw Error('integration target diverged during reconciliation');
  }
  if (pending.phase === 'prepared') {
    if (git(context, ['rev-parse', 'HEAD']) !== pending.oldHead) throw Error('interrupted rebase or unexpected local head; preserve and reconcile explicitly');
    git(context, ['rebase', '--onto', pending.onto, pending.oldBase]);
    pending.newHead = git(context, ['rev-parse', 'HEAD']); pending.phase = 'rebased'; atomicRecord(pendingPath, pending);
  }
  if (git(context, ['rev-parse', 'HEAD']) !== pending.newHead) throw Error('local head changed during stack reconciliation');
  if (pending.phase === 'rebased') {
    const base = { commit: pending.onto, target: pending.target, parentHead: pending.parentHead };
    saveState(context, { deliveryBase: base }, 'Updated local delivery base; remote reconciliation remains pending.', [{ kind: 'evidence', path: authorization.authority.path }]);
    git(context, ['add', '--', context.statePath, path.resolve(path.dirname(context.statePath), state.history)]);
    git(context, ['commit', '-m', 'Record reconciled mission delivery base']);
    pending.newHead = git(context, ['rev-parse', 'HEAD']); pending.phase = 'recorded'; atomicRecord(pendingPath, pending);
  }
  if (pending.phase === 'recorded') {
    requireRepository(context, githubPr(ownUrl), true);
    if (own.headRefOid !== pending.oldHead && own.headRefOid !== pending.newHead) throw Error('remote child moved; refusing to overwrite it');
    if (own.headRefOid !== pending.newHead) git(context, ['push', `--force-with-lease=refs/heads/${meta.branch}:${pending.oldHead}`, 'origin', `${pending.newHead}:refs/heads/${meta.branch}`]);
    pending.phase = 'pushed'; atomicRecord(pendingPath, pending);
  }
  if (pending.phase === 'pushed') {
    const remote = githubPr(ownUrl);
    requireRepository(context, remote);
    if (![pending.oldTarget, pending.target].includes(remote.baseRefName)) throw Error('child PR target diverged during reconciliation');
    if (remote.headRefOid !== pending.newHead || githubPr(parent.pr).headRefOid !== pending.parentHead) throw Error('stack moved before retarget; reconcile explicitly');
    if (remote.baseRefName !== pending.target) {
      const run = spawnSync('gh', ['pr', 'edit', ownUrl, '--base', pending.target], { encoding: 'utf8', timeout: 15000 });
      if (run.status !== 0) throw Error('PR retarget failed; retained update can be resumed');
    }
    const verified = githubPr(ownUrl);
    if (verified.headRefOid !== pending.newHead || verified.baseRefName !== pending.target) throw Error('PR retarget could not be verified');
    pending.phase = 'verified'; atomicRecord(pendingPath, pending);
  }
  const receipt = path.join(recordDirectory(meta, 'transports'), `${pending.id}.json`);
  atomicRecord(receipt, pending);
  fs.unlinkSync(pendingPath);
  return pending;
}

export function closeMission(metaPath) {
  const context = validateMission(metaPath), { meta, state, mission } = context;
  if (!mission.delivery || mission.delivery.mode !== 'pull-request') throw Error('managed closure requires a delivery-aware PR mission');
  if (state.status === 'completed') {
    const { receipt } = acceptedMission(metaPath);
    if (!fs.existsSync(path.join(meta.mdd_data, 'mdd-closure/manifest.json'))) {
      const pr = githubPr(meta.pr);
      if (pr.state !== 'MERGED' || pr.headRefOid !== state.integration?.head || pr.headRefOid !== git(context, ['rev-parse', 'HEAD']) || pr.baseRefName !== mission.delivery.target) throw Error('cannot reconstruct closure archive for an unverified integration');
      archiveClosure(context, receipt);
    }
    verifyClosure(context);
    return state;
  }
  const { receipt } = acceptedMission(metaPath);
  if (contentDigest(context) !== receipt.content) throw Error('acceptance is stale');
  const pr = publicationCheck(metaPath, meta.pr, true);
  if (pr.state !== 'MERGED' || !/^[a-f0-9]{40}$/.test(pr.mergeCommit?.oid)) throw Error('PR must be merged with a verified integration commit before closure');
  git(context, ['fetch', '--no-tags', 'origin', `refs/heads/${mission.delivery.target}`]);
  if (spawnSync('git', ['-C', meta.worktree, 'merge-base', '--is-ancestor', pr.mergeCommit.oid, 'FETCH_HEAD']).status !== 0) throw Error('merge commit is not integrated into the final target');
  const proof = path.join(meta.mdd_data, 'integration.json');
  atomicRecord(proof, { pr, source: git(context, ['rev-parse', 'HEAD']), target: mission.delivery.target });
  saveState(context, { status: 'completed', integration: { head: pr.headRefOid, target: mission.delivery.target, evidence: [{ kind: 'evidence', path: proof }] } }, 'Verified integration into the approved final target.', [{ kind: 'evidence', path: proof }]);
  archiveClosure(validateMission(metaPath), receipt);
  return validateMission(metaPath).state;
}
function archiveClosure(context, receipt) {
  const root = path.join(context.meta.mdd_data, 'mdd-closure');
  fs.mkdirSync(path.join(root, 'files'), { recursive: true, mode: 0o700 });
  const seen = new Set(), entries = [];
  function retain(file, expected) {
    file = fs.realpathSync(file);
    if (seen.has(file)) {
      if (expected && entries.find(row => row.path === file).digest !== expected) throw Error('archive evidence disagrees with its owner');
      return;
    }
    seen.add(file);
    const bytes = fs.readFileSync(file), digest = hash(bytes);
    if (expected && digest !== expected) throw Error('evidence changed during archival');
    fs.writeFileSync(path.join(root, 'files', digest), bytes, { mode: 0o600 });
    entries.push({ path: file, digest });
    let value;
    try { value = file.endsWith('.jsonl') ? bytes.toString().trim().split('\n').map(line => JSON.parse(line)) : readArtifact(file); } catch { return; }
    function visit(row) {
      if (!row || typeof row !== 'object') return;
      if (row.authority?.path) retain(row.authority.path);
      if (row.reportTarget && fs.existsSync(row.reportTarget)) retain(row.reportTarget);
      for (const key of ['report', 'brief']) if (typeof row[key] === 'string') retain(row[key]);
      if (row.kind && row.path && typeof row.path === 'string') retain(path.resolve(path.dirname(file), row.path));
      else for (const item of Object.values(row)) visit(item);
    }
    visit(value);
  }
  retain(context.statePath);
  const history = path.resolve(path.dirname(context.statePath), context.state.history);
  retain(history);
  for (const name of ['mdd-bundle.json', 'integration.json']) if (fs.existsSync(path.join(context.meta.mdd_data, name))) retain(path.join(context.meta.mdd_data, name));
  for (const name of ['assignments', 'executions', 'candidates', 'acceptances', 'deliveries', 'draft-deliveries', 'stack-authorizations', 'transports']) {
    const dir = path.join(context.meta.mdd_data, name);
    if (fs.existsSync(dir)) for (const file of fs.readdirSync(dir)) if (fs.statSync(path.join(dir, file)).isFile()) {
      const record = path.join(dir, file);
      retain(record);
      if (name === 'acceptances') retain(JSON.parse(fs.readFileSync(record, 'utf8')).result);
    }
  }
  if (context.meta.demonstration) {
    const output = spawnSync(process.execPath, [fileURLToPath(new URL('./fm-demonstration-lib.mjs', import.meta.url)), 'archive-files', context.metaFile], { encoding: 'utf8', timeout: 30000, env: { ...process.env, FM_HOME: process.env.FM_HOME || path.dirname(path.dirname(context.metaFile)) } });
    if (output.status !== 0) throw Error(`demonstration evidence cannot be archived: ${output.stderr || output.error?.message}`);
    const references = JSON.parse(output.stdout);
    if (!Array.isArray(references) || !references.some(ref => ref.path === context.meta.demonstration)) throw Error('demonstration owner returned an incomplete archive');
    for (const ref of references) retain(ref.path, ref.digest);
  }
  atomicRecord(path.join(root, 'manifest.json'), { stateDigest: hash(fs.readFileSync(context.statePath)), content: receipt.content, head: git(context, ['rev-parse', 'HEAD']), administrative: [context.statePath, history], files: entries });
}
export function teardownCheck(metaPath, discard = false) {
  const ownMeta = readMeta(metaPath);
  for (const name of fs.readdirSync(path.dirname(metaPath)).filter(name => name.endsWith('.meta'))) {
    const file = path.join(path.dirname(metaPath), name);
    if (path.resolve(file) === path.resolve(metaPath)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (!/^mdd_state=/m.test(text)) continue;
    const child = readMeta(file);
    if (taskBundle(child).qualified.version === 'v0.4-experimental') continue;
    const stateFile = path.resolve(child.worktree, child.mdd_state);
    const childState = readArtifact(stateFile), contractFile = path.resolve(path.dirname(stateFile), childState.mission.path);
    const delivery = readArtifact(contractFile).delivery;
    if (delivery?.parent?.pr === ownMeta.pr && childState.status !== 'completed' && (childState.deliveryBase?.target ?? delivery.parent.branch) === delivery.parent.branch) throw Error('dependent task still needs this parent branch; reconcile it before teardown');
  }
  if (taskBundle(ownMeta).qualified.version === 'v0.4-experimental') return null;
  const stateFile = path.resolve(ownMeta.worktree, ownMeta.mdd_state), state = readArtifact(stateFile);
  if (!readArtifact(path.resolve(path.dirname(stateFile), state.mission.path)).delivery) return null;
  const context = validateMission(metaPath);
  if (!context.mission.delivery || context.mission.delivery.mode !== 'pull-request') return null;
  if (context.state.status !== 'completed') {
    if (!discard || !['cancelled', 'failed', 'superseded'].includes(context.state.status)) throw Error('mission is not closed; retain its worktree');
    archiveClosure(context, { content: contentDigest(context) });
    return verifyClosure(context, true);
  }
  return verifyClosure(context);
}
function verifyClosure(context, discard = false) {
  const root = path.join(context.meta.mdd_data, 'mdd-closure'), manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  if (hash(fs.readFileSync(context.statePath)) !== manifest.stateDigest || contentDigest(context) !== manifest.content || git(context, ['rev-parse', 'HEAD']) !== manifest.head) throw Error('closure archive or reviewed content changed; retain the worktree');
  for (const entry of manifest.files) if (hash(fs.readFileSync(path.join(root, 'files', entry.digest))) !== entry.digest || hash(fs.readFileSync(entry.path)) !== entry.digest) throw Error('closure archive or evidence changed; retain the worktree');
  const dirty = git(context, ['status', '--porcelain', '--untracked-files=all']);
  const administrative = new Set(manifest.administrative.map(file => path.relative(context.meta.worktree, file)));
  for (const row of dirty.split('\n').filter(Boolean)) if (!discard && !administrative.has(row.slice(3))) throw Error('unreviewed work remains; retain the worktree');
  return '';
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [command, ...args] = process.argv.slice(2);
    if (command === 'pin' && [2, 3].includes(args.length)) console.log(JSON.stringify(pinBundle(...args)));
    else if (command === 'bind-execution' && args.length === 1) console.log(JSON.stringify(bindExecution(args[0])));
    else if (command === 'candidate' && args.length === 3) console.log(JSON.stringify(recordCandidate(args[0], args[1], args[2] === '--complete')));
    else if (command === 'accept' && args.length === 2) console.log(JSON.stringify(acceptResult(...args)));
    else if (command === 'authorize' && args.length === 3) console.log(JSON.stringify(authorizeAction(...args)));
    else if (command === 'action-check' && args.length === 2) console.log(JSON.stringify(actionCheck(...args)));
    else if (command === 'close-mission' && args.length === 1) console.log(JSON.stringify(closeMission(args[0])));
    else if (command === 'teardown-check' && (args.length === 1 || (args.length === 2 && args[1] === '--discard'))) { const result = teardownCheck(args[0], args[1] === '--discard'); if (result === null) console.log('legacy'); }
    else if (command === 'reconcile-delivery' && args.length === 1) console.log(JSON.stringify(reconcileDelivery(args[0])));
    else if (command === 'publication-check' && [2, 3].includes(args.length)) console.log(JSON.stringify(publicationCheck(args[0], args[1], args[2] === '--merge')));
    else if (command === 'portable-check' && args.length === 1) portableCheck(validateMission(args[0]));
    else if (command === 'delivery-base' && args.length === 1) { const ctx = validateMission(args[0]); console.log(ctx.mission.delivery ? deliveryBase(ctx).commit : ''); }
    else if (command === 'delivery-target' && args.length === 1) { const ctx = validateMission(args[0]); console.log(ctx.mission.delivery ? deliveryBase(ctx).target : ''); }
    else if (command === 'draft-check' && args.length === 1) dependencyCheck(validateMission(args[0]));
    else if (command === 'delivery-check' && args.length === 1) console.log(JSON.stringify(deliveryCheck(args[0])));
    else if (command === 'assignment' && args.length === 5) console.log(JSON.stringify(prepareAssignment(...args)));
    else if (command === 'dispatch-check' && args.length === 1) console.log(JSON.stringify(dispatchCheck(args[0])));
    else if (command === 'validate' && args.length === 1) console.log(JSON.stringify(validateMission(args[0]).state));
    else throw Error('usage: fm-mdd-lib.mjs pin <external-skill> <task-data> | validate <task-meta>');
  } catch (error) { console.error(`error: ${error.message}`); process.exitCode = 1; }
}

// External MDD transport. The qualified bundle owns schemas and mission rules.
// Requires Node >=24. CLI operations below are internal to fm-spawn/control.
// pin <source> <task-data> [project] verifies the qualified file digest, excluding
// .git/node_modules, and snapshots the distribution. Mission/assignment/candidate
// operations call the frozen CLI; MDD alone owns state/history validation.
// authorize/action-check bind explicit coordinator attestations to existing
// evidence. They neither infer natural-language authority nor invoke a pipeline.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const qualified = Object.freeze({
  version: 'v0.4-experimental',
  source: '71a3d3570d5dd04992f16dfff617bb31090d7732',
  digest: 'c6790f60fec0d812c8f1fb2a6555547643a7cc717de352291b6d8c0626d8cdc7',
});
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
  if (bundleDigest(root) !== qualified.digest) throw Error('MDD distribution is unknown, incomplete or altered; a compatibility decision is required');
}
export function pinBundle(source, data, project) {
  if (project) {
    const local = ['.agents/skills', '.claude/skills', '.pi/skills'].map(dir => path.join(project, dir, 'mission-driven-dev')).filter(file => fs.existsSync(file));
    const identities = new Set(local.map(file => bundleDigest(file)));
    if (identities.size > 1) throw Error('ambiguous project MDD distributions; select one project version explicitly before preparation');
    if (local.length) source = local[0];
  }
  checkBundle(source);
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
export function validateArtifact(bundle, file) {
  const result = spawnSync(process.execPath, [path.join(bundle, 'scripts/validate.mjs'), file, '--json'], { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  let report;
  try { report = JSON.parse(result.stdout); } catch { throw Error(`MDD CLI returned unreadable JSON: ${result.error?.message ?? result.stderr}`); }
  if (result.status !== 0 || report.valid !== true || !Array.isArray(report.issues) || report.issues.length !== 0) throw Error(`MDD validation refused: ${JSON.stringify(report)}`);
}
export function validateMission(metaPath) {
  requireNode();
  const meta = readMeta(metaPath), bundle = path.join(meta.mdd_data, 'mdd-bundle');
  checkBundle(bundle);
  const manifest = JSON.parse(fs.readFileSync(path.join(meta.mdd_data, 'mdd-bundle.json'), 'utf8'));
  if (manifest.digest !== qualified.digest || manifest.source !== qualified.source) throw Error('mission bundle identity disagrees with qualified distribution');
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
  return { meta, bundle, state, statePath, missionPath };
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
  if (!['implementer', 'reviewer', 'final-reviewer'].includes(role)) throw Error('unknown MDD assignment role');
  const packet = packetIdentity(context);
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
    if (previous.role === role && JSON.stringify(previous.packet) === JSON.stringify(packet)) throw Error('packet is already assigned; resume its existing assignment instead');
  }
  const id = crypto.randomUUID(), dir = path.join(meta.mdd_data, 'assignments');
  fs.mkdirSync(dir, { recursive: true });
  const brief = path.join(dir, `${id}.md`), file = path.join(dir, `${id}.json`);
  const handoff = fs.readFileSync(briefFile, 'utf8');
  if (!handoff.trim()) throw Error('empty assignment handoff');
  const text = `${handoff}\n\n# MDD assignment\nRead ${context.bundle}/SKILL.md and ${context.bundle}/references/${role === 'implementer' ? 'execution' : 'validation'}.md. Mission state: ${context.statePath}. Contract: ${context.missionPath}. Packet: ${packet?.path ?? 'whole mission'}. Worktree: ${meta.worktree}. Role: ${role}. Authority evidence: ${authority.path}.\nSave your complete terminal report to ${meta.mdd_data}/report-${id}.md and return its path to FirstMate. Keep MDD contracts and results in the mission worktree. A work return is a candidate, never permission to publish, invoke No-Mistakes, accept your own work or close the mission. Follow only the current handoff.\n`;
  fs.writeFileSync(brief, text, { flag: 'wx' });
  const assignment = { id, role, mission: state.id, revision: state.mission.revision, packet, authority, brief, briefDigest: hash(text), missionDigest: hash(fs.readFileSync(context.missionPath)), worktree: fs.realpathSync(meta.worktree) };
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
function contentDigest(context, extraAdministrative = []) {
  const { meta, state, statePath } = context;
  const administrative = new Set([statePath, path.resolve(path.dirname(statePath), state.history), ...extraAdministrative]);
  for (const ref of [state.validation, ...state.attempts.map(attempt => attempt.result)]) {
    if (ref) administrative.add(path.resolve(path.dirname(statePath), ref.path));
  }
  const listing = spawnSync('git', ['-C', meta.worktree, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' });
  if (listing.status !== 0) throw Error('cannot enumerate reviewed working content');
  const entries = [...new Set(listing.stdout.split('\0').filter(Boolean))].sort();
  const evidence = [evidenceDigest(state, statePath), evidenceDigest(readArtifact(context.missionPath), context.missionPath)];
  for (const attempt of state.attempts) {
    const packet = path.resolve(path.dirname(statePath), attempt.packet.path);
    evidence.push(evidenceDigest(readArtifact(packet), packet));
  }
  return hash(evidence.join('\n') + '\n' + entries.filter(file => !administrative.has(path.resolve(meta.worktree, file))).map(file => {
    const full = path.join(meta.worktree, file);
    const stat = fs.lstatSync(full, { throwIfNoEntry: false });
    if (!stat) return `${file}\0deleted\n`;
    if (stat.isSymbolicLink()) return `${file}\0link:${fs.readlinkSync(full)}\n`;
    if (!stat.isFile()) throw Error(`review requires explicit handling of submodule or special path: ${file}`);
    return `${file}\0${stat.mode & 0o111}\0${hash(fs.readFileSync(full))}\n`;
  }).join(''));
}
function executionPath(meta, assignment) {
  if (!/^[A-Za-z0-9._-]+$/.test(meta.spawn_gen ?? '')) throw Error('no verified execution identity');
  return path.join(recordDirectory(meta, 'executions'), `${meta.spawn_gen}-${assignment.id}.json`);
}
export function bindExecution(metaPath) {
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
  if (state.status !== 'completed' || !state.validation) throw Error('candidate return is not accepted mission completion');
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
  if (action === 'delivery') {
    receipt = { authority, resultDigest: acceptedMission(metaPath).receipt.resultDigest };
  } else if (action === 'no-mistakes') {
    if (!['executing', 'validating'].includes(state.status) || records(meta, 'acceptances').some(row => row.scope === 'mission' && row.outcome === 'accepted')) throw Error('a modifying pipeline must run before final acceptance');
    requireAuthority(context, authorityFile);
    receipt = { authority, mission: state.id, revision: state.mission.revision };
  } else throw Error('only delivery or no-mistakes can be authorized');
  const file = path.join(meta.mdd_data, `${action}.json`);
  if (fs.existsSync(file)) {
    if (JSON.stringify(JSON.parse(fs.readFileSync(file))) !== JSON.stringify(receipt)) throw Error('authorization already recorded with different evidence; reconcile explicitly');
  } else fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  return receipt;
}
export function actionCheck(metaPath, action) {
  if (action === 'delivery') return deliveryCheck(metaPath);
  if (action !== 'no-mistakes') throw Error('unknown managed action');
  const context = validateMission(metaPath), { meta, state } = context;
  const receipt = JSON.parse(fs.readFileSync(path.join(meta.mdd_data, 'no-mistakes.json')));
  if (receipt.mission !== state.id || receipt.revision !== state.mission.revision || requireAuthority(context, receipt.authority.path).digest !== receipt.authority.digest) throw Error('applicable No-Mistakes authorization is absent or changed');
  if (!['executing', 'validating'].includes(state.status) || records(meta, 'acceptances').some(row => row.scope === 'mission' && row.outcome === 'accepted')) throw Error('a modifying pipeline must run before final acceptance');
  return receipt;
}
export function deliveryCheck(metaPath) {
  const { context, receipt } = acceptedMission(metaPath);
  const delivery = JSON.parse(fs.readFileSync(path.join(context.meta.mdd_data, 'delivery.json')));
  if (delivery.resultDigest !== receipt.resultDigest || hash(fs.readFileSync(delivery.authority.path)) !== delivery.authority.digest) throw Error('applicable delivery authorization is absent or changed');
  const gitState = spawnSync('git', ['-C', context.meta.worktree, 'status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' });
  if (gitState.status !== 0 || gitState.stdout.trim()) throw Error('delivery requires the accepted work and mission records to be committed; uncommitted changes remain');
  return receipt;
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
    else if (command === 'delivery-check' && args.length === 1) console.log(JSON.stringify(deliveryCheck(args[0])));
    else if (command === 'assignment' && args.length === 5) console.log(JSON.stringify(prepareAssignment(...args)));
    else if (command === 'dispatch-check' && args.length === 1) console.log(JSON.stringify(currentAssignment(args[0])));
    else if (command === 'validate' && args.length === 1) console.log(JSON.stringify(validateMission(args[0]).state));
    else throw Error('usage: fm-mdd-lib.mjs pin <external-skill> <task-data> | validate <task-meta>');
  } catch (error) { console.error(`error: ${error.message}`); process.exitCode = 1; }
}

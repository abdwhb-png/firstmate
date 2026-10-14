#!/usr/bin/env bash
# Public preparation boundary and qualification against the real external bundle.
set -eu
# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
TMP_ROOT=$(fm_test_tmproot fm-mdd)
mkdir -p "$TMP_ROOT"
trap 'rm -rf "$TMP_ROOT"' EXIT
fm_git_identity fmtest fmtest@example.invalid
BUNDLE=${FM_TEST_MDD_BUNDLE:-}
[ -n "$BUNDLE" ] || { echo 'skip: external MDD qualification bundle not supplied'; exit 0; }
node --input-type=module - "$ROOT" "$TMP_ROOT" "$BUNDLE" <<'JS'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [root, tmp, bundle] = process.argv.slice(2);
const mdd = await import(pathToFileURL(path.join(root, 'bin/fm-mdd-lib.mjs')));
const project = path.join(tmp, 'selection-project'), local = path.join(project, '.agents/skills/mission-driven-dev');
fs.mkdirSync(local, { recursive: true });
fs.writeFileSync(path.join(local, 'SKILL.md'), 'unqualified project version');
assert.throws(() => mdd.pinBundle(bundle, path.join(tmp, 'override'), project), /unknown|incomplete|altered/);
fs.rmSync(local, { recursive: true });
fs.cpSync(bundle, local, { recursive: true });
const identity = mdd.pinBundle('/missing-external-source', path.join(tmp, 'selected'), project);
assert.equal(identity.sourcePath, fs.realpathSync(local));
fs.rmSync(local, { recursive: true });
assert.equal(mdd.bundleDigest(path.join(tmp, 'selected/mdd-bundle')), identity.digest);
const fake = path.join(tmp, 'cli'); fs.mkdirSync(path.join(fake, 'scripts'), { recursive: true });
for (const script of ['console.log("broken json")', 'console.log(JSON.stringify({valid:true,issues:[]}));process.exit(1)', 'console.log(JSON.stringify({valid:true,issues:["hidden failure"]}))', 'throw Error("CLI fault")']) {
  fs.writeFileSync(path.join(fake, 'scripts/validate.mjs'), script);
  assert.throws(() => mdd.validateArtifact(fake, '/ignored'), /CLI|validation refused/);
}
console.log('ok - project bundle wins, unknown project version refuses and CLI failures remain explicit');
JS
mkdir -p "$TMP_ROOT/home/config" "$TMP_ROOT/project"
cp -R "$BUNDLE" "$TMP_ROOT/source-bundle"
printf 'manual\n' > "$TMP_ROOT/home/config/backlog-backend"
printf 'pi\n' > "$TMP_ROOT/home/config/crew-harness"
printf 'tmux\n' > "$TMP_ROOT/home/config/backend"
if out=$(FM_HOME="$TMP_ROOT/home" "$ROOT/bin/fm-spawn.sh" one=unused two=unused --prepare --mdd-state .missions/example/state.json --mdd-skill "$BUNDLE" --mode local-only --yolo off --backend nonexistent 2>&1); then fail 'preparation accepted a batch'; fi
assert_contains "$out" '--prepare requires one ship task and project' 'preparation reached batch dispatch before refusing'

git -C "$TMP_ROOT/project" init -q -b main
git -C "$TMP_ROOT/project" commit -qm init --allow-empty
printf 'unrelated\n' > "$TMP_ROOT/project/private.txt"
out=$(FM_HOME="$TMP_ROOT/home" "$ROOT/bin/fm-spawn.sh" mission "$TMP_ROOT/project" --prepare \
  --mdd-state .missions/example/state.json --mdd-skill "$TMP_ROOT/source-bundle" --mode local-only --yolo off 2>&1) || fail "preparation refused: $out"
meta="$TMP_ROOT/home/state/mission.meta"
printf 'changed upstream source\n' >> "$TMP_ROOT/source-bundle/SKILL.md"
rm -rf "$TMP_ROOT/source-bundle"
[ "$(sed -n 's/^harness=//p' "$meta")" = pi ] || fail 'preparation ignored configured crew harness'
wt=$(sed -n 's/^worktree=//p' "$meta")
[ -d "$wt" ] && [ "$wt" != "$TMP_ROOT/project" ] || fail "no isolated worktree"
[ "$(git -C "$wt" rev-parse HEAD)" = "$(git -C "$TMP_ROOT/project" rev-parse HEAD)" ] || fail "worktree came from wrong project"
[ "$(git -C "$wt" rev-parse --path-format=absolute --git-common-dir)" = "$TMP_ROOT/project/.git" ] || fail "worktree is not owned by requested project"
[ ! -e "$wt/private.txt" ] || fail "copied unrelated local changes"
[ -z "$(sed -n 's/^window=//p' "$meta")" ] || fail "prepared a runtime endpoint"
. "$ROOT/bin/fm-supervision-lib.sh"
fm_supervision_status "$TMP_ROOT/home/state"
[ "$FM_SUP_NEEDED" = false ] || fail "prepared-only mission requires agent supervision"
cp -R "$BUNDLE/assets/example/." "$wt/"
[ -f "$wt/.missions/example/state.json" ] || fail "cannot author uncommitted mission documents"
pass 'prepare retains one isolated mission worktree without launching or supervising an agent'
node --input-type=module - "$ROOT" "$meta" "$wt" "$TMP_ROOT" <<'JS'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [root, meta, wt, tmp] = process.argv.slice(2);
const mdd = await import(pathToFileURL(path.join(root, 'bin/fm-mdd-lib.mjs')));
const statePath = path.join(wt, '.missions/example/state.json');
const state = JSON.parse(fs.readFileSync(statePath));
state.status = 'ready'; state.executionMode = 'coordinated'; state.revision = 2; state.lastSequence = 2;
fs.writeFileSync(statePath, JSON.stringify(state));
const journal = path.join(wt, '.missions/example/history.jsonl');
const first = JSON.parse(fs.readFileSync(journal, 'utf8').trim());
fs.appendFileSync(journal, JSON.stringify({ ...first, sequence: 2, stateRevision: 2, status: 'ready' })+'\n');
assert.equal(mdd.validateMission(meta).state.status, 'ready');
const snapshot = path.join(tmp, 'home/data/mission/mdd-bundle');
fs.appendFileSync(path.join(snapshot, 'SKILL.md'), '\nchanged');
assert.throws(() => mdd.validateMission(meta), /altered/);
fs.copyFileSync(path.join(process.env.FM_TEST_MDD_BUNDLE, 'SKILL.md'), path.join(snapshot, 'SKILL.md'));
fs.appendFileSync(journal, JSON.stringify({ ...first, sequence: 3, stateRevision: 3, status: 'executing' })+'\n');
assert.throws(() => mdd.validateMission(meta), /history-state/);
console.log('ok - qualified real CLI rejects snapshot drift and torn state/history');
JS
node --input-type=module - "$ROOT" "$meta" "$wt" <<'JS'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const [root, meta, wt] = process.argv.slice(2);
const mdd = await import(pathToFileURL(path.join(root, 'bin/fm-mdd-lib.mjs')));
const statePath = path.join(wt, '.missions/example/state.json'), journal = path.join(wt, '.missions/example/history.jsonl');
let state = JSON.parse(fs.readFileSync(statePath));
const first = JSON.parse(fs.readFileSync(journal, 'utf8').split('\n')[0]);
const packetPath = path.join(wt, '.missions/example/packet-r1.md');
fs.writeFileSync(packetPath, fs.readFileSync(packetPath, 'utf8').replace('0'.repeat(40), execFileSync('git', ['-C', wt, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()));
state.status = 'executing'; state.revision = 3; state.lastSequence = 3;
state.currentPacket = { kind: 'packet', id: 'example-attempt-1', revision: 1, path: 'packet-r1.md' };
state.attempts = [{ packet: state.currentPacket, result: null }];
const authority = path.join(wt, '.missions/example/authority.md');
fs.writeFileSync(authority, 'Fixture mission delegation, coordinated mode, implementation and review, plus an explicit test No-Mistakes grant. No publication.');
const externalEvidence = path.join(path.dirname(meta), '../data/mission/external-proof.txt');
fs.writeFileSync(externalEvidence, 'Observed evidence outside the worktree.');
state.evidence = [{ kind: 'evidence', path: 'authority.md' }, { kind: 'evidence', path: externalEvidence }];
fs.writeFileSync(statePath, JSON.stringify(state));
const events = fs.readFileSync(journal, 'utf8').trim().split('\n').slice(0, 2);
events.push(JSON.stringify({ ...first, sequence: 3, stateRevision: 3, status: 'executing', evidence: state.evidence }));
fs.writeFileSync(journal, events.join('\n')+'\n');
const brief = path.join(wt, '.missions/example/handoff.md');
fs.writeFileSync(brief, '# Task\n## Captain\'s intent\nImplement this fixture packet.\n## Firstmate spec\nFollow MDD.');
const output = meta + '.next';
assert.throws(() => mdd.prepareAssignment(meta, 'implementer', brief, '', output), /authority/);
const packetOnBase = fs.readFileSync(packetPath, 'utf8');
const head = execFileSync('git', ['-C', wt, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const orphan = execFileSync('git', ['-C', wt, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit-tree', 'HEAD^{tree}', '-m', 'different history'], { encoding: 'utf8' }).trim();
fs.writeFileSync(packetPath, packetOnBase.replace(head, orphan));
assert.throws(() => mdd.prepareAssignment(meta, 'implementer', brief, authority, output), /base|worktree/);
fs.writeFileSync(packetPath, packetOnBase);
mdd.prepareAssignment(meta, 'implementer', brief, authority, output);
fs.renameSync(output, meta);
assert.equal(mdd.currentAssignment(meta).role, 'implementer');
const boundMeta = fs.readFileSync(meta, 'utf8');
fs.writeFileSync(meta, boundMeta.replace(/^mdd_brief=.*$/m, 'mdd_brief=/another-handoff'));
assert.throws(() => mdd.currentAssignment(meta), /disagree/);
fs.writeFileSync(meta, boundMeta);
const packetBefore = fs.readFileSync(packetPath);
fs.appendFileSync(packetPath, '\nchanged current packet body');
assert.throws(() => mdd.currentAssignment(meta), /disagree/);
fs.writeFileSync(packetPath, packetBefore);
assert.throws(() => mdd.actionCheck(meta, 'no-mistakes'), /ENOENT|authorization/);
mdd.authorizeAction(meta, 'no-mistakes', authority);
assert.equal(mdd.actionCheck(meta, 'no-mistakes').mission, 'example');
fs.appendFileSync(authority, ' Changed grant.');
assert.throws(() => mdd.actionCheck(meta, 'no-mistakes'), /changed/);
fs.writeFileSync(authority, 'Fixture mission delegation, coordinated mode, implementation and review, plus an explicit test No-Mistakes grant. No publication.');
assert.throws(() => mdd.prepareAssignment(meta, 'implementer', brief, authority, output), /already assigned/);
console.log('ok - coordinated assignment validates current mission, binds authority and rejects double assignment');
JS
# The control owner must accept a prepared task without a runtime endpoint.
authority="$wt/.missions/example/authority.md"
brief="$wt/.missions/example/handoff.md"
out=$(FM_HOME="$TMP_ROOT/home" "$ROOT/bin/fm-control.sh" mission assign --role reviewer --brief-file "$brief" --authority "$authority" 2>&1) || fail "review assignment refused: $out"
[ -f "$(sed -n 's/^mdd_brief=//p' "$meta")" ] || fail 'assigned brief missing'
out=$(FM_HOME="$TMP_ROOT/home" "$ROOT/bin/fm-control.sh" mission action-check --action no-mistakes 2>&1) || fail "managed action check refused: $out"
pass 'control assigns a fresh reviewer handoff and checks recorded action authority'
if bash -c '. "$1/bin/fm-classify-lib.sh"; . "$1/bin/fm-dod-lib.sh"; fm_dod_accept_ship_done ship local-only "$2" "$3" "done: candidate ready" "$4" mission "$5"' _ "$ROOT" "$wt" "$TMP_ROOT/project" "$TMP_ROOT/home/state" "$meta" > "$TMP_ROOT/done.out"; then
  fail 'packet return was accepted as completed delivery'
fi
pass 'packet return cannot become completed delivery'
node --input-type=module - "$ROOT" "$meta" "$wt" <<'JS'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const { execFileSync } = await import('node:child_process');
const [root, metaFile, wt] = process.argv.slice(2);
const mdd = await import(pathToFileURL(path.join(root, 'bin/fm-mdd-lib.mjs')));
let meta = mdd.readMeta(metaFile);
const implementationFile = fs.readdirSync(path.join(meta.mdd_data, 'assignments')).filter(n => n.endsWith('.json')).map(n => path.join(meta.mdd_data, 'assignments', n)).find(f => JSON.parse(fs.readFileSync(f)).role === 'implementer');
const implementation = JSON.parse(fs.readFileSync(implementationFile));
function publishMeta(m) { fs.writeFileSync(metaFile, Object.entries(m).map(([k,v]) => `${k}=${v}\n`).join('')); }
publishMeta({ ...meta, mdd_assignment: implementationFile, mdd_brief: implementation.brief, spawn_gen: 'impl-1', lifecycle: 'running' });
fs.symlinkSync('/nonexistent-fixture-original', path.join(wt, 'broken-link'));
mdd.bindExecution(metaFile);
const report = path.join(meta.mdd_data, 'implementation-report.md');
fs.writeFileSync(report, 'Complete fixture implementation report with focused evidence.');
assert.throws(() => mdd.recordCandidate(metaFile, report, false), /complete/);
mdd.recordCandidate(metaFile, report, true);
const resultPath = path.join(wt, '.missions/example/packet-result.json');
const result = { schemaVersion: 1, kind: 'result', id: 'accept-1', revision: 1, mission: { kind: 'mission', id: 'example', revision: 1, path: path.join(wt, 'docs/missions/example/r1.md') }, scope: 'packet', packet: { kind: 'packet', id: 'example-attempt-1', revision: 1, path: path.join(wt, '.missions/example/packet-r1.md') }, actor: 'mission:impl-1', implementers: ['mission:impl-1'], freshContext: false, outcome: 'accepted', summary: 'Examined fixture diff and complete evidence.', evidence: [{ kind: 'evidence', path: report }] };
fs.writeFileSync(resultPath, JSON.stringify(result));
assert.throws(() => mdd.acceptResult(metaFile, resultPath), /independen|implementer/);
result.actor = 'firstmate:fixture';
const assignedPacketPath = result.packet.path, otherPacket = path.join(meta.mdd_data, 'other-packet.md');
fs.writeFileSync(otherPacket, fs.readFileSync(assignedPacketPath, 'utf8').replace('../../docs/missions/example/r1.md', path.join(wt, 'docs/missions/example/r1.md')));
result.packet.path = otherPacket; fs.writeFileSync(resultPath, JSON.stringify(result));
mdd.validateArtifact(path.join(meta.mdd_data, 'mdd-bundle'), resultPath);
assert.throws(() => mdd.acceptResult(metaFile, resultPath), /reference/);
result.packet.path = assignedPacketPath; fs.writeFileSync(resultPath, JSON.stringify(result));
mdd.acceptResult(metaFile, resultPath);
fs.unlinkSync(path.join(wt, 'broken-link')); fs.symlinkSync('/nonexistent-fixture-changed', path.join(wt, 'broken-link'));
assert.throws(() => mdd.acceptResult(metaFile, resultPath), /changed/);
fs.unlinkSync(path.join(wt, 'broken-link')); fs.symlinkSync('/nonexistent-fixture-original', path.join(wt, 'broken-link'));
const externalEvidence = path.join(meta.mdd_data, 'external-proof.txt');
fs.appendFileSync(externalEvidence, ' altered');
assert.throws(() => mdd.acceptResult(metaFile, resultPath), /changed/);
fs.writeFileSync(externalEvidence, 'Observed evidence outside the worktree.');
fs.writeFileSync(path.join(wt, 'changed.txt'), 'relevant post-review change');
assert.throws(() => mdd.acceptResult(metaFile, resultPath), /changed/);
fs.unlinkSync(path.join(wt, 'changed.txt'));
const statePath = path.join(wt, '.missions/example/state.json');
const journal = path.join(wt, '.missions/example/history.jsonl');
let state = JSON.parse(fs.readFileSync(statePath));
function saveState() {
  state.revision++; state.lastSequence++;
  fs.writeFileSync(statePath, JSON.stringify(state));
  const previous = JSON.parse(fs.readFileSync(journal, 'utf8').trim().split('\n').at(-1));
  fs.appendFileSync(journal, JSON.stringify({ ...previous, sequence: state.lastSequence, stateRevision: state.revision, status: state.status })+'\n');
}
state.attempts[0].result = { kind: 'result', id: result.id, revision: result.revision, path: resultPath };
const nextPacket = path.join(wt, '.missions/example/packet-2.md');
fs.writeFileSync(nextPacket, fs.readFileSync(path.join(wt, '.missions/example/packet-r1.md'), 'utf8').replaceAll('example-attempt-1', 'example-attempt-2'));
state.currentPacket = { kind: 'packet', id: 'example-attempt-2', revision: 1, path: 'packet-2.md' };
state.attempts.push({ packet: state.currentPacket, result: null }); saveState();
mdd.prepareAssignment(metaFile, 'implementer', path.join(wt, '.missions/example/handoff.md'), path.join(wt, '.missions/example/authority.md'), metaFile+'.next');
fs.renameSync(metaFile+'.next', metaFile);
assert.equal(mdd.bindExecution(metaFile).actor, 'mission:impl-1');
const report2 = path.join(meta.mdd_data, 'packet2-report.md'); fs.writeFileSync(report2, 'Complete second packet report.');
mdd.recordCandidate(metaFile, report2, true);
const result2 = { ...result, id: 'accept-2', packet: { ...result.packet, id: 'example-attempt-2', path: nextPacket }, evidence: [{ kind: 'evidence', path: report2 }] };
const result2Path = path.join(wt, '.missions/example/packet2-result.json'); fs.writeFileSync(result2Path, JSON.stringify(result2));
mdd.acceptResult(metaFile, result2Path);
state.attempts[1].result = { kind: 'result', id: result2.id, revision: 1, path: result2Path };
state.currentPacket = null; state.status = 'validating'; saveState();
mdd.prepareAssignment(metaFile, 'final-reviewer', path.join(wt, '.missions/example/handoff.md'), path.join(wt, '.missions/example/authority.md'), metaFile+'.next');
fs.renameSync(metaFile+'.next', metaFile);
assert.throws(() => mdd.bindExecution(metaFile), /fresh execution/);
publishMeta({ ...mdd.readMeta(metaFile), spawn_gen: 'review-2' });
mdd.bindExecution(metaFile);
const reviewReport = path.join(meta.mdd_data, 'final-report.md'); fs.writeFileSync(reviewReport, 'Complete independent review report covering both packets.');
mdd.recordCandidate(metaFile, reviewReport, true);
const finalResult = { ...result, id: 'final-accept', scope: 'mission', packet: null, actor: 'mission:review-2', freshContext: true, evidence: [{ kind: 'evidence', path: reviewReport }] };
const finalPath = path.join(wt, '.missions/example/final-result.json'); fs.writeFileSync(finalPath, JSON.stringify(finalResult));
mdd.acceptResult(metaFile, finalPath);
state.validation = { kind: 'result', id: finalResult.id, revision: 1, path: finalPath }; state.status = 'completed'; saveState();
assert.throws(() => mdd.deliveryCheck(metaFile), /ENOENT|authorization/);
const deliveryAuthority = path.join(meta.mdd_data, 'delivery-decision.md'); fs.writeFileSync(deliveryAuthority, 'Explicit fixture approval to deliver this accepted mission.');
mdd.authorizeAction(metaFile, 'delivery', deliveryAuthority);
assert.throws(() => mdd.deliveryCheck(metaFile), /commit|uncommitted/);
execFileSync('git', ['-C', wt, 'add', '--all']);
execFileSync('git', ['-C', wt, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Accepted mission including administrative result']);
assert.equal(mdd.deliveryCheck(metaFile).outcome, 'accepted');
const reportBefore = fs.readFileSync(reviewReport);
fs.appendFileSync(reviewReport, ' altered evidence');
assert.throws(() => mdd.deliveryCheck(metaFile), /stale|changed/);
fs.writeFileSync(reviewReport, reportBefore);
assert.throws(() => mdd.authorizeAction(metaFile, 'no-mistakes', deliveryAuthority), /before final/);
console.log('ok - two packets in one execution, final fresh reviewer, administrative verdict and separate delivery authority');
JS

# Dependency absence and partial preparation never discard useful task data.
mkdir -p "$TMP_ROOT/no-node"
python3 - "$TMP_ROOT/no-node" <<'PYCODE'
import os,sys
for name in os.listdir('/usr/bin'):
    if name not in ('node','nodejs'):
        os.symlink('/usr/bin/'+name,sys.argv[1]+'/'+name)
PYCODE
if out=$(PATH="$TMP_ROOT/no-node" FM_SPAWN_NO_GUARD=1 FM_HOME="$TMP_ROOT/home" /bin/bash "$ROOT/bin/fm-spawn.sh" no-node "$TMP_ROOT/project" --prepare --mdd-state .missions/example/state.json --mdd-skill "$BUNDLE" --mode local-only --yolo off 2>&1); then fail 'preparation accepted missing Node'; fi
assert_contains "$out" 'requires Node' 'missing runtime was not diagnosed'
git -C "$TMP_ROOT/project" branch fm/conflict
if out=$(FM_HOME="$TMP_ROOT/home" "$ROOT/bin/fm-spawn.sh" conflict "$TMP_ROOT/project" --prepare --mdd-state .missions/example/state.json --mdd-skill "$BUNDLE" --mode local-only --yolo off 2>&1); then fail 'preparation ignored existing branch'; fi
[ -f "$TMP_ROOT/home/data/conflict/mdd-bundle/SKILL.md" ] || fail 'failed preparation discarded useful snapshot'
[ ! -f "$TMP_ROOT/home/state/conflict.meta" ] || fail 'failed preparation published a usable task'
pass 'missing Node refuses and failed worktree preparation retains useful snapshot'
mkdir -p "$TMP_ROOT/home/data/reused"
printf 'earlier legacy task\n' > "$TMP_ROOT/home/data/reused/brief.md"
if out=$(FM_HOME="$TMP_ROOT/home" "$ROOT/bin/fm-spawn.sh" reused "$TMP_ROOT/project" --prepare --mdd-state .missions/example/state.json --mdd-skill "$BUNDLE" --mode local-only --yolo off 2>&1); then fail 'preparation reused an older task brief'; fi
assert_contains "$out" 'task data already exists' 'reused task must require reconciliation'
[ "$(cat "$TMP_ROOT/home/data/reused/brief.md")" = 'earlier legacy task' ] || fail 'preparation changed older evidence'


# Publication authority remains owned by FirstMate's existing repository gate.
# The Node boundary is a harmless success stub here; real MDD was qualified above.
mkdir -p "$TMP_ROOT/rolebin"
cat > "$TMP_ROOT/rolebin/node" <<'SH'
#!/usr/bin/env bash
printf '{}\n'
SH
chmod +x "$TMP_ROOT/rolebin/node"
cat > "$TMP_ROOT/home/state/role.meta" <<META
lifecycle=prepared
kind=ship
harness=codex
backend=tmux
mode=direct-PR
project=$ROOT
worktree=$ROOT
mdd_state=.missions/example/state.json
META
if out=$(PATH="$TMP_ROOT/rolebin:$PATH" FM_HOME="$TMP_ROOT/home" "$ROOT/bin/fm-control.sh" role action-check --action delivery 2>&1); then fail 'MDD bypassed the existing self-repository publication owner'; fi
assert_contains "$out" 'publication' 'refusal must identify existing publication authority'
pass 'MDD delivery retains the existing self-repository publication boundary'

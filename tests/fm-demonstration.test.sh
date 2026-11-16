#!/usr/bin/env bash
# Exercise the task control and delivery boundaries, without launching agents.
set -eu
# shellcheck source=tests/lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
TMP_ROOT=$(fm_test_tmproot fm-demonstration)
trap 'chmod -R u+w "$TMP_ROOT"; rm -rf "$TMP_ROOT"' EXIT
fm_git_identity fmtest fmtest@example.invalid
mkdir -p "$TMP_ROOT/home/state" "$TMP_ROOT/home/data/task" "$TMP_ROOT/project"
git -C "$TMP_ROOT/project" init -qb main
printf 'Initial result\n' > "$TMP_ROOT/project/result.txt"
git -C "$TMP_ROOT/project" add result.txt
git -C "$TMP_ROOT/project" commit -qm initial
printf 'Implement and demonstrate the complete buyer/operator journey.\n' > "$TMP_ROOT/home/data/task/authority.md"
printf 'lifecycle=prepared\nkind=ship\nbackend=tmux\nharness=pi\nmode=local-only\nproject=%s\nworktree=%s\n' "$TMP_ROOT/project" "$TMP_ROOT/project" > "$TMP_ROOT/home/state/task.meta"
cat > "$TMP_ROOT/plan.json" <<EOF
{"version":1,"kind":"nonvisual","authority":"$TMP_ROOT/home/data/task/authority.md","evidenceRoot":"$TMP_ROOT/home/data/task/evidence","journey":[{"id":"request","actor":"buyer","context":"request command","action":"submit","result":"request persisted"},{"id":"response","actor":"operator","context":"response command","action":"reply","result":"buyer receives total"}],"criteria":[]}
EOF
control() {
  FM_HOME="$TMP_ROOT/home" bash "$ROOT/bin/fm-control.sh" task demonstration "$@"
}
out=$(control --plan "$TMP_ROOT/plan.json" 2>&1) || fail "task control cannot retain the demonstration contract: $out"
record=$(sed -n 's/^demonstration=//p' "$TMP_ROOT/home/state/task.meta")
[ -f "$record" ] || fail 'task metadata does not reference its retained demonstration'
node --input-type=module - "$record" <<'JS'
import assert from 'node:assert/strict';
import fs from 'node:fs';
const record = JSON.parse(fs.readFileSync(process.argv[2]));
assert.deepEqual(record.plan.journey.map(scene => scene.id), ['request', 'response']);
assert.equal(record.plan.kind, 'nonvisual');
JS
pass 'task control retains the whole journey in task-owned data'
out=$(FM_HOME="$TMP_ROOT/home" bash "$ROOT/bin/fm-control.sh" task delivery-check --stage draft 2>&1) || fail "partial classic demo cannot be a draft: $out"
assert_contains "$out" incomplete 'partial demonstration draft omitted its gap'
if out=$(FM_HOME="$TMP_ROOT/home" bash "$ROOT/bin/fm-control.sh" task delivery-check --stage ready 2>&1); then
  fail 'partial classic demonstration became ready'
fi
assert_contains "$out" 'demonstration' 'ready refusal omitted demonstration gap'
pass 'classic demonstrated draft permits explicit gaps while ready delivery refuses'


node --input-type=module - "$ROOT" "$TMP_ROOT" <<'JS'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
const [root, tmp] = process.argv.slice(2), home = path.join(tmp, 'home');
const meta = path.join(home, 'state/task.meta'), wt = path.join(tmp, 'project');
const env = { ...process.env, FM_HOME: home };
function gate() {
  return spawnSync('bash', ['-c', '. "$1/bin/fm-classify-lib.sh"; . "$1/bin/fm-dod-lib.sh"; fm_dod_accept_ship_done ship local-only "$2" "$2" "done: ready in branch main" "$3/state" task "$3/state/task.meta"', '_', root, wt, home], { env, encoding: 'utf8' });
}
let result = gate();
assert.notEqual(result.status, 0, 'delivery accepted a contract with no demonstration or examination');
assert.match(result.stdout + result.stderr, /demonstration/);
console.log('ok - the real delivery boundary refuses unexamined demonstrations');
const head = () => execFileSync('git', ['-C', wt, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const evidence = path.join(home, 'data/task/evidence'); fs.mkdirSync(evidence);
const proof = path.join(evidence, 'observations.txt'); fs.writeFileSync(proof, 'Buyer request and operator response observed.');
const report = path.join(home, 'data/task/report.md'); fs.writeFileSync(report, 'Complete terminal report, including both actors.');
const artifact = path.join(evidence, 'demonstration.md'); fs.writeFileSync(artifact, '# Demonstration\nBuyer submits a request. Operator replies. Buyer receives the total.\n## Try it\nUnavailable: no shared runtime.');
function submit(value, refusal) {
  const input = path.join(tmp, 'report-input.json'); fs.writeFileSync(input, JSON.stringify({ head: head(), report, ...value }));
  const output = spawnSync('bash', [path.join(root, 'bin/fm-control.sh'), 'task', 'demonstration', '--report', input], { env, encoding: 'utf8' });
  if (refusal) {
    assert.notEqual(output.status, 0, `accepted invalid ${value.stage} report`);
    assert.match(output.stdout + output.stderr, refusal);
  } else assert.equal(output.status, 0, output.stdout + output.stderr);
}
const scene = id => ({ id, status: 'observed', caption: `${id}: actor, command, action and result`, evidence: [proof] });
submit({ stage: 'progress', scenes: [scene('request'), { id: 'response', status: 'missing', reason: 'operator response not yet observed' }] });
submit({ stage: 'review', outcome: 'accepted', complete: true, scenes: ['request', 'response'], criteria: [] }, /missing|incomplete/);
submit({ stage: 'progress', scenes: [scene('response')] });
submit({ stage: 'review', outcome: 'accepted', complete: true, scenes: ['response'], criteria: [] }, /whole journey|coverage/);
submit({ stage: 'review', outcome: 'accepted', complete: true, scenes: ['request', 'response'], criteria: [] });
submit({ stage: 'reader', outcome: 'accepted', complete: true, artifact, scenes: ['request', 'response'], trial: { status: 'unavailable', reason: 'no shared runtime' }, limits: [] });
result = gate(); assert.equal(result.status, 0, result.stdout + result.stderr);
assert.match(fs.readFileSync(meta, 'utf8'), /local_done_head=/);
console.log('ok - a partial draft progresses to an examined local delivery covering both actors');
const acceptedRecord = path.join(home, 'data/task/demonstration.json');
const acceptedBytes = fs.readFileSync(acceptedRecord, 'utf8');
submit({ stage: 'progress', scenes: [scene('response')] });
assert.equal(fs.readFileSync(acceptedRecord, 'utf8'), acceptedBytes, 'an identical progress retry invalidated accepted evidence');
submit({ stage: 'review', outcome: 'accepted', complete: true, scenes: ['request', 'response'], criteria: [] });
assert.equal(fs.readFileSync(acceptedRecord, 'utf8'), acceptedBytes, 'an identical review retry invalidated reader examination');
console.log('ok - identical progress and review retries preserve the accepted result');

{
  const demo = await import(path.join(root, 'bin/fm-demonstration-lib.mjs'));
  const isolated = path.join(tmp, 'deletion-home'), repo = path.join(tmp, 'deletion-repo');
  fs.mkdirSync(path.join(isolated, 'state'), { recursive: true }); fs.mkdirSync(repo);
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  git('init', '-qb', 'main'); fs.writeFileSync(path.join(repo, 'deleted'), 'Before mission');
  git('add', '.'); git('commit', '-qm', 'initial');
  const metaFile = path.join(isolated, 'state/task.meta'), planFile = path.join(tmp, 'deletion-plan.json');
  fs.writeFileSync(metaFile, `kind=ship\nmode=local-only\nworktree=${repo}\n`);
  fs.writeFileSync(planFile, JSON.stringify({ version: 1, kind: 'nonvisual', authority: report, evidenceRoot: evidence, journey: [{ id: 'deletion', actor: 'caller', context: 'existing file', action: 'delete', result: 'file absent' }], criteria: [] }));
  const localProof = path.join(isolated, 'data/task/evidence/proof');
  fs.mkdirSync(path.dirname(localProof), { recursive: true }); fs.writeFileSync(localProof, 'Observed deletion');
  const deletionPlan = JSON.parse(fs.readFileSync(planFile)); deletionPlan.evidenceRoot = path.dirname(localProof); fs.writeFileSync(planFile, JSON.stringify(deletionPlan));
  const priorHome = process.env.FM_HOME; process.env.FM_HOME = isolated;
  try {
    demo.retainPlan(metaFile, planFile, metaFile + '.next'); fs.renameSync(metaFile + '.next', metaFile);
    fs.writeFileSync(path.join(repo, 'temporary-source'), 'Intermediate committed source'); git('add', '.'); git('commit', '-qm', 'intermediate checkpoint');
    fs.unlinkSync(path.join(repo, 'temporary-source'));
    fs.unlinkSync(path.join(repo, 'deleted'));
    const input = path.join(tmp, 'deletion-report.json');
    fs.writeFileSync(input, JSON.stringify({ stage: 'progress', head: git('rev-parse', 'HEAD'), report, scenes: [{ id: 'deletion', status: 'observed', caption: 'Caller deletes the file', evidence: [localProof] }] })); demo.retainReport(metaFile, input);
    fs.writeFileSync(input, JSON.stringify({ stage: 'review', head: git('rev-parse', 'HEAD'), report, complete: true, outcome: 'accepted', scenes: ['deletion'], criteria: [] })); demo.retainReport(metaFile, input);
    git('add', '.'); git('commit', '-qm', 'accepted deletion');
    assert.doesNotThrow(() => demo.check(metaFile, 'review'), 'classic demonstration lost its accepted deletion after commit');
    fs.writeFileSync(path.join(repo, 'deleted'), 'Unexpected restoration');
    assert.throws(() => demo.check(metaFile, 'review'), /stale/);
  } finally { if (priorHome === undefined) delete process.env.FM_HOME; else process.env.FM_HOME = priorHome; }
  console.log('ok - classic demonstrated deletion survives commit and refuses unexpected restoration');
}

submit({ stage: 'review', outcome: 'correction_required', complete: true, scenes: ['response'], criteria: [], reason: 'The operator response does not show the buyer result' });
assert.notEqual(gate().status, 0, 'a new partial rejection left the previous acceptance usable');
assert.equal(JSON.parse(fs.readFileSync(acceptedRecord)).review.outcome, 'correction_required');
submit({ stage: 'review', outcome: 'accepted', complete: true, scenes: ['request', 'response'], criteria: [] });
submit({ stage: 'reader', outcome: 'accepted', complete: true, artifact, scenes: ['request', 'response'], trial: { status: 'unavailable', reason: 'no shared runtime' }, limits: [] });
console.log('ok - a terminal rejection can cover a partial examination and invalidates previous acceptance');
fs.appendFileSync(proof, '\nModified after review');
assert.notEqual(gate().status, 0, 'changed media retained acceptance');
fs.writeFileSync(proof, 'Buyer request and operator response observed.');
fs.appendFileSync(artifact, '\nChanged presentation');
assert.notEqual(gate().status, 0, 'changed presentation retained acceptance');
fs.writeFileSync(artifact, '# Demonstration\nBuyer submits a request. Operator replies. Buyer receives the total.\n## Try it\nUnavailable: no shared runtime.');
fs.appendFileSync(path.join(wt, 'result.txt'), '\nCorrection');
assert.notEqual(gate().status, 0, 'dirty source retained acceptance');
execFileSync('git', ['-C', wt, 'commit', '-qam', 'correction']);
submit({ stage: 'progress', scenes: [scene('response')] });
submit({ stage: 'review', outcome: 'accepted', complete: true, scenes: ['request', 'response'], criteria: [] }, /applicability|stale/);
submit({ stage: 'progress', scenes: [{ id: 'request', reuse: true, reason: 'Request inputs inspected and unchanged' }] });
submit({ stage: 'review', outcome: 'accepted', complete: true, scenes: ['request', 'response'], criteria: [] });
submit({ stage: 'reader', outcome: 'accepted', complete: true, artifact, scenes: ['request', 'response'], limits: [] }, /trial/);
console.log('ok - corrections preserve the whole journey but require current applicability and a full examination');
submit({ stage: 'reader', outcome: 'accepted', complete: true, artifact, scenes: ['request', 'response'], trial: { status: 'unavailable', reason: 'no shared runtime' }, limits: [] });
fs.writeFileSync(meta, fs.readFileSync(meta, 'utf8').replace('mode=local-only', 'mode=direct-PR'));
result = spawnSync('bash', [path.join(root, 'bin/fm-control.sh'), 'task', 'demonstration', '--action', 'check'], { env, encoding: 'utf8' });
assert.notEqual(result.status, 0, 'a published delivery accepted only a local artifact');
assert.match(result.stderr, /publication|published/);
const bin = path.join(tmp, 'fakebin'); fs.mkdirSync(bin);
const remote = path.join(tmp, 'remote.json');
fs.writeFileSync(path.join(bin, 'gh'), '#!/usr/bin/env bash\nif [ "$1" = api ]; then exit "${FM_TEST_ASSET_RESULT:-0}"; fi\ncat "$FM_TEST_REMOTE_PR"\n', { mode: 0o755 });
env.PATH = `${bin}:${env.PATH}`; env.FM_TEST_REMOTE_PR = remote;
const url = 'https://github.com/o/r/pull/7';
const trialText = '### Essayer\nIndisponible : aucun environnement partagé';
const body = `<!-- pr-demonstration:start -->\n## Demonstration\nrequest: actor, command, action and result\nresponse: actor, command, action and result\n${trialText}\n<!-- pr-demonstration:end -->`;
fs.writeFileSync(artifact, body);
fs.writeFileSync(remote, JSON.stringify({ url, headRefOid: head(), title: 'Complete buyer/operator result', body, isDraft: true }));
submit({ stage: 'reader', outcome: 'accepted', complete: true, artifact, scenes: ['request', 'response'], trial: { status: 'unavailable', reason: 'no shared runtime' }, limits: [], publication: { url, media: [], trialText } });
result = spawnSync('node', [path.join(root, 'bin/fm-demonstration-lib.mjs'), 'live-check', meta, url], { env, encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr);
fs.writeFileSync(remote, JSON.stringify({ url, headRefOid: head(), title: 'Changed after examination', body, isDraft: false }));
result = spawnSync('node', [path.join(root, 'bin/fm-demonstration-lib.mjs'), 'live-check', meta, url], { env, encoding: 'utf8' });
assert.notEqual(result.status, 0, 'concurrent PR edits retained the reader verdict');
assert.match(result.stderr, /published|publication|changed/);
console.log('ok - published delivery requires the real current PR and invalidates examination after concurrent edits');
execFileSync('git', ['-C', wt, 'update-ref', 'refs/remotes/origin/fm/task', head()]);
result = spawnSync('bash', [path.join(root, 'bin/fm-pr-check.sh'), 'task', url], { env, encoding: 'utf8' });
assert.notEqual(result.status, 0, 'PR registration bypassed examination when the head was already reachable');
assert.match(result.stderr, /published presentation changed/);
assert.doesNotMatch(fs.readFileSync(meta, 'utf8'), /^pr=/m);
assert.equal(fs.existsSync(path.join(home, 'state/task.check.sh')), false);
console.log('ok - PR registration refuses a stale demonstration before publishing metadata or a merge poll');
const publicationReader = { stage: 'reader', outcome: 'accepted', complete: true, artifact, scenes: ['request', 'response'], trial: { status: 'unavailable', reason: 'no shared runtime' }, limits: [] };
fs.writeFileSync(remote, JSON.stringify({ url, headRefOid: head(), title: 'Complete result', body: body + '<!-- pr-demonstration:start -->', isDraft: true }));
submit({ ...publicationReader, publication: { url, media: [], trialText } }, /markers/);
fs.writeFileSync(remote, JSON.stringify({ url, headRefOid: '0'.repeat(40), title: 'Complete result', body, isDraft: true }));
submit({ ...publicationReader, publication: { url, media: [], trialText } }, /source|PR/);
fs.writeFileSync(path.join(bin, 'curl'), '#!/usr/bin/env bash\nexit 22\n', { mode: 0o755 });
const asset = 'https://github.com/user-attachments/assets/test-asset';
const bodyWithAsset = body.replace('<!-- pr-demonstration:end -->', `![Request result](${asset})\n<!-- pr-demonstration:end -->`);
fs.writeFileSync(artifact, bodyWithAsset);
fs.writeFileSync(remote, JSON.stringify({ url, headRefOid: head(), title: 'Complete result', body: bodyWithAsset, isDraft: true }));
env.FM_TEST_ASSET_RESULT = '22';
submit({ ...publicationReader, publication: { url, media: [{ scene: 'request', url: asset }], trialText } }, /inaccessible/);
env.FM_TEST_ASSET_RESULT = '0';
submit({ ...publicationReader, publication: { url, media: [{ scene: 'request', url: asset }], trialText } });
env.FM_TEST_ASSET_RESULT = '22';
result = spawnSync('node', [path.join(root, 'bin/fm-demonstration-lib.mjs'), 'live-check', meta, url], { env, encoding: 'utf8' });
assert.notEqual(result.status, 0, 'a disappeared private attachment retained its reader verdict');
assert.match(result.stderr, /inaccessible/);
env.FM_TEST_ASSET_RESULT = '0';
console.log('ok - ambiguous sections, another PR head and inaccessible native media refuse before replacing the reader result');
const planInput = path.join(tmp, 'plan.json'), originalPlan = JSON.parse(fs.readFileSync(planInput));
const before = fs.readFileSync(path.join(home, 'data/task/demonstration.json'), 'utf8');
fs.writeFileSync(planInput, JSON.stringify({ ...originalPlan, journey: originalPlan.journey.slice(0, 1) }));
result = spawnSync('bash', [path.join(root, 'bin/fm-control.sh'), 'task', 'demonstration', '--plan', planInput], { env, encoding: 'utf8' });
assert.notEqual(result.status, 0, 'a correction silently narrowed the approved journey');
assert.match(result.stderr, /amendment|authority/);
assert.equal(fs.readFileSync(path.join(home, 'data/task/demonstration.json'), 'utf8'), before);
fs.writeFileSync(planInput, JSON.stringify(originalPlan));
console.log('ok - narrowing the journey requires an explicit amendment and preserves the previous evidence on refusal');
JS

node --input-type=module - "$ROOT" "$TMP_ROOT" <<'JS'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
const [root, tmp] = process.argv.slice(2), home = path.join(tmp, 'home'), wt = path.join(tmp, 'project');
const data = path.join(home, 'data/visual'), meta = path.join(home, 'state/visual.meta');
fs.mkdirSync(data);
fs.writeFileSync(path.join(wt, '.gitignore'), 'build/\n');
execFileSync('git', ['-C', wt, 'add', '.gitignore']);
execFileSync('git', ['-C', wt, 'commit', '-qm', 'capture workspace']);
fs.mkdirSync(path.join(wt, 'build/demo'), { recursive: true });
const capture = path.join(wt, 'build/demo/screen.png');
fs.writeFileSync(capture, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5N0AAAAASUVORK5CYII=', 'base64'));
fs.writeFileSync(meta, `lifecycle=prepared\nkind=ship\nmode=local-only\nbackend=tmux\nharness=pi\nproject=${wt}\nworktree=${wt}\n`);
const plan = { version: 1, kind: 'visual', authority: path.join(home, 'data/task/authority.md'), evidenceRoot: 'build/demo', journey: [{ id: 'screen', actor: 'operator', context: '/requests/17', action: 'respond', result: 'buyer sees total' }], criteria: [{ id: 'hierarchy', description: 'Secondary history belongs in a Drawer', reference: 'result.txt' }] };
function control(flag, value, refusal) {
  const file = path.join(tmp, 'visual-input.json'); fs.writeFileSync(file, JSON.stringify(value));
  const result = spawnSync('bash', [path.join(root, 'bin/fm-control.sh'), 'visual', 'demonstration', flag, file], { env: { ...process.env, FM_HOME: home }, encoding: 'utf8' });
  if (refusal) { assert.notEqual(result.status, 0); assert.match(result.stderr, refusal); }
  else assert.equal(result.status, 0, result.stderr);
}
control('--plan', plan);
const head = execFileSync('git', ['-C', wt, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const report = path.join(data, 'complete-report.md'); fs.writeFileSync(report, 'Complete visual review report.');
const base = { head, report, complete: true, scenes: ['screen'], criteria: ['hierarchy'], outcome: 'accepted' };
control('--report', { ...base, stage: 'progress', scenes: [{ id: 'screen', status: 'observed', caption: 'Operator /requests/17: respond and show buyer total', evidence: [capture] }] });
control('--report', { ...base, stage: 'review' }, /composition/);
control('--report', { ...base, stage: 'review', composition: true, criteria: [] }, /criterion.*coverage/);
control('--report', { ...base, stage: 'review', composition: true, outcome: 'correction_required', reason: 'The history displaces the primary action' });
const artifact = path.join(data, 'demonstration.md'); fs.writeFileSync(artifact, 'Operator /requests/17: respond and show buyer total\nTry it: unavailable');
const reader = { ...base, stage: 'reader', artifact, trial: { status: 'unavailable', reason: 'no authorized shared runtime' }, limits: [] };
control('--report', reader, /review/);
control('--report', { ...base, stage: 'review', composition: true });
control('--report', reader);
const check = spawnSync('bash', [path.join(root, 'bin/fm-control.sh'), 'visual', 'demonstration', '--action', 'check'], { env: { ...process.env, FM_HOME: home }, encoding: 'utf8' });
assert.notEqual(check.status, 0, 'ignored capture workspace counted as the durable project archive');
assert.match(check.stderr, /pathspec|evidence/);
console.log('ok - visual acceptance requires composition, project criteria and durable project media; a failed review remains blocking');
JS

mkdir -p "$TMP_ROOT/home/config"
ln -s "$TMP_ROOT/missing-setting" "$TMP_ROOT/home/config/demonstration"
if out=$(FM_HOME="$TMP_ROOT/home" FM_SPAWN_NO_GUARD=1 bash "$ROOT/bin/fm-spawn.sh" unplanned "$TMP_ROOT/project" --mode local-only --yolo off --harness pi --backend tmux 2>&1); then
  fail 'dangling demonstration setting silently disabled the requirement'
fi
assert_contains "$out" 'config/demonstration must be a regular file' 'an invalid setting did not fail closed'
rm "$TMP_ROOT/home/config/demonstration"
if out=$(FM_HOME="$TMP_ROOT/home" FM_SPAWN_NO_GUARD=1 bash "$ROOT/bin/fm-spawn.sh" unplanned "$TMP_ROOT/project" --mode local-only --yolo off --harness pi --backend tmux --demonstration '' 2>&1); then
  fail 'an explicit empty demonstration option was silently ignored'
fi
assert_contains "$out" '--demonstration requires a value' 'an empty declaration must fail before provider checks'
printf 'required\n' > "$TMP_ROOT/home/config/demonstration"
if out=$(FM_HOME="$TMP_ROOT/home" bash "$ROOT/bin/fm-spawn.sh" unplanned "$TMP_ROOT/project" --mode local-only --yolo off --harness pi 2>&1); then
  fail 'configured ship intake accepted no demonstration declaration'
fi
assert_contains "$out" 'requires --demonstration' 'spawn did not enforce the demonstration at intake'
[ ! -e "$TMP_ROOT/home/state/unplanned.meta" ] || fail 'refused intake published a task'
if out=$(FM_HOME="$TMP_ROOT/home" bash "$ROOT/bin/fm-promote.sh" unplanned --mode local-only --yolo off 2>&1); then
  fail 'configured promotion accepted no demonstration declaration'
fi
assert_contains "$out" 'requires --demonstration' 'promotion did not enforce the same intake contract'
pass 'configured classic intake and promotion refuse an omitted demonstration before dispatch'

. "$ROOT/bin/fm-config-inherit-lib.sh"
mkdir -p "$TMP_ROOT/primary/config" "$TMP_ROOT/primary/data" "$TMP_ROOT/second/config" "$TMP_ROOT/second/data"
printf 'required\n' > "$TMP_ROOT/primary/config/demonstration"
propagate_secondmate_inheritance "$TMP_ROOT/primary" "$TMP_ROOT/second" >/dev/null
cmp -s "$TMP_ROOT/primary/config/demonstration" "$TMP_ROOT/second/config/demonstration" || fail 'secondmate inheritance lost the primary demonstration requirement'
pass 'secondmate inheritance carries the primary demonstration requirement'

. "$ROOT/tests/fixtures.sh"
classic_home="$TMP_ROOT/classic-home"
fm_test_spawn_home "$classic_home" pi
printf 'required\n' > "$classic_home/config/demonstration"
printf 'manual\n' > "$classic_home/config/backlog-backend"
fm_git_worktree "$TMP_ROOT/classic-project" "$TMP_ROOT/classic-wt" fm/classic
fm_test_spawn_brief "$classic_home" classic
printf '\nDelivery contract: mode=local-only\n' >> "$classic_home/data/classic/brief.md"
fakebin=$(fm_test_make_spawn_fakebin "$TMP_ROOT/classic-tools" pi)
ln -s "$(node -p process.execPath)" "$fakebin/node"
out=$(fm_test_run_spawn "$classic_home" "$TMP_ROOT/classic-wt" "$fakebin" classic "$TMP_ROOT/classic-project" --mode local-only --yolo off --backend tmux --harness pi --demonstration "$TMP_ROOT/plan.json") || fail "classic dispatch lost the demonstration: $out"
assert_contains "$(cat "$classic_home/state/classic.meta")" 'demonstration=' 'classic dispatch did not bind its contract'
assert_contains "$(cat "$classic_home/data/classic/launch-brief.md")" 'Demonstration obligation' 'classic launch did not transmit its obligation'
pass 'classic dispatch retains the contract and transmits it through the real launch overlay'

if [ -n "${FM_TEST_MDD_BUNDLE:-}" ]; then
  mdd_home="$TMP_ROOT/mdd-home"
  fm_test_spawn_home "$mdd_home" pi
  printf 'required\n' > "$mdd_home/config/demonstration"
  printf 'manual\n' > "$mdd_home/config/backlog-backend"
  out=$(FM_HOME="$mdd_home" bash "$ROOT/bin/fm-spawn.sh" mission "$TMP_ROOT/project" --prepare --mdd-state .missions/example/state.json --mdd-skill "$FM_TEST_MDD_BUNDLE" --mode local-only --yolo off --backend tmux --demonstration "$TMP_ROOT/plan.json" 2>&1) || fail "MDD preparation lost the demonstration: $out"
  mdd_meta="$mdd_home/state/mission.meta"
  mdd_wt=$(sed -n 's/^worktree=//p' "$mdd_meta")
  node "$ROOT/tests/mdd-fixture.mjs" "$FM_TEST_MDD_BUNDLE" "$mdd_wt"
  out=$(FM_HOME="$mdd_home" bash "$ROOT/bin/fm-control.sh" mission assign --role implementer --brief-file "$mdd_wt/.missions/example/handoff.md" --authority "$mdd_wt/.missions/example/authority.md" 2>&1) || fail "MDD assignment failed: $out"
  mdd_brief=$(sed -n 's/^mdd_brief=//p' "$mdd_meta")
  assert_contains "$(cat "$mdd_brief")" 'demonstration.json' 'MDD assignment omitted the durable journey'
  if out=$(FM_HOME="$mdd_home" bash "$ROOT/bin/fm-control.sh" mission candidate --report "$mdd_wt/.missions/example/handoff.md" --complete 2>&1); then
    fail 'MDD candidate accepted no demonstration progress'
  fi
  assert_contains "$out" 'demonstration' 'MDD return did not enforce the demonstration checkpoint'
  out=$(FM_HOME="$mdd_home" bash "$ROOT/bin/fm-control.sh" mission delivery-check --stage draft 2>&1) || fail "MDD demonstrated draft refused: $out"
  assert_contains "$out" incomplete 'MDD demonstrated draft concealed its gaps'
  if out=$(FM_HOME="$mdd_home" bash "$ROOT/bin/fm-control.sh" mission delivery-check --stage ready 2>&1); then
    fail 'MDD with an incomplete demonstration became ready'
  fi
  pass 'qualified MDD preparation, assignment and return retain the same obligation'
else
  echo 'skip: external MDD qualification bundle not supplied for demonstration integration'
fi

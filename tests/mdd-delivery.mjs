import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as mdd from '../bin/fm-mdd-lib.mjs';
const bundle = process.argv[2], requested = process.argv[3], portableFixture = requested === 'portable-workflow', regression = portableFixture ? 'workflow' : requested;
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const relativeRefs = (file, value) => {
  if (Array.isArray(value)) return value.map(row => relativeRefs(file, row));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, row]) => [key, portableFixture && key === 'path' && value.kind && typeof row === 'string' && path.isAbsolute(row) ? path.relative(path.dirname(file), row) : relativeRefs(file, row)]));
};
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(relativeRefs(file, value))); };
const markdown = (file, value) => write(file, `---\n${JSON.stringify(relativeRefs(file, value))}\n---\n# Fixture\n`);
async function run() {
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-delivery-'));
try {
  const wt = path.join(tmp, 'repo'), data = path.join(tmp, 'data'), metaFile = path.join(tmp, 'state/task.meta');
  fs.mkdirSync(wt); git(wt, 'init', '-b', 'main'); git(wt, 'config', 'user.name', 'fixture'); git(wt, 'config', 'user.email', 'fixture@example.invalid');
  write(path.join(wt, 'app'), 'initial');
  if (regression === 'content-deletion') write(path.join(wt, 'removed-marker'), 'tracked before the mission');
  git(wt, 'add', '.'); git(wt, 'commit', '-qm', 'initial');
  const base = git(wt, 'rev-parse', 'HEAD');
  execFileSync(process.execPath, [new URL('./mdd-fixture.mjs', import.meta.url).pathname, bundle, wt]);
  mdd.pinBundle(bundle, data);
  write(metaFile, `mdd_state=.missions/example/state.json\nmdd_data=${data}\nworktree=${wt}\nproject=${wt}\nmode=direct-PR\nbranch=child\n`);
  git(wt, 'checkout', '-b', 'child');
  if (regression === 'portable-valid') {
    const packetFile = path.join(wt, '.missions/example/packet-r1.md');
    const item = mdd.readArtifact(packetFile);
    item.deliveryAssessment.commit = item.baseCommit;
    markdown(packetFile, item);
    write(path.join(wt, '..notes'), 'Valid filename');
    write(path.join(wt, 'proof\n'), 'Proof with a literal path');
    fs.symlinkSync('proof\n', path.join(wt, 'proof-link'));
    const proofStateFile = path.join(wt, '.missions/example/state.json');
    const proofState = mdd.readArtifact(proofStateFile);
    proofState.evidence.push({ kind: 'evidence', path: '../../proof-link' }); write(proofStateFile, proofState);
    git(wt, 'add', '.'); git(wt, 'commit', '-qm', 'portable graph');
    const before = git(wt, 'rev-parse', 'HEAD');
    execFileSync(process.execPath, [new URL('../bin/fm-mdd-lib.mjs', import.meta.url).pathname, 'portable-check', metaFile]);
    assert.equal(git(wt, 'rev-parse', 'HEAD'), before);
    assert.equal(git(wt, 'status', '--porcelain'), '');
    write(metaFile, fs.readFileSync(metaFile, 'utf8').replace('mdd_state=.missions/example/state.json', `mdd_state=${path.join(wt, '.missions/example/state.json')}`));
    execFileSync(process.execPath, [new URL('../bin/fm-mdd-lib.mjs', import.meta.url).pathname, 'portable-check', metaFile]);
    const proof = path.join(data, 'outside-proof'); write(proof, 'Private home proof');
    fs.symlinkSync(proof, path.join(wt, 'escaped-proof'));
    const st = path.join(wt, '.missions/example/state.json'), state = mdd.readArtifact(st);
    state.evidence.push({ kind: 'evidence', path: '../../escaped-proof' }); write(st, state);
    git(wt, 'add', '.'); git(wt, 'commit', '-qm', 'escaping proof');
    assert.throws(() => execFileSync(process.execPath, [new URL('../bin/fm-mdd-lib.mjs', import.meta.url).pathname, 'portable-check', metaFile], { stdio: 'pipe' }));
    console.log('ok - committed portable export validates without modifying source; escaping proof refuses');
    return;
  }

  if (regression === 'legacy-cleanup') {
    assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'mdd-bundle.json'))).version, 'v0.4-experimental');
    assert.equal(mdd.validateMission(metaFile).state.status, 'executing');
    fs.rmSync(wt, { recursive: true });
    assert.equal(mdd.teardownCheck(metaFile), null);
    assert.equal(mdd.teardownCheck(metaFile, true), null);
    console.log('ok - a frozen v0.4 task remains administratively removable without its worktree');
    return;
  }
  const contractPath = path.join(wt, 'docs/missions/example/r1.md');
  const contract = mdd.readArtifact(contractPath);
  contract.delivery = { mode: 'pull-request', baseCommit: base, target: 'main', rationale: 'One complete outcome.' };
  markdown(contractPath, contract);
  const packetPath = path.join(wt, '.missions/example/packet-r1.md');
  const packet = mdd.readArtifact(packetPath);
  delete packet.deliveryAssessment; markdown(packetPath, packet);
  const authority = path.join(wt, '.missions/example/authority.md'), brief = path.join(wt, '.missions/example/handoff.md');
  assert.throws(() => mdd.prepareAssignment(metaFile, 'implementer', brief, authority, metaFile+'.next'), /assessment/i);
  packet.deliveryAssessment = { commit: base, decision: 'needs_decision', rationale: 'Separate outcome.' }; markdown(packetPath, packet);
  assert.throws(() => mdd.prepareAssignment(metaFile, 'implementer', brief, authority, metaFile+'.next'), /decision|boundary/i);
  packet.deliveryAssessment.decision = 'continue'; markdown(packetPath, packet);
  mdd.prepareAssignment(metaFile, 'implementer', brief, authority, metaFile+'.next');
  fs.renameSync(metaFile+'.next', metaFile);
  assert.equal(mdd.currentAssignment(metaFile).role, 'implementer');
  console.log('ok - dispatch requires a current delivery assessment and refuses unresolved boundaries');
  if (regression === 'draft') {
    git(wt, 'add', '.'); git(wt, 'commit', '-qm', 'partial draft');
    const grant = path.join(data, 'draft-authority.md'); write(grant, 'Explicit permission to publish this incomplete draft, without readiness or merge.');
    write(metaFile, fs.readFileSync(metaFile, 'utf8') + 'kind=ship\nlifecycle=prepared\nbackend=tmux\nharness=codex\n');
    const env = { ...process.env, FM_HOME: tmp, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}` };
    execFileSync('bash', [new URL('../bin/fm-control.sh', import.meta.url).pathname, 'task', 'authorize', '--action', 'draft-delivery', '--authority', grant], { env, stdio: 'pipe' });
    assert.ok(mdd.actionCheck(metaFile, 'draft-delivery').basis);
    assert.throws(() => mdd.actionCheck(metaFile, 'delivery'), /accepted|completion/);
    write(path.join(wt, 'app'), 'Further work'); git(wt, 'add', '.'); git(wt, 'commit', '-qm', 'changed draft');
    assert.throws(() => mdd.actionCheck(metaFile, 'draft-delivery'), /stale|authorization/);
    mdd.authorizeAction(metaFile, 'draft-delivery', grant);
    assert.ok(mdd.actionCheck(metaFile, 'draft-delivery').basis);
    assert.throws(() => mdd.actionCheck(metaFile, 'delivery'), /accepted|completion/);
    console.log('ok - scoped draft permission precedes acceptance, expires on head changes and never authorizes readiness');
    return;
  }

  const publishMeta = changes => write(metaFile, Object.entries({ ...mdd.readMeta(metaFile), ...changes }).map(([k,v]) => `${k}=${v}\n`).join(''));
  const statePath = path.join(wt, '.missions/example/state.json'), journal = path.join(wt, '.missions/example/history.jsonl');
  const transition = changes => {
    const state = { ...JSON.parse(fs.readFileSync(statePath)), ...changes };
    state.revision++; state.lastSequence++;
    const last = JSON.parse(fs.readFileSync(journal, 'utf8').trim().split('\n').at(-1));
    fs.appendFileSync(journal, JSON.stringify({ ...last, sequence: state.lastSequence, stateRevision: state.revision, status: state.status })+'\n');
    write(statePath, state);
  };
  publishMeta({ spawn_gen: 'impl', lifecycle: 'running' });
  if (regression === 'content-deletion') fs.unlinkSync(path.join(wt, 'removed-marker'));
  mdd.bindExecution(metaFile);
  const report = mdd.currentAssignment(metaFile).reportTarget ?? path.join(data, 'impl.md'); write(report, 'Complete implementation and observed checks.');
  mdd.recordCandidate(metaFile, report, true);
  const result = { schemaVersion: 1, kind: 'result', id: 'packet-result', revision: 1, mission: { kind: 'mission', id: 'example', revision: 1, path: contractPath }, scope: 'packet', packet: { kind: 'packet', id: packet.id, revision: 1, path: packetPath }, actor: 'firstmate:fixture', implementers: ['task:impl'], freshContext: false, outcome: 'accepted', summary: 'Full outcome checked.', evidence: [{ kind: 'evidence', path: report }] };
  if (regression === 'portable') { const raw = path.join(data, 'external-proof.md'); write(raw, 'Required proof in the private home'); result.evidence.push({ kind: 'evidence', path: raw }); }
  const resultPath = path.join(wt, '.missions/example/result.json'); write(resultPath, result);
  assert.throws(() => mdd.acceptResult(metaFile, resultPath), /delivery.assessment/);
  result.deliveryAssessment = { commit: git(wt, 'rev-parse', 'HEAD'), decision: 'continue', rationale: 'The returned cumulative diff still delivers this outcome.' }; write(resultPath, result);
  mdd.acceptResult(metaFile, resultPath);
  transition({ status: 'validating', currentPacket: null, attempts: [{ packet: result.packet, result: { kind: 'result', id: result.id, revision: 1, path: resultPath } }] });
  mdd.prepareAssignment(metaFile, 'final-reviewer', brief, authority, metaFile+'.next'); fs.renameSync(metaFile+'.next', metaFile);
  publishMeta({ spawn_gen: 'review' }); mdd.bindExecution(metaFile);
  const review = mdd.currentAssignment(metaFile).reportTarget ?? path.join(data, 'review.md'); write(review, 'Independent full review with all required checks.');
  mdd.recordCandidate(metaFile, review, true);
  const final = { ...result, id: 'final', scope: 'mission', packet: null, actor: 'task:review', freshContext: true, evidence: [{ kind: 'evidence', path: review }] };
  const finalPath = path.join(wt, '.missions/example/final.json'); write(finalPath, final); mdd.acceptResult(metaFile, finalPath);
  transition({ validation: { kind: 'result', id: 'final', revision: 1, path: finalPath } });
  if (regression === 'jsonl-no-newline') write(journal, fs.readFileSync(journal, 'utf8').trimEnd());
  if (regression === 'content-deletion') {
    const acceptedContent = mdd.contentDigest(mdd.validateMission(metaFile));
    git(wt, 'add', '.');
    assert.equal(mdd.contentDigest(mdd.validateMission(metaFile)), acceptedContent, 'staging an accepted deletion must preserve content identity');
    git(wt, 'commit', '-qm', 'accepted child');
    const grant = path.join(data, 'publication.md'); write(grant, 'Explicit permission to publish this accepted source.');
    mdd.authorizeAction(metaFile, 'delivery', grant);
    assert.equal(mdd.deliveryCheck(metaFile).outcome, 'accepted');
    assert.equal(mdd.validateMission(metaFile).state.status, 'validating');
    write(path.join(wt, 'removed-marker'), 'restored unexpectedly');
    assert.throws(() => mdd.deliveryCheck(metaFile), /stale/);
    console.log('ok - accepted deletion survives staging and commit; restoring the deleted input invalidates acceptance');
    return;
  }
  git(wt, 'add', '.'); git(wt, 'commit', '-qm', 'accepted child');
  const grant = path.join(data, 'publication.md'); write(grant, 'Explicit permission to publish this accepted source.');
  mdd.authorizeAction(metaFile, 'delivery', grant);
  if (regression === 'portable') {
    const controlPath = new URL('../bin/fm-control.sh', import.meta.url).pathname;
    const env = { ...process.env, FM_HOME: tmp, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}` };
    const draft = execFileSync('bash', [controlPath, 'task', 'delivery-check', '--stage', 'draft'], { env, encoding: 'utf8' });
    assert.match(draft, /stage=draft/);
    assert.throws(() => execFileSync('bash', [controlPath, 'task', 'delivery-check', '--stage', 'ready'], { env, stdio: 'pipe' }));
    assert.throws(() => mdd.deliveryCheck(metaFile), /root|reference-missing/);
    console.log('ok - ready delivery rejects committed graphs that depend on the private home');
    return;
  }
  assert.equal(mdd.deliveryCheck(metaFile).outcome, 'accepted');
  if (portableFixture) {
    fs.appendFileSync(metaFile, 'kind=ship\nlifecycle=prepared\ndelivery_review_required=1\n');
    const controlPath = new URL('../bin/fm-control.sh', import.meta.url).pathname;
    const env = { ...process.env, FM_HOME: tmp };
    const control = (...args) => execFileSync('bash', [controlPath, 'task', ...args], { env, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
    assert.throws(() => control('delivery-check', '--stage', 'ready'), /delivery review/);
    const body = path.join(data, 'presentation.md'); write(body, 'The accepted result and its verification.');
    const examination = path.join(data, 'delivery-review-input.json');
    write(examination, {version:1,task:'task',repository:wt,head:git(wt,'rev-parse','HEAD'),base:mdd.validateMission(metaFile).mission.delivery.baseCommit,
      complete:true,outcome:'accepted',examiner:'coordinator',scope:{outcome:'Accepted child',grouping:'One behavior with its tests',dependencies:'Declared parent'},
      risks:{alignment:'Contract examined',impact:'Bounded module',verification:'Independent acceptance',rollback:'Revert',detection:'Explicit caller error'},
      presentation:{path:body,rationale:'Short nonvisual result'},evidence:[grant]});
    control('delivery-review','--report',examination);
    assert.match(control('delivery-check','--stage','ready'), /status=verified/);
    const activeBrief = mdd.readMeta(metaFile).mdd_brief;
    const briefBytes = fs.readFileSync(activeBrief);
    fs.appendFileSync(activeBrief, '\nChanged active instructions\n');
    assert.throws(() => control('delivery-check','--stage','ready'), /delivery review/, 'changed MDD brief retained readiness');
    fs.writeFileSync(activeBrief, briefBytes);
    const previousMeta = fs.readFileSync(metaFile);
    const replacementBrief = path.join(data, 'replacement-brief.md'); fs.writeFileSync(replacementBrief, briefBytes);
    fs.appendFileSync(metaFile, `mdd_brief=${replacementBrief}\n`);
    assert.throws(() => control('delivery-check','--stage','ready'), /delivery review/, 'changed brief identity retained readiness');
    fs.writeFileSync(metaFile, previousMeta);
    assert.match(control('delivery-check','--stage','ready'), /status=verified/);
    console.log('ok - portable MDD readiness also requires its separately recorded common delivery examination');
  }
  if (portableFixture) {
    const prior = fs.readFileSync(report); fs.appendFileSync(report, 'Changed old implementation proof');
    assert.throws(() => mdd.deliveryCheck(metaFile), /stale/);
    fs.writeFileSync(report, prior);
    assert.equal(mdd.deliveryCheck(metaFile).outcome, 'accepted');
  }
  assert.equal(mdd.validateMission(metaFile).state.status, 'validating');
  console.log('ok - independently accepted PR candidate publishes while mission remains open');
  const bare = path.join(tmp, 'origin.git'); git(tmp, 'init', '--bare', bare);
  const fakebin = path.join(tmp, 'fakebin'); fs.mkdirSync(fakebin);
  const transportMap = path.join(tmp, 'transports.json'); write(transportMap, { 'example/repo': bare });
  write(path.join(fakebin, 'ssh'), `#!/usr/bin/python3
import os,sys,json,shlex
command=shlex.split(sys.argv[-1])
if 'git@github.com' not in sys.argv or len(command)!=2 or command[0] not in ('git-upload-pack','git-receive-pack'): sys.exit(97)
repo=command[1].removesuffix('.git')
repositories=json.load(open(os.environ['FM_DELIVERY_TRANSPORTS']))
if repo not in repositories: sys.exit(98)
os.execvp(command[0],[command[0],repositories[repo]])
`); fs.chmodSync(path.join(fakebin, 'ssh'), 0o700);
  process.env.GIT_SSH_COMMAND = path.join(fakebin, 'ssh'); process.env.GIT_SSH_VARIANT = 'ssh'; process.env.FM_DELIVERY_TRANSPORTS = transportMap;
  git(wt, 'remote', 'add', 'origin', 'git@github.com:example/repo.git');
  git(wt, 'push', 'origin', 'main', 'child');
  const forgePath = path.join(tmp, 'forge.json'), ownUrl = 'https://github.com/example/repo/pull/2';
  const forge = { [ownUrl]: { url: ownUrl, state: 'OPEN', headRefName: 'child', headRefOid: git(wt, 'rev-parse', 'HEAD'), baseRefName: 'main', mergeCommit: null } };
  write(forgePath, forge);
  write(path.join(fakebin, 'gh'), `#!/usr/bin/python3
import os,sys,json,subprocess
p=os.environ['FM_DELIVERY_FORGE']; d=json.load(open(p)); url=sys.argv[3]
if os.environ.get('FM_DELIVERY_FORGE_FAIL'): sys.exit(1)
if sys.argv[2]=='edit' and os.environ.get('FM_DELIVERY_EDIT_FAIL'): sys.exit(1)
if sys.argv[2]=='edit':
 d[url]['baseRefName']=sys.argv[5]; json.dump(d,open(p,'w')); sys.exit(0)
r=d[url]
if r['state']=='OPEN': r['headRefOid']=subprocess.check_output(['git','--git-dir',os.environ['FM_DELIVERY_BARE'],'rev-parse',r['headRefName']],text=True).strip()
if '-q' in sys.argv and sys.argv[sys.argv.index('-q')+1]=='.headRefOid': print(r['headRefOid'])
else:
 r.setdefault('headRepository',{'id':'repo-id','nameWithOwner':'example/repo'})
 print(json.dumps(r))
`); fs.chmodSync(path.join(fakebin, 'gh'), 0o700);
  process.env.PATH = fakebin+':'+process.env.PATH; process.env.FM_DELIVERY_FORGE = forgePath; process.env.FM_DELIVERY_BARE = bare;
  publishMeta({ pr: ownUrl });
  const cli = (...args) => execFileSync(process.execPath, [new URL('../bin/fm-mdd-lib.mjs', import.meta.url).pathname, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (regression === 'foreign-pr') {
    const foreign = 'https://github.com/other/repo/pull/2';
    const changed = JSON.parse(fs.readFileSync(forgePath)); changed[foreign] = { ...changed[ownUrl], url: foreign }; write(forgePath, changed);
    const beforeMeta = fs.readFileSync(metaFile);
    assert.throws(() => cli('publication-check', metaFile, foreign), /canonical|repository|identity/);
    fs.chmodSync(path.dirname(metaFile), 0o700); fs.chmodSync(metaFile, 0o600);
    assert.throws(() => execFileSync('bash', [new URL('../bin/fm-pr-check.sh', import.meta.url).pathname, 'task', foreign], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FM_HOME: tmp } }), /canonical|repository|identity/);
    assert.deepEqual(fs.readFileSync(metaFile), beforeMeta);
    assert.equal(fs.existsSync(path.join(tmp, 'state/task.pr-poll')), false);
    console.log('ok - publication refuses a foreign PR without replacing the canonical identity');
    return;
  }
  assert.equal(JSON.parse(cli('publication-check', metaFile, ownUrl)).baseRefName, 'main');
  fs.chmodSync(path.dirname(metaFile), 0o700); fs.chmodSync(metaFile, 0o600);
  execFileSync('bash', [new URL('../bin/fm-pr-check.sh', import.meta.url).pathname, 'task', ownUrl], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FM_HOME: tmp } });
  assert.equal(mdd.readMeta(metaFile).pr_head, git(wt, 'rev-parse', 'HEAD'));
  assert.equal(fs.existsSync(path.join(tmp, 'state/task.pr-poll')), true);
  const before = git(wt, 'rev-parse', 'HEAD');
  process.env.FM_DELIVERY_FORGE_FAIL = '1';
  assert.throws(() => cli('publication-check', metaFile, ownUrl), /live|identity/);
  assert.equal(git(wt, 'rev-parse', 'HEAD'), before);
  delete process.env.FM_DELIVERY_FORGE_FAIL;
  console.log('ok - publication verifies the real PR head and target and fails closed on unavailable forge data');
  const grandWt = path.join(tmp, 'grand'), grandData = path.join(tmp, 'grand-data'), grandMeta = path.join(tmp, 'state/grand.meta');
  const oldChildHead = git(wt, 'rev-parse', 'HEAD');
  git(wt, 'worktree', 'add', '-b', 'grandchild', grandWt, 'child');
  const grandContractPath = path.join(grandWt, 'docs/missions/grand/r1.md');
  const grandContract = { schemaVersion: 1, kind: 'mission', id: 'grand', revision: 1, repository: '../../..', delivery: { mode: 'pull-request', baseCommit: oldChildHead, target: 'main', rationale: 'Another independently reviewable outcome.', parent: { mission: { kind: 'mission', id: 'example', revision: 1, path: '../example/r1.md' }, pr: ownUrl, branch: 'child', head: oldChildHead } } };
  markdown(grandContractPath, grandContract);
  const grandRef = { kind: 'mission', id: 'grand', revision: 1, path: '../../docs/missions/grand/r1.md' };
  const grandAuth = path.join(grandWt, '.missions/grand/authority.md'); write(grandAuth, 'Explicit stack-update authority for this dependent mission.');
  const grandEvents = ['draft', 'ready', 'executing', 'validating'].map((status, i) => ({ schemaVersion: 1, kind: 'event', sequence: i+1, stateRevision: i+1, at: '2026-11-15T00:00:00Z', actor: 'fixture', mission: grandRef, status, interruption: null, reason: 'Fixture preparation.', evidence: [{ kind: 'evidence', path: 'authority.md' }] }));
  write(path.join(grandWt, '.missions/grand/history.jsonl'), grandEvents.map(row => JSON.stringify(row)).join('\n')+'\n');
  write(path.join(grandWt, '.missions/grand/state.json'), { schemaVersion: 1, kind: 'state', id: 'grand', revision: 4, lastSequence: 4, mission: grandRef, status: 'validating', interruption: null, executionMode: 'coordinated', history: 'history.jsonl', currentPacket: null, attempts: [], checkpoints: [], evidence: [{ kind: 'evidence', path: 'authority.md' }], validation: null });
  write(path.join(grandWt, 'grand-feature'), 'third delivery'); git(grandWt, 'add', '.'); git(grandWt, 'commit', '-qm', 'third coherent outcome'); git(grandWt, 'push', 'origin', 'grandchild');
  mdd.pinBundle(bundle, grandData);
  const grandUrl = 'https://github.com/example/repo/pull/3';
  write(grandMeta, `mdd_state=.missions/grand/state.json\nmdd_data=${grandData}\nworktree=${grandWt}\nproject=${wt}\nmode=direct-PR\nbranch=grandchild\npr=${grandUrl}\n`);
  forge[grandUrl] = { url: grandUrl, state: 'OPEN', headRefName: 'grandchild', headRefOid: git(grandWt, 'rev-parse', 'HEAD'), baseRefName: 'child', mergeCommit: null }; write(forgePath, forge);
  mdd.authorizeAction(grandMeta, 'stack-update', grandAuth);
  mdd.prepareAssignment(grandMeta, 'final-reviewer', brief, grandAuth, grandMeta+'.next'); fs.renameSync(grandMeta+'.next', grandMeta);
  assert.equal(mdd.currentAssignment(grandMeta).role, 'final-reviewer');
  git(wt, 'checkout', 'main'); git(wt, 'checkout', '-b', 'parent');
  write(path.join(wt, 'parent-feature'), 'v1'); git(wt, 'add', '.'); git(wt, 'commit', '-qm', 'parent v1');
  const parentHead = git(wt, 'rev-parse', 'HEAD');
  git(wt, 'push', 'origin', 'parent'); git(wt, 'checkout', 'child'); git(wt, 'rebase', '--onto', parentHead, base);
  const parentContract = path.join(wt, 'docs/missions/parent/r1.md');
  markdown(parentContract, { schemaVersion: 1, kind: 'mission', id: 'parent', revision: 1, repository: '../../..' });
  contract.delivery.parent = { mission: { kind: 'mission', id: 'parent', revision: 1, path: '../parent/r1.md' }, pr: 'https://github.com/example/repo/pull/1', branch: 'parent', head: parentHead };
  markdown(contractPath, contract); git(wt, 'add', '.'); git(wt, 'commit', '-qm', 'record stack contract'); git(wt, 'push', '--force-with-lease', 'origin', 'child');
  forge[ownUrl].baseRefName = 'parent';
  const parentUrl = contract.delivery.parent.pr;
  forge[parentUrl] = { url: parentUrl, state: 'OPEN', headRefName: 'parent', headRefOid: parentHead, baseRefName: 'main', mergeCommit: null }; write(forgePath, forge);
  assert.throws(() => mdd.prepareAssignment(metaFile, 'final-reviewer', brief, authority, metaFile+'.next'), /tracked independently accepted parent/);
  git(wt, 'checkout', 'parent'); write(path.join(wt, 'parent-feature'), 'v2'); git(wt, 'commit', '-qam', 'parent corrected'); git(wt, 'push', 'origin', 'parent'); git(wt, 'checkout', 'child');
  const childBefore = git(wt, 'rev-parse', 'HEAD');
  assert.equal(mdd.validateMission(metaFile).state.status, 'validating');
  assert.throws(() => mdd.dispatchCheck(metaFile), /parent changed/);
  assert.throws(() => mdd.deliveryCheck(metaFile), /parent changed|stale/);
  const originalGrant = mdd.authorizeAction(metaFile, 'stack-update', authority);
  fs.appendFileSync(authority, '\nExplicit renewed authority for the same scoped update.');
  git(wt, 'add', authority); git(wt, 'commit', '-qm', 'retain renewed update authority'); git(wt, 'push', 'origin', 'child');
  const renewedGrant = mdd.authorizeAction(metaFile, 'stack-update', authority);
  assert.notEqual(originalGrant.authority.digest, renewedGrant.authority.digest);
  assert.equal(fs.readdirSync(path.join(data, 'stack-authorizations')).length, 2);
  publishMeta({ lifecycle: 'prepared', spawn_gen: '', kind: 'ship', backend: 'tmux', harness: 'codex' });
  const control = verb => execFileSync('bash', [new URL('../bin/fm-control.sh', import.meta.url).pathname, 'task', verb], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FM_HOME: tmp } });
  const unchanged = (operation, pattern) => {
    const snapshot = () => [git(wt, 'rev-parse', 'HEAD'), fs.readFileSync(statePath, 'utf8'), fs.readFileSync(journal, 'utf8'), git(bare, 'rev-parse', 'child')];
    const before = snapshot();
    let failure;
    try { operation(); } catch (error) { failure = error; }
    assert.deepEqual(snapshot(), before, 'a refused operation must preserve the branch, state, journal and remote');
    assert.ok(failure, 'operation must refuse');
    assert.match(String(failure.stderr || failure.message), pattern);
  };
  if (regression === 'pushurl' || regression === 'rewritten-remote') {
    const other = path.join(tmp, 'other.git'); git(tmp, 'clone', '--bare', bare, other);
    write(transportMap, { 'example/repo': bare, 'other/repo': other });
    if (regression === 'pushurl') git(wt, 'config', 'remote.origin.pushurl', 'git@github.com:other/repo.git');
    else git(wt, 'config', 'url.git@github.com:other/repo.git.insteadOf', 'git@github.com:example/repo.git');
    const otherHead = git(other, 'rev-parse', 'child');
    unchanged(() => control('reconcile-delivery'), /repository|identity|remote/);
    assert.equal(git(other, 'rev-parse', 'child'), otherHead);
    assert.equal(fs.existsSync(path.join(data, 'stack-update-pending.json')), false);
    console.log('ok - effective transport repository mismatch refuses before local or remote changes');
    return;
  }
  if (regression === 'diverged-base') {
    const changed = JSON.parse(fs.readFileSync(forgePath)); changed[ownUrl].baseRefName = 'unexpected'; write(forgePath, changed);
    unchanged(() => control('reconcile-delivery'), /base|target/);
    assert.equal(JSON.parse(fs.readFileSync(forgePath))[ownUrl].baseRefName, 'unexpected');
    console.log('ok - a divergent PR base is preserved before all branch mutations');
    return;
  }
  if (regression.startsWith('wrong-branch')) {
    const childRef = git(wt, 'rev-parse', 'child');
    if (regression.endsWith(':detached')) git(wt, 'checkout', '--detach');
    else git(wt, 'checkout', '-b', 'unrelated-local-branch');
    unchanged(() => control('reconcile-delivery'), /branch|HEAD/);
    assert.equal(git(wt, 'rev-parse', 'child'), childRef);
    console.log('ok - reconciliation refuses an unexpected or detached local branch');
    return;
  }
  if (regression.startsWith('terminal:')) {
    transition({ status: regression.split(':')[1] });
    git(wt, 'add', statePath, journal); git(wt, 'commit', '-qm', 'terminal mission'); git(wt, 'push', 'origin', 'child');
    unchanged(() => control('reconcile-delivery'), /open|terminal/);
    assert.throws(() => mdd.authorizeAction(metaFile, 'stack-update', authority), /open|terminal/);
    console.log(`ok - ${regression} refuses stack authority and reconciliation without mutation`);
    return;
  }
  if (regression === 'state-temp-symlink') {
    const victim = path.join(tmp, 'outside-file'); write(victim, 'must remain unchanged');
    fs.symlinkSync(victim, statePath+'.next'); git(wt, 'add', statePath+'.next'); git(wt, 'commit', '-qm', 'untrusted temporary symlink'); git(wt, 'push', 'origin', 'child');
    let failure; try { control('reconcile-delivery'); } catch (error) { failure = error; }
    assert.equal(fs.readFileSync(victim, 'utf8'), 'must remain unchanged');
    assert.equal(failure, undefined);
    assert.equal(mdd.validateMission(metaFile).state.deliveryBase.target, 'parent');
    console.log('ok - a tracked predictable symlink cannot redirect an administrative write');
    return;
  }
  if (regression === 'jsonl-no-newline') {
    assert.equal(fs.readFileSync(journal, 'utf8').endsWith('\n'), false);
    const old = fs.readFileSync(journal, 'utf8').split('\n').length;
    assert.equal(mdd.validateMission(metaFile).state.status, 'validating');
    assert.equal(JSON.parse(control('reconcile-delivery')).phase, 'verified');
    assert.equal(mdd.validateMission(metaFile).state.status, 'validating');
    assert.equal(fs.readFileSync(journal, 'utf8').trimEnd().split('\n').length, old + 1);
    console.log('ok - a valid JSONL journal without a final newline remains valid after update');
    return;
  }
  const updated = JSON.parse(control('reconcile-delivery'));
  assert.equal(updated.phase, 'verified');
  if (portableFixture) {
    execFileSync(process.execPath, [new URL('../bin/fm-mdd-lib.mjs', import.meta.url).pathname, 'portable-check', metaFile]);
    console.log('ok - accepted portable mission retains a relocatable graph after stack reconciliation');
  }
  assert.equal(git(wt, 'show', 'HEAD:parent-feature'), 'v2');
  assert.notEqual(git(wt, 'rev-parse', 'HEAD'), childBefore);
  assert.equal(git(wt, 'status', '--porcelain'), '');
  assert.equal(git(wt, 'rev-parse', 'HEAD'), git(bare, 'rev-parse', 'child'));
  assert.equal(mdd.validateMission(metaFile).state.deliveryBase.target, 'parent');
  assert.equal(JSON.parse(cli('reconcile-delivery', grandMeta)).phase, 'verified');
  assert.equal(git(grandWt, 'show', 'HEAD:parent-feature'), 'v2');
  assert.equal(git(grandWt, 'show', 'HEAD:grand-feature'), 'third delivery');
  assert.throws(() => mdd.deliveryCheck(metaFile), /stale/);
  const cleanChild = git(wt, 'rev-parse', 'HEAD'), cleanGrand = git(grandWt, 'rev-parse', 'HEAD');
  write(path.join(grandWt, 'app'), 'grand correction'); git(grandWt, 'commit', '-qam', 'grand changes app'); git(grandWt, 'push', 'origin', 'grandchild');
  const remoteBeforeConflict = git(bare, 'rev-parse', 'grandchild');
  write(path.join(wt, 'app'), 'parent correction'); git(wt, 'commit', '-qam', 'parent changes app'); git(wt, 'push', 'origin', 'child');
  assert.throws(() => cli('reconcile-delivery', grandMeta), /rebase/);
  assert.equal(git(bare, 'rev-parse', 'grandchild'), remoteBeforeConflict);
  assert.match(git(grandWt, 'status', '--porcelain'), /UU app/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(grandData, 'stack-update-pending.json'))).phase, 'prepared');
  git(grandWt, 'rebase', '--abort'); git(grandWt, 'reset', '--hard', cleanGrand); git(grandWt, 'push', '--force-with-lease', 'origin', 'grandchild');
  fs.unlinkSync(path.join(grandData, 'stack-update-pending.json'));
  git(wt, 'reset', '--hard', cleanChild); git(wt, 'push', '--force-with-lease', 'origin', 'child');
  console.log('ok - a real rebase conflict retains the candidate and pending receipt without changing the remote child');
  git(wt, 'checkout', 'main'); git(wt, 'merge', '--squash', 'parent'); git(wt, 'commit', '-qm', 'squash parent'); git(wt, 'push', 'origin', 'main');
  const merged = git(wt, 'rev-parse', 'HEAD'); git(wt, 'checkout', 'child');
  forge[parentUrl] = { ...forge[parentUrl], state: 'MERGED', headRefOid: git(wt, 'rev-parse', 'parent'), mergeCommit: { oid: merged } }; write(forgePath, forge);
  if (regression === 'unintegrated-parent') {
    git(wt, 'checkout', 'main'); git(wt, 'reset', '--hard', base); git(wt, 'push', '--force-with-lease', 'origin', 'main'); git(wt, 'checkout', 'child');
    unchanged(() => control('reconcile-delivery'), /integrat|ancestor|target/);
    assert.equal(JSON.parse(fs.readFileSync(forgePath))[ownUrl].baseRefName, 'parent');
    console.log('ok - a rewritten target missing the parent integration refuses before rebase and push');
    return;
  }
  process.env.FM_DELIVERY_EDIT_FAIL = '1';
  assert.throws(() => control('reconcile-delivery'), /retarget failed/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'stack-update-pending.json'))).phase, 'pushed');
  assert.throws(() => mdd.dispatchCheck(metaFile), /pending/);
  delete process.env.FM_DELIVERY_EDIT_FAIL;
  if (regression === 'resume-diverged-base') {
    const changed = JSON.parse(fs.readFileSync(forgePath)); changed[ownUrl].baseRefName = 'unexpected'; write(forgePath, changed);
    unchanged(() => control('reconcile-delivery'), /base|target/);
    assert.equal(JSON.parse(fs.readFileSync(forgePath))[ownUrl].baseRefName, 'unexpected');
    assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'stack-update-pending.json'))).phase, 'pushed');
    console.log('ok - resuming a transport preserves an unexpected remote target');
    return;
  }
  const landed = JSON.parse(control('reconcile-delivery'));
  assert.equal(landed.target, 'main');
  assert.equal(JSON.parse(fs.readFileSync(forgePath))[ownUrl].baseRefName, 'main');
  assert.equal(mdd.validateMission(metaFile).state.status, 'validating');
  assert.equal(mdd.validateMission(metaFile).state.deliveryBase.commit, merged);
  assert.equal(git(wt, 'diff', '--name-only', 'origin/main...HEAD').split('\n').includes('parent-feature'), false);
  console.log('ok - real Git replays only child changes after parent correction and squash integration, retaining open mission and stale acceptance');
  assert.throws(() => cli('close-mission', metaFile), /OPEN|merged|acceptance|stale/);
  if (regression === 'invalid-close') {
    const unfinished = path.join(wt, '.missions/example/unfinished.md');
    markdown(unfinished, { ...packet, id: 'unfinished', baseCommit: git(wt, 'rev-parse', 'HEAD'), deliveryAssessment: { commit: git(wt, 'rev-parse', 'HEAD'), decision: 'continue', rationale: 'Retained pending attempt.' } });
    const state = JSON.parse(fs.readFileSync(statePath));
    transition({ attempts: [...state.attempts, { packet: { kind: 'packet', id: 'unfinished', revision: 1, path: unfinished }, result: null }] });
    assert.equal(mdd.validateMission(metaFile).state.status, 'validating');
  }
  mdd.prepareAssignment(metaFile, 'final-reviewer', brief, authority, metaFile+'.next'); fs.renameSync(metaFile+'.next', metaFile);
  publishMeta({ spawn_gen: 'review2', lifecycle: 'running' }); mdd.bindExecution(metaFile);
  const review2 = portableFixture ? mdd.currentAssignment(metaFile).reportTarget : path.join(data, 'review2.md'); write(review2, 'Fresh independent review of the revised parent and child, all mandatory checks retained.');
  mdd.recordCandidate(metaFile, review2, true);
  const final2 = { ...final, deliveryAssessment: { ...result.deliveryAssessment, commit: git(wt, 'rev-parse', 'HEAD') }, id: 'final2', actor: 'task:review2', evidence: [{ kind: 'evidence', path: review2 }] };
  const final2Path = path.join(wt, '.missions/example/final2.json'); write(final2Path, final2); mdd.acceptResult(metaFile, final2Path);
  transition({ validation: { kind: 'result', id: 'final2', revision: 1, path: final2Path } });
  git(wt, 'add', '.'); git(wt, 'commit', '-qm', 'record independent revalidation'); git(wt, 'push', 'origin', 'child');
  assert.throws(() => mdd.deliveryCheck(metaFile), /authorization/);
  mdd.authorizeAction(metaFile, 'delivery', grant);
  assert.equal(mdd.deliveryCheck(metaFile).outcome, 'accepted');
  git(wt, 'checkout', 'main'); git(wt, 'merge', '--squash', 'child'); git(wt, 'commit', '-qm', 'squash child'); git(wt, 'push', 'origin', 'main');
  const childMerge = git(wt, 'rev-parse', 'HEAD'); git(wt, 'checkout', 'child');
  const finalForge = JSON.parse(fs.readFileSync(forgePath));
  finalForge[ownUrl] = { ...finalForge[ownUrl], state: 'MERGED', headRefOid: git(wt, 'rev-parse', 'HEAD'), mergeCommit: { oid: childMerge } }; write(forgePath, finalForge);
  publishMeta({ lifecycle: 'prepared', spawn_gen: '' });
  if (regression === 'invalid-close') {
    unchanged(() => control('close-mission'), /completion-pending/);
    assert.equal(mdd.validateMission(metaFile).state.status, 'validating');
    assert.equal(fs.existsSync(path.join(data, 'mdd-closure/manifest.json')), false);
    console.log('ok - rejected completion preserves the valid active state and journal');
    return;
  }
  if (regression === 'state-publication-failure') {
    const rename = fs.renameSync;
    fs.renameSync = (source, destination) => {
      if (destination === statePath) throw Object.assign(Error('state publication I/O failure'), { code: 'EIO' });
      return rename(source, destination);
    };
    try { unchanged(() => mdd.closeMission(metaFile), /state publication I\/O failure/); }
    finally { fs.renameSync = rename; }
    assert.equal(mdd.validateMission(metaFile).state.status, 'validating');
    assert.equal(fs.existsSync(path.join(data, 'mdd-closure/manifest.json')), false);
    console.log('ok - failed state publication restores the original journal and preserves the valid active state');
    return;
  }
  const closed = JSON.parse(control('close-mission'));
  assert.equal(closed.status, 'completed');
  if (portableFixture) assert.equal(path.isAbsolute(closed.integration.evidence[0].path), false, 'new closure evidence must remain relocatable');
  assert.equal(mdd.validateMission(metaFile).state.status, 'completed');
  assert.equal(closed.integration.head, git(wt, 'rev-parse', 'HEAD'));
  assert.throws(() => cli('teardown-check', metaFile), /dependent task/);
  assert.equal(JSON.parse(cli('reconcile-delivery', grandMeta)).target, 'main');
  assert.equal(git(grandWt, 'diff', '--name-only', 'origin/main...HEAD').split('\n').includes('parent-feature'), false);
  fs.unlinkSync(path.join(data, 'mdd-closure/manifest.json'));
  assert.equal(JSON.parse(cli('close-mission', metaFile)).revision, closed.revision);
  const archived = JSON.parse(fs.readFileSync(path.join(data, 'mdd-closure/manifest.json')));
  if (regression === 'archive-verdict') {
    const oldVerdict = archived.files.find(entry => entry.path === finalPath);
    assert.ok(oldVerdict, 'the archive must retain a superseded independent verdict');
    assert.equal(fs.readFileSync(path.join(data, 'mdd-closure/files', oldVerdict.digest), 'utf8'), fs.readFileSync(finalPath, 'utf8'));
    assert.ok(archived.files.some(entry => entry.path === final2Path));
    console.log('ok - closure archives both superseded and current independent verdicts');
    return;
  }
  assert.equal(archived.stateDigest.length, 64);
  assert.equal(cli('teardown-check', metaFile).trim(), '');
  write(path.join(wt, 'unreviewed'), 'must survive');
  assert.throws(() => cli('teardown-check', metaFile), /unreviewed|content|changed/);
  const grandStatePath = path.join(grandWt, '.missions/grand/state.json'), grandJournal = path.join(grandWt, '.missions/grand/history.jsonl');
  const grandState = JSON.parse(fs.readFileSync(grandStatePath));
  grandState.status = 'cancelled'; grandState.revision++; grandState.lastSequence++;
  const grandLast = JSON.parse(fs.readFileSync(grandJournal, 'utf8').trim().split('\n').at(-1));
  fs.appendFileSync(grandJournal, JSON.stringify({ ...grandLast, status: 'cancelled', sequence: grandState.lastSequence, stateRevision: grandState.revision, reason: 'Explicit fixture cancellation and discard authority.' })+'\n'); write(grandStatePath, grandState);
  assert.throws(() => cli('teardown-check', grandMeta), /not closed/);
  assert.throws(() => execFileSync('bash', [new URL('../bin/fm-teardown.sh', import.meta.url).pathname, 'grand', '--force'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FM_HOME: tmp, NO_MISTAKES_GATE: '1', FM_GATE_REFUSE_BYPASS: '0' } }), /gate/i);
  assert.equal(fs.existsSync(path.join(grandData, 'mdd-closure')), false, 'a refused caller must not archive or mutate mission data');
  let demonstrationFiles;
  if (regression === 'archive-demonstration') {
    const demo = await import('../bin/fm-demonstration-lib.mjs');
    process.env.FM_HOME = tmp; process.env.FM_DATA_OVERRIDE = path.join(tmp, 'demo-storage');
    const evidenceRoot = path.join(process.env.FM_DATA_OVERRIDE, 'grand'); fs.mkdirSync(evidenceRoot, { recursive: true });
    write(grandMeta, fs.readFileSync(grandMeta, 'utf8') + 'kind=ship\n');
    const plan = path.join(tmp, 'demo-plan.json');
    write(plan, { version: 1, kind: 'nonvisual', authority: grandAuth, evidenceRoot, journey: [{ id: 'cli', actor: 'user', context: 'CLI', action: 'inspect output', result: 'output retained' }], criteria: [] });
    demo.retainPlan(grandMeta, plan, grandMeta+'.demo'); fs.renameSync(grandMeta+'.demo', grandMeta);
    const proof = path.join(evidenceRoot, 'scene.txt'), report = path.join(evidenceRoot, 'report.md'), input = path.join(tmp, 'demo-progress.json');
    write(proof, 'Actual retained output.'); write(report, 'Complete nonvisual observation report.');
    write(input, { stage: 'progress', head: git(grandWt, 'rev-parse', 'HEAD'), report, scenes: [{ id: 'cli', status: 'observed', caption: 'CLI output observed', evidence: [proof] }] });
    demo.retainReport(grandMeta, input);
    demonstrationFiles = [mdd.readMeta(grandMeta).demonstration, proof, report];
  }
  assert.equal(cli('teardown-check', grandMeta, '--discard').trim(), '');
  if (demonstrationFiles) {
    const archive = path.join(grandData, 'mdd-closure'), manifest = JSON.parse(fs.readFileSync(path.join(archive, 'manifest.json')));
    for (const file of demonstrationFiles) {
      const entry = manifest.files.find(row => row.path === file);
      assert.ok(entry, `missing demonstration evidence: ${path.basename(file)}`);
      assert.deepEqual(fs.readFileSync(path.join(archive, 'files', entry.digest)), fs.readFileSync(file));
    }
    console.log('ok - terminal archival retains the demonstration contract, scene and report through their owner');
  }

  assert.equal(mdd.validateMission(grandMeta).state.status, 'cancelled');
  console.log('ok - changed content is independently reaccepted, closure requires verified integration, and teardown requires intact archive and source');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

}
const scenarios = ['content-deletion', 'workflow', 'terminal:cancelled', 'terminal:failed', 'terminal:superseded', 'wrong-branch', 'wrong-branch:detached', 'diverged-base', 'resume-diverged-base', 'pushurl', 'rewritten-remote', 'foreign-pr', 'unintegrated-parent', 'state-temp-symlink', 'jsonl-no-newline', 'invalid-close', 'state-publication-failure', 'archive-verdict', 'archive-demonstration'];
if (!regression) {
  for (const scenario of scenarios) {
    console.log(`case - ${scenario}`);
    execFileSync(process.execPath, [process.argv[1], bundle, scenario], { stdio: 'inherit' });
  }
} else {
  assert.ok(scenarios.includes(regression) || ['legacy-cleanup', 'portable', 'portable-valid', 'draft', 'portable-workflow'].includes(regression), `unknown scenario: ${regression}`);
  await run();
}

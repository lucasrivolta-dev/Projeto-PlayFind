import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { execute, executeQueue, validateQueue, validateTask, validateDecision, safeEnv, windowsCommand, command } from '../runner.mjs';

const task = { id: 'smoke', title: 'Smoke', prompt: 'Create docs/result.md', allowedPaths: ['docs/result.md'], checks: ['orchestrator'], model: 'gpt-6-sol', reasoning: 'low', reviewReasoning: 'low', maxAttempts: 2, timeoutMinutes: 1, requiresManualValidation: false };
const approved = { decision: 'APPROVED', summary: 'OK', blockingIssues: [] };
const pass = async () => ({ passed: true, results: [] });
async function fixture(t) {
  const temp = await mkdtemp(path.join(tmpdir(), 'autopilot-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'repo'); await mkdir(root);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.invalid');
  await writeFile(path.join(root, 'AGENTS.md'), 'Preserve working tree.');
  git('add', 'AGENTS.md'); git('commit', '-m', 'fixture');
  return { root, stateRoot: path.join(temp, 'state'), task, dryRun: false, runChecks: pass, git };
}
async function makeFile(work, text = 'result\n') {
  await mkdir(path.join(work, 'docs'), { recursive: true });
  await writeFile(path.join(work, 'docs/result.md'), text);
}
test('rejects traversal, protected files, unknown checks and unlimited retries', () => {
  for (const allowedPaths of [['../x'], ['AGENTS.md'], ['backend/prisma/schema.prisma'], ['docs/../AGENTS.md'], ['docs/.env'], ['docs/.git/config']]) assert.throws(() => validateTask({ ...task, allowedPaths }));
  assert.throws(() => validateTask({ ...task, maxAttempts: 99 }));
  assert.throws(() => validateTask({ ...task, checks: ['deploy'] }));
  assert.throws(() => validateTask({ ...task, allowedPaths: ['lib/foo.dart'] }));
});
test('decisions fail closed', () => {
  assert.throws(() => validateDecision({ decision: 'approved' }));
  assert.throws(() => validateDecision({ ...approved, blockingIssues: ['broken'] }));
});
test('child environment strips service credentials and shell injection variables', () => {
  assert.deepEqual(safeEnv({ PATH: '/bin', DATABASE_URL: 'secret', OPENAI_API_KEY: 'secret', NODE_OPTIONS: '--require evil', GIT_CONFIG_COUNT: '1' }), { PATH: '/bin', CI: '1', GIT_TERMINAL_PROMPT: '0' });
  assert.match(windowsCommand('codex', ["a'b", '$(bad); & bad']), /'a''b' '\$\(bad\); & bad'/);
});
test('dry-run uses no agent and writes no state', async t => {
  const f = await fixture(t);
  const r = await execute({ ...f, dryRun: true, agent: () => assert.fail() });
  assert.equal(r.status, 'DRY_RUN'); assert.equal(f.git('status', '--porcelain'), '');
});
test('dirty source is preserved and refused', async t => {
  const f = await fixture(t); await writeFile(path.join(f.root, 'local.txt'), 'keep');
  await assert.rejects(execute({ ...f, agent: () => assert.fail() }), /Working tree/);
  assert.equal(await readFile(path.join(f.root, 'local.txt'), 'utf8'), 'keep');
});
test('successful flow reviews new files, leaves source unchanged and saves patch', async t => {
  const f = await fixture(t); const roles = [];
  const r = await execute({ ...f, agent: async x => {
    roles.push(x.role);
    if (x.role === 'executor') await makeFile(x.work);
    else assert.match(x.prompt, /\+result/);
    return approved;
  } });
  assert.equal(r.status, 'READY_FOR_REVIEW'); assert.deepEqual(roles, ['executor', 'reviewer']);
  assert.equal(f.git('status', '--porcelain'), '');
  assert.match(await readFile(path.join(r.runDir, 'changes.patch'), 'utf8'), /docs\/result.md/);
  assert.equal(execFileSync('git', ['remote'], { cwd: r.work, encoding: 'utf8' }), '');
});
test('baseline failure never invokes agent', async t => {
  const f = await fixture(t);
  const r = await execute({ ...f, runChecks: async () => ({ passed: false }), agent: () => assert.fail() });
  assert.equal(r.status, 'HUMAN_REQUIRED'); assert.equal(r.attempts, 0);
});
test('failed validation feeds correction and fresh review follows', async t => {
  const f = await fixture(t); let calls = 0; const roles = [];
  const r = await execute({ ...f, runChecks: async () => ({ passed: ++calls !== 2, results: [{ code: calls === 2 ? 1 : 0 }] }), agent: async x => {
    roles.push(x.role);
    if (x.role === 'executor') { if (x.attempt === 2) assert.match(x.prompt, /"code": 1/); await makeFile(x.work); }
    return approved;
  } });
  assert.equal(r.status, 'READY_FOR_REVIEW'); assert.equal(r.attempts, 2);
  assert.deepEqual(roles, ['executor', 'executor', 'reviewer']);
});
test('reviewer rejection is bounded', async t => {
  const f = await fixture(t); let calls = 0;
  const r = await execute({ ...f, agent: async x => { calls++; if (x.role === 'executor') { await makeFile(x.work); return approved; } return { decision: 'FIX_REQUIRED', summary: 'Missing criteria', blockingIssues: ['Fix'] }; } });
  assert.equal(r.status, 'HUMAN_REQUIRED'); assert.equal(calls, 4); assert.equal(r.attempts, 2);
});
test('out of scope edit stops before tests and review', async t => {
  const f = await fixture(t); let checks = 0;
  const r = await execute({ ...f, runChecks: async () => { checks++; return pass(); }, agent: async x => { await writeFile(path.join(x.work, 'AGENTS.md'), 'changed'); return approved; } });
  assert.equal(r.status, 'HUMAN_REQUIRED'); assert.match(r.reason, /fora do escopo/); assert.equal(checks, 1);
});
test('reviewer mutation cannot approve untested code', async t => {
  const f = await fixture(t);
  const r = await execute({ ...f, agent: async x => { await makeFile(x.work, x.role); return approved; } });
  assert.equal(r.status, 'HUMAN_REQUIRED'); assert.match(r.reason, /durante revisão/);
});
test('invalid agent response becomes human decision', async t => {
  const f = await fixture(t); const r = await execute({ ...f, agent: async () => ({}) });
  assert.equal(r.status, 'HUMAN_REQUIRED');
});
test('manual validation remains pending even with approved review', async t => {
  const f = await fixture(t); const r = await execute({ ...f, task: { ...task, requiresManualValidation: true }, agent: async x => { if (x.role === 'executor') await makeFile(x.work); return approved; } });
  assert.equal(r.status, 'HUMAN_REQUIRED'); assert.match(r.reason, /manual/);
});
test('lock rejects simultaneous run and is preserved', async t => {
  const f = await fixture(t); await mkdir(f.stateRoot); const lock = path.join(f.stateRoot, 'run.lock'); await writeFile(lock, 'active');
  await assert.rejects(execute({ ...f, agent: () => assert.fail() }), /lock/);
  assert.equal(await readFile(lock, 'utf8'), 'active');
});
test('timeout terminates command', async () => {
  await assert.rejects(command(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 100 }), /Tempo limite/);
});
test('queue rejects duplicate or unbounded tasks', () => {
  assert.throws(() => validateQueue({ id: 'queue', tasks: [task, task] }), /repetido/);
  assert.throws(() => validateQueue({ id: 'queue', tasks: [task] }), /2 ou 3/);
  assert.throws(() => validateQueue({ id: 'queue', tasks: [task, { ...task, id: 'next', allowedPaths: ['.env'] }] }), /Escopo/);
});
test('queue hands approved patch to next executor and produces cumulative patch', async t => {
  const f = await fixture(t);
  const next = { ...task, id: 'next', prompt: 'Read docs/result.md then create docs/next.md', allowedPaths: ['docs/next.md'] };
  const queue = { id: 'flow', tasks: [task, next] };
  let secondSawFirst = false;
  const r = await executeQueue({ ...f, queue, agent: async x => {
    if (x.role === 'executor' && x.task.id === 'smoke') await makeFile(x.work, 'first\n');
    if (x.role === 'executor' && x.task.id === 'next') {
      secondSawFirst = (await readFile(path.join(x.work, 'docs/result.md'), 'utf8')).replaceAll('\r\n', '\n') === 'first\n';
      await writeFile(path.join(x.work, 'docs/next.md'), 'second\n');
    }
    return approved;
  } });
  assert.equal(r.status, 'READY_FOR_REVIEW', r.reason);
  assert.equal(r.steps.length, 2); assert.equal(secondSawFirst, true);
  const patch = await readFile(path.join(r.runDir, 'changes.patch'), 'utf8');
  assert.match(patch, /docs\/result.md/); assert.match(patch, /docs\/next.md/);
  assert.equal(f.git('status', '--porcelain'), '');
});
test('queue stops after first human decision without starting next task', async t => {
  const f = await fixture(t); let second = false;
  const queue = { id: 'stop', tasks: [task, { ...task, id: 'next', allowedPaths: ['docs/next.md'] }] };
  const r = await executeQueue({ ...f, queue, agent: async x => {
    if (x.task.id === 'next') second = true;
    return { decision: 'HUMAN_REQUIRED', summary: 'Needs product decision', blockingIssues: [] };
  } });
  assert.equal(r.status, 'HUMAN_REQUIRED'); assert.equal(r.steps.length, 1); assert.equal(second, false);
});
test('queue rejects unauthorized changes to inherited file', async t => {
  const f = await fixture(t);
  const queue = { id: 'guard', tasks: [task, { ...task, id: 'next', allowedPaths: ['docs/next.md'] }] };
  const r = await executeQueue({ ...f, queue, agent: async x => {
    if (x.role === 'executor' && x.task.id === 'smoke') await makeFile(x.work, 'first\n');
    if (x.role === 'executor' && x.task.id === 'next') await makeFile(x.work, 'tampered\n');
    return approved;
  } });
  assert.equal(r.status, 'HUMAN_REQUIRED'); assert.equal(r.steps.length, 2);
  assert.match(r.steps[1].reason, /arquivo herdado fora do escopo/);
});
test('queue lock prevents a parallel standalone task', async t => {
  const f = await fixture(t); await mkdir(f.stateRoot);
  await writeFile(path.join(f.stateRoot, 'queue.lock'), 'running');
  await assert.rejects(execute({ ...f, agent: () => assert.fail() }), /fila está ativa/);
});

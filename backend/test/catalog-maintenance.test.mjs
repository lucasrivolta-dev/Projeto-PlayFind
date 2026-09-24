import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  CatalogMaintenanceService,
  InMemoryMaintenanceLock,
  FileMaintenanceLock,
  validateMaintenanceLimits,
  formatCatalogMaintenanceReport,
} from '../dist/modules/sync/catalog-maintenance.service.js';
import { parseCatalogMaintenanceArgs } from '../dist/scripts/catalog-maintenance.js';

test('Test A: mode refresh -> chama somente refresh', async () => {
  let refreshCalled = false;
  let acquisitionCalled = false;
  let passedLimit = 0;

  const service = new CatalogMaintenanceService({
    lock: new InMemoryMaintenanceLock(),
    getCatalogCount: async () => 504,
    refreshRunner: async (opts) => {
      refreshCalled = true;
      passedLimit = opts.limit;
      return {
        requested: opts.limit,
        processed: opts.limit,
        updated: opts.apply ? opts.limit : 0,
        noChange: opts.apply ? 0 : opts.limit,
        failed: 0,
        status: 'PASS',
      };
    },
    acquisitionRunner: async () => {
      acquisitionCalled = true;
      return {
        requested: 10,
        processed: 10,
        inserted: 10,
        skipped: 0,
        ambiguous: 0,
        failed: 0,
        status: 'PASS',
      };
    },
  });

  const report = await service.maintain({
    mode: 'refresh',
    refreshLimit: 25,
  });

  assert.equal(refreshCalled, true);
  assert.equal(acquisitionCalled, false);
  assert.equal(passedLimit, 25);
  assert.equal(report.mode, 'refresh');
  assert.equal(report.maintenanceResult, 'PASS');
  assert.ok(report.refresh !== undefined);
  assert.equal(report.refresh.requested, 25);
  assert.equal(report.acquisition, undefined);
});

test('Test B: mode acquisition -> chama somente acquisition', async () => {
  let refreshCalled = false;
  let acquisitionCalled = false;
  let passedLimit = 0;

  const service = new CatalogMaintenanceService({
    lock: new InMemoryMaintenanceLock(),
    getCatalogCount: async () => 504,
    refreshRunner: async () => {
      refreshCalled = true;
      return {
        requested: 10,
        processed: 10,
        updated: 0,
        noChange: 10,
        failed: 0,
        status: 'PASS',
      };
    },
    acquisitionRunner: async (opts) => {
      acquisitionCalled = true;
      passedLimit = opts.limit;
      return {
        requested: opts.limit,
        processed: opts.limit,
        inserted: opts.apply ? opts.limit : 0,
        skipped: 0,
        ambiguous: 0,
        failed: 0,
        status: 'PASS',
      };
    },
  });

  const report = await service.maintain({
    mode: 'acquisition',
    acquisitionLimit: 15,
  });

  assert.equal(refreshCalled, false);
  assert.equal(acquisitionCalled, true);
  assert.equal(passedLimit, 15);
  assert.equal(report.mode, 'acquisition');
  assert.equal(report.maintenanceResult, 'PASS');
  assert.equal(report.refresh, undefined);
  assert.ok(report.acquisition !== undefined);
  assert.equal(report.acquisition.requested, 15);
});

test('Test C: mode full -> refresh antes de acquisition', async () => {
  const executionOrder = [];

  const service = new CatalogMaintenanceService({
    lock: new InMemoryMaintenanceLock(),
    getCatalogCount: async () => 504,
    refreshRunner: async (opts) => {
      executionOrder.push('refresh');
      return {
        requested: opts.limit,
        processed: opts.limit,
        updated: 0,
        noChange: opts.limit,
        failed: 0,
        status: 'PASS',
      };
    },
    acquisitionRunner: async (opts) => {
      executionOrder.push('acquisition');
      return {
        requested: opts.limit,
        processed: opts.limit,
        inserted: 0,
        skipped: 0,
        ambiguous: 0,
        failed: 0,
        status: 'PASS',
      };
    },
  });

  const report = await service.maintain({
    mode: 'full',
    refreshLimit: 10,
    acquisitionLimit: 10,
  });

  assert.deepEqual(executionOrder, ['refresh', 'acquisition']);
  assert.equal(report.mode, 'full');
  assert.equal(report.maintenanceResult, 'PASS');
  assert.ok(report.refresh !== undefined);
  assert.ok(report.acquisition !== undefined);
});

test('Test D: dry-run -> zero writers (apply: false encaminhado para ambos)', async () => {
  let refreshApply = null;
  let acquisitionApply = null;

  const service = new CatalogMaintenanceService({
    lock: new InMemoryMaintenanceLock(),
    getCatalogCount: async () => 504,
    refreshRunner: async (opts) => {
      refreshApply = opts.apply;
      return {
        requested: opts.limit,
        processed: opts.limit,
        updated: 0,
        noChange: opts.limit,
        failed: 0,
        status: 'PASS',
      };
    },
    acquisitionRunner: async (opts) => {
      acquisitionApply = opts.apply;
      return {
        requested: opts.limit,
        processed: opts.limit,
        inserted: 0,
        skipped: 0,
        ambiguous: 0,
        failed: 0,
        status: 'PASS',
      };
    },
  });

  const report = await service.maintain({
    mode: 'full',
    apply: false,
    refreshLimit: 50,
    acquisitionLimit: 50,
  });

  assert.equal(report.apply, false);
  assert.equal(refreshApply, false);
  assert.equal(acquisitionApply, false);
  assert.equal(report.refresh?.updated, 0);
  assert.equal(report.acquisition?.inserted, 0);
});

test('Test E: apply flag -> encaminhada corretamente', async () => {
  let refreshApply = null;
  let acquisitionApply = null;

  const service = new CatalogMaintenanceService({
    lock: new InMemoryMaintenanceLock(),
    getCatalogCount: async () => 504,
    refreshRunner: async (opts) => {
      refreshApply = opts.apply;
      return {
        requested: opts.limit,
        processed: opts.limit,
        updated: 10,
        noChange: 0,
        failed: 0,
        status: 'PASS',
      };
    },
    acquisitionRunner: async (opts) => {
      acquisitionApply = opts.apply;
      return {
        requested: opts.limit,
        processed: opts.limit,
        inserted: 5,
        skipped: 0,
        ambiguous: 0,
        failed: 0,
        status: 'PASS',
      };
    },
  });

  const report = await service.maintain({
    mode: 'full',
    apply: true,
    refreshLimit: 10,
    acquisitionLimit: 5,
  });

  assert.equal(report.apply, true);
  assert.equal(refreshApply, true);
  assert.equal(acquisitionApply, true);
});

test('Test F: refresh limit 51 -> rejeitado', async () => {
  assert.throws(
    () => {
      validateMaintenanceLimits({
        mode: 'refresh',
        refreshLimit: 51,
      });
    },
    { message: /between 1 and 50/ },
  );

  assert.throws(
    () => {
      validateMaintenanceLimits({
        mode: 'full',
        refreshLimit: 0,
        acquisitionLimit: 10,
      });
    },
    { message: /between 1 and 50/ },
  );
});

test('Test G: acquisition limit 51 -> rejeitado', async () => {
  assert.throws(
    () => {
      validateMaintenanceLimits({
        mode: 'acquisition',
        acquisitionLimit: 51,
      });
    },
    { message: /between 1 and 50/ },
  );

  assert.throws(
    () => {
      validateMaintenanceLimits({
        mode: 'full',
        refreshLimit: 10,
        acquisitionLimit: 100,
      });
    },
    { message: /between 1 and 50/ },
  );
});

test('Test H: lock ativo -> segunda execução rejeitada (zero writes em B)', async () => {
  const sharedLock = new InMemoryMaintenanceLock();
  let bExecuted = false;

  // Session A manually acquires lock
  const acquiredA = await sharedLock.acquire('session-A');
  assert.equal(acquiredA, true);

  const serviceB = new CatalogMaintenanceService({
    lock: sharedLock,
    getCatalogCount: async () => 504,
    refreshRunner: async () => {
      bExecuted = true;
      return { requested: 10, processed: 10, updated: 10, noChange: 0, failed: 0, status: 'PASS' };
    },
  });

  const reportB = await serviceB.maintain({
    mode: 'refresh',
    refreshLimit: 10,
    apply: true,
  });

  assert.equal(bExecuted, false);
  assert.equal(reportB.maintenanceResult, 'FAIL');
  assert.equal(reportB.rejectionReason, 'REJECTED_LOCKED');
  assert.equal(reportB.catalogCountBefore, 504);
  assert.equal(reportB.catalogCountAfter, 504);
  assert.equal(reportB.refresh, undefined);
  assert.equal(reportB.acquisition, undefined);
});

test('Test I: lock liberado -> execução seguinte permitida', async () => {
  const sharedLock = new InMemoryMaintenanceLock();
  let aExecuted = false;
  let bExecuted = false;

  const serviceA = new CatalogMaintenanceService({
    lock: sharedLock,
    getCatalogCount: async () => 504,
    refreshRunner: async () => {
      aExecuted = true;
      return { requested: 10, processed: 10, updated: 0, noChange: 10, failed: 0, status: 'PASS' };
    },
  });

  const serviceB = new CatalogMaintenanceService({
    lock: sharedLock,
    getCatalogCount: async () => 504,
    refreshRunner: async () => {
      bExecuted = true;
      return { requested: 10, processed: 10, updated: 0, noChange: 10, failed: 0, status: 'PASS' };
    },
  });

  // Session A runs and completes (releasing the lock in finally)
  const reportA = await serviceA.maintain({
    mode: 'refresh',
    refreshLimit: 10,
  });

  assert.equal(aExecuted, true);
  assert.equal(reportA.maintenanceResult, 'PASS');

  // Session B runs immediately after Session A
  const reportB = await serviceB.maintain({
    mode: 'refresh',
    refreshLimit: 10,
  });

  assert.equal(bExecuted, true);
  assert.equal(reportB.maintenanceResult, 'PASS');
  assert.equal(reportB.rejectionReason, undefined);
});

test('Test J: refresh structural failure -> acquisition não roda', async () => {
  let acquisitionCalled = false;

  const service = new CatalogMaintenanceService({
    lock: new InMemoryMaintenanceLock(),
    getCatalogCount: async () => 504,
    refreshRunner: async () => {
      throw new Error('Database connection crashed unexpectedly during refresh');
    },
    acquisitionRunner: async () => {
      acquisitionCalled = true;
      return { requested: 10, processed: 10, inserted: 10, skipped: 0, ambiguous: 0, failed: 0, status: 'PASS' };
    },
  });

  const report = await service.maintain({
    mode: 'full',
    refreshLimit: 10,
    acquisitionLimit: 10,
  });

  assert.equal(acquisitionCalled, false);
  assert.equal(report.maintenanceResult, 'FAIL');
  assert.equal(report.refresh?.status, 'FAIL');
  assert.ok(report.refresh?.error?.includes('Database connection crashed'));
  assert.equal(report.acquisition, undefined);
});

test('Test K: candidate-level refresh failure -> acquisition pode seguir', async () => {
  let acquisitionCalled = false;

  const service = new CatalogMaintenanceService({
    lock: new InMemoryMaintenanceLock(),
    getCatalogCount: async () => 504,
    refreshRunner: async () => {
      // 47 candidates succeeded, 3 failed closed (Portal, Batman, Doom)
      return {
        requested: 50,
        processed: 50,
        updated: 47,
        noChange: 0,
        failed: 3,
        status: 'PARTIAL',
      };
    },
    acquisitionRunner: async () => {
      acquisitionCalled = true;
      return {
        requested: 10,
        processed: 10,
        inserted: 10,
        skipped: 0,
        ambiguous: 0,
        failed: 0,
        status: 'PASS',
      };
    },
  });

  const report = await service.maintain({
    mode: 'full',
    refreshLimit: 50,
    acquisitionLimit: 10,
  });

  assert.equal(acquisitionCalled, true);
  assert.equal(report.maintenanceResult, 'PARTIAL');
  assert.equal(report.refresh?.failed, 3);
  assert.equal(report.refresh?.updated, 47);
  assert.equal(report.acquisition?.inserted, 10);
});

test('Test L: acquisition stop-on-first-failure permanece', async () => {
  const service = new CatalogMaintenanceService({
    lock: new InMemoryMaintenanceLock(),
    getCatalogCount: async () => 504,
    acquisitionRunner: async () => {
      return {
        requested: 25,
        processed: 5,
        inserted: 4,
        skipped: 0,
        ambiguous: 0,
        failed: 1,
        status: 'PARTIAL',
      };
    },
  });

  const report = await service.maintain({
    mode: 'acquisition',
    acquisitionLimit: 25,
  });

  assert.equal(report.maintenanceResult, 'PARTIAL');
  assert.equal(report.acquisition?.requested, 25);
  assert.equal(report.acquisition?.processed, 5);
  assert.equal(report.acquisition?.inserted, 4);
  assert.equal(report.acquisition?.failed, 1);
});

test('Test M: catalog counts agregados corretamente', async () => {
  let currentCount = 504;

  const service = new CatalogMaintenanceService({
    lock: new InMemoryMaintenanceLock(),
    getCatalogCount: async () => currentCount,
    acquisitionRunner: async (opts) => {
      if (opts.apply) {
        currentCount += 10;
      }
      return {
        requested: opts.limit,
        processed: opts.limit,
        inserted: opts.apply ? 10 : 0,
        skipped: 0,
        ambiguous: 0,
        failed: 0,
        status: 'PASS',
      };
    },
  });

  const report = await service.maintain({
    mode: 'acquisition',
    acquisitionLimit: 10,
    apply: true,
  });

  assert.equal(report.catalogCountBefore, 504);
  assert.equal(report.catalogCountAfter, 514);
});

test('Test N: sessionId único', async () => {
  const service = new CatalogMaintenanceService({
    lock: new InMemoryMaintenanceLock(),
    getCatalogCount: async () => 504,
    refreshRunner: async (opts) => ({
      requested: opts.limit,
      processed: opts.limit,
      updated: 0,
      noChange: opts.limit,
      failed: 0,
      status: 'PASS',
    }),
  });

  const report1 = await service.maintain({ mode: 'refresh', refreshLimit: 5 });
  const report2 = await service.maintain({ mode: 'refresh', refreshLimit: 5 });

  assert.notEqual(report1.sessionId, report2.sessionId);
  assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(report1.sessionId));
  assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(report2.sessionId));
});

test('Test O: relatório combinado determinístico', () => {
  const mockReport = {
    sessionId: 'test-session-123',
    mode: 'full',
    apply: false,
    startedAt: '2026-09-24T00:00:00.000Z',
    finishedAt: '2026-09-24T00:01:00.000Z',
    catalogCountBefore: 504,
    catalogCountAfter: 504,
    refresh: {
      requested: 50,
      processed: 50,
      updated: 0,
      noChange: 47,
      failed: 3,
      status: 'PARTIAL',
    },
    acquisition: {
      requested: 50,
      processed: 50,
      inserted: 0,
      skipped: 5,
      ambiguous: 0,
      failed: 0,
      status: 'PASS',
    },
    maintenanceResult: 'PARTIAL',
  };

  const formatted = formatCatalogMaintenanceReport(mockReport);
  assert.ok(formatted.includes('sessionId:          test-session-123'));
  assert.ok(formatted.includes('mode:               full'));
  assert.ok(formatted.includes('apply:              NO (DRY-RUN)'));
  assert.ok(formatted.includes('catalogCountBefore: 504'));
  assert.ok(formatted.includes('catalogCountAfter:  504'));
  assert.ok(formatted.includes('REFRESH (PARTIAL):'));
  assert.ok(formatted.includes('requested: 50'));
  assert.ok(formatted.includes('failed:    3'));
  assert.ok(formatted.includes('ACQUISITION (PASS):'));
  assert.ok(formatted.includes('skipped:   5'));
  assert.ok(formatted.includes('maintenanceResult:  PARTIAL'));
});

test('Test P: CLI arguments parsing', () => {
  const fullArgs = parseCatalogMaintenanceArgs([
    '--mode', 'full',
    '--refresh-limit', '50',
    '--acquisition-limit', '25',
    '--snapshot', 'reports/audited.json',
  ]);
  assert.equal(fullArgs.mode, 'full');
  assert.equal(fullArgs.apply, false);
  assert.equal(fullArgs.refreshLimit, 50);
  assert.equal(fullArgs.acquisitionLimit, 25);
  assert.equal(fullArgs.snapshotPath, 'reports/audited.json');

  const applyArgs = parseCatalogMaintenanceArgs([
    '--mode', 'refresh',
    '--refresh-limit', '10',
    '--apply',
  ]);
  assert.equal(applyArgs.mode, 'refresh');
  assert.equal(applyArgs.apply, true);
  assert.equal(applyArgs.refreshLimit, 10);

  // Missing mode throws
  assert.throws(() => parseCatalogMaintenanceArgs(['--refresh-limit', '10']), {
    message: /requer argumento explícito --mode/,
  });

  // Invalid mode throws
  assert.throws(() => parseCatalogMaintenanceArgs(['--mode', 'unknown']), {
    message: /modo inválido/,
  });

  // Limit 51 throws
  assert.throws(() => parseCatalogMaintenanceArgs(['--mode', 'refresh', '--refresh-limit', '51']), {
    message: /between 1 and 50/,
  });

  // Duplicate argument throws
  assert.throws(() => parseCatalogMaintenanceArgs(['--mode', 'refresh', '--mode', 'full']), {
    message: /duplicado/,
  });
});

test('Test Q: FileMaintenanceLock concorrência e liberação', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'np-maintenance-lock-'));
  const lockFilePath = path.join(tempDir, '.maintenance.lock');

  try {
    const lock1 = new FileMaintenanceLock({ lockFilePath });
    const lock2 = new FileMaintenanceLock({ lockFilePath });

    // Lock 1 acquires
    const acq1 = await lock1.acquire('session-1');
    assert.equal(acq1, true);

    // Lock 2 tries to acquire while lock 1 is active -> fails
    const acq2 = await lock2.acquire('session-2');
    assert.equal(acq2, false);

    // Lock 1 releases
    await lock1.release('session-1');

    // Now Lock 2 can acquire
    const acq3 = await lock2.acquire('session-2');
    assert.equal(acq3, true);

    await lock2.release('session-2');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';

export const CATALOG_MAINTENANCE_MIN_LIMIT = 1;
export const CATALOG_MAINTENANCE_MAX_LIMIT = 50;

export type MaintenanceMode = 'acquisition' | 'refresh' | 'full';
export type MaintenanceResult = 'PASS' | 'PARTIAL' | 'FAIL';

export interface MaintenanceRefreshSummary {
  requested: number;
  processed: number;
  updated: number;
  noChange: number;
  failed: number;
  status: 'PASS' | 'PARTIAL' | 'FAIL';
  error?: string;
}

export interface MaintenanceAcquisitionSummary {
  requested: number;
  processed: number;
  inserted: number;
  skipped: number;
  ambiguous: number;
  failed: number;
  status: 'PASS' | 'PARTIAL' | 'FAIL';
  error?: string;
}

export interface CatalogMaintenanceOptions {
  mode: MaintenanceMode;
  apply?: boolean;
  refreshLimit?: number;
  acquisitionLimit?: number;
  snapshotPath?: string;
  sessionId?: string;
}

export interface CatalogMaintenanceReport {
  sessionId: string;
  mode: MaintenanceMode;
  apply: boolean;
  startedAt: string;
  finishedAt: string;
  catalogCountBefore: number;
  catalogCountAfter: number;
  refresh?: MaintenanceRefreshSummary;
  acquisition?: MaintenanceAcquisitionSummary;
  maintenanceResult: MaintenanceResult;
  rejectionReason?: string;
  error?: string;
}

export interface MaintenanceLock {
  acquire(sessionId: string): Promise<boolean>;
  release(sessionId: string): Promise<void>;
  getStatus?(): Promise<{ isLocked: boolean; currentSessionId?: string }>;
}

export class InMemoryMaintenanceLock implements MaintenanceLock {
  private currentSessionId: string | null = null;
  private lockedAt: Date | null = null;

  async acquire(sessionId: string): Promise<boolean> {
    if (this.currentSessionId !== null) {
      return false;
    }
    this.currentSessionId = sessionId;
    this.lockedAt = new Date();
    return true;
  }

  async release(sessionId: string): Promise<void> {
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
      this.lockedAt = null;
    }
  }

  async getStatus(): Promise<{ isLocked: boolean; currentSessionId?: string; lockedAt?: Date }> {
    return {
      isLocked: this.currentSessionId !== null,
      currentSessionId: this.currentSessionId ?? undefined,
      lockedAt: this.lockedAt ?? undefined,
    };
  }
}

export class FileMaintenanceLock implements MaintenanceLock {
  private readonly lockFilePath: string;
  private readonly staleTimeoutMs: number;

  constructor(options?: { lockFilePath?: string; staleTimeoutMs?: number }) {
    this.lockFilePath =
      options?.lockFilePath ?? path.resolve(process.cwd(), '.catalog-maintenance.lock');
    this.staleTimeoutMs = options?.staleTimeoutMs ?? 60 * 60 * 1000;
  }

  async acquire(sessionId: string): Promise<boolean> {
    const payload = JSON.stringify({
      sessionId,
      lockedAt: new Date().toISOString(),
      pid: process.pid,
    });

    try {
      await fs.promises.writeFile(this.lockFilePath, payload, { flag: 'wx' });
      return true;
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        try {
          const content = await fs.promises.readFile(this.lockFilePath, 'utf-8');
          const data = JSON.parse(content);
          const lockTime = new Date(data.lockedAt).getTime();
          if (Date.now() - lockTime > this.staleTimeoutMs) {
            await fs.promises.unlink(this.lockFilePath).catch(() => {});
            await fs.promises.writeFile(this.lockFilePath, payload, { flag: 'wx' });
            return true;
          }
        } catch {
          // Ignore parse errors, leave lock held
        }
        return false;
      }
      throw err;
    }
  }

  async release(sessionId: string): Promise<void> {
    try {
      const content = await fs.promises.readFile(this.lockFilePath, 'utf-8');
      const data = JSON.parse(content);
      if (data.sessionId === sessionId) {
        await fs.promises.unlink(this.lockFilePath).catch(() => {});
      }
    } catch {
      // Ignore if file doesn't exist
    }
  }

  async getStatus(): Promise<{ isLocked: boolean; currentSessionId?: string }> {
    try {
      const content = await fs.promises.readFile(this.lockFilePath, 'utf-8');
      const data = JSON.parse(content);
      return { isLocked: true, currentSessionId: data.sessionId };
    } catch {
      return { isLocked: false };
    }
  }
}

export class PostgresAdvisoryLock implements MaintenanceLock {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly lockKey: number = 849204820,
  ) {}

  async acquire(_sessionId: string): Promise<boolean> {
    try {
      const res: any = await this.prisma.$queryRawUnsafe(
        `SELECT pg_try_advisory_lock(${this.lockKey}) as acquired`,
      );
      return Boolean(res?.[0]?.acquired);
    } catch {
      return false;
    }
  }

  async release(_sessionId: string): Promise<void> {
    try {
      await this.prisma.$queryRawUnsafe(`SELECT pg_advisory_unlock(${this.lockKey}) as released`);
    } catch {}
  }
}

export function validateMaintenanceLimits(options: {
  mode: MaintenanceMode;
  refreshLimit?: number;
  acquisitionLimit?: number;
}): void {
  if (options.refreshLimit !== undefined) {
    if (
      !Number.isSafeInteger(options.refreshLimit) ||
      options.refreshLimit < CATALOG_MAINTENANCE_MIN_LIMIT ||
      options.refreshLimit > CATALOG_MAINTENANCE_MAX_LIMIT
    ) {
      throw new Error(
        `Refresh limit must be an integer between ${CATALOG_MAINTENANCE_MIN_LIMIT} and ${CATALOG_MAINTENANCE_MAX_LIMIT}. Received: ${options.refreshLimit}`,
      );
    }
  }

  if (options.acquisitionLimit !== undefined) {
    if (
      !Number.isSafeInteger(options.acquisitionLimit) ||
      options.acquisitionLimit < CATALOG_MAINTENANCE_MIN_LIMIT ||
      options.acquisitionLimit > CATALOG_MAINTENANCE_MAX_LIMIT
    ) {
      throw new Error(
        `Acquisition limit must be an integer between ${CATALOG_MAINTENANCE_MIN_LIMIT} and ${CATALOG_MAINTENANCE_MAX_LIMIT}. Received: ${options.acquisitionLimit}`,
      );
    }
  }

  if (options.mode === 'refresh' || options.mode === 'full') {
    if (options.refreshLimit === undefined) {
      throw new Error(`Refresh limit is required for mode "${options.mode}".`);
    }
  }

  if (options.mode === 'acquisition' || options.mode === 'full') {
    if (options.acquisitionLimit === undefined) {
      throw new Error(`Acquisition limit is required for mode "${options.mode}".`);
    }
  }
}

export interface CatalogMaintenanceDependencies {
  lock?: MaintenanceLock;
  prisma?: PrismaClient;
  getCatalogCount?: () => Promise<number>;
  refreshRunner?: (options: {
    limit: number;
    apply: boolean;
  }) => Promise<MaintenanceRefreshSummary>;
  acquisitionRunner?: (options: {
    limit: number;
    apply: boolean;
    snapshotPath?: string;
  }) => Promise<MaintenanceAcquisitionSummary>;
  log?: (message: string) => void;
}

export class CatalogMaintenanceService {
  constructor(private readonly dependencies: CatalogMaintenanceDependencies = {}) {}

  private async getCatalogCount(): Promise<number> {
    if (this.dependencies.getCatalogCount) {
      return await this.dependencies.getCatalogCount();
    }
    if (this.dependencies.prisma) {
      return await this.dependencies.prisma.game.count();
    }
    return 0;
  }

  private async runRefresh(options: {
    limit: number;
    apply: boolean;
  }): Promise<MaintenanceRefreshSummary> {
    if (this.dependencies.refreshRunner) {
      return await this.dependencies.refreshRunner(options);
    }
    throw new Error('No refreshRunner configured for CatalogMaintenanceService.');
  }

  private async runAcquisition(options: {
    limit: number;
    apply: boolean;
    snapshotPath?: string;
  }): Promise<MaintenanceAcquisitionSummary> {
    if (this.dependencies.acquisitionRunner) {
      return await this.dependencies.acquisitionRunner(options);
    }
    throw new Error('No acquisitionRunner configured for CatalogMaintenanceService.');
  }

  /**
   * Executes or plans catalog maintenance orchestrating Refresh and Acquisition.
   * Ensures single-session lock, failure isolation, and unified reporting.
   */
  async maintain(options: CatalogMaintenanceOptions): Promise<CatalogMaintenanceReport> {
    validateMaintenanceLimits(options);

    const sessionId = options.sessionId ?? randomUUID();
    const startedAt = new Date();
    const apply = Boolean(options.apply);
    const lock = this.dependencies.lock ?? new FileMaintenanceLock();

    const acquired = await lock.acquire(sessionId);
    if (!acquired) {
      const count = await this.getCatalogCount();
      return {
        sessionId,
        mode: options.mode,
        apply,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        catalogCountBefore: count,
        catalogCountAfter: count,
        maintenanceResult: 'FAIL',
        rejectionReason: 'REJECTED_LOCKED',
      };
    }

    try {
      const catalogCountBefore = await this.getCatalogCount();
      let refreshSummary: MaintenanceRefreshSummary | undefined;
      let acquisitionSummary: MaintenanceAcquisitionSummary | undefined;
      let refreshStructuralFailure = false;

      // STEP 1: REFRESH (for mode 'refresh' or 'full')
      if (options.mode === 'refresh' || options.mode === 'full') {
        try {
          refreshSummary = await this.runRefresh({
            limit: options.refreshLimit!,
            apply,
          });
        } catch (err: any) {
          refreshStructuralFailure = true;
          refreshSummary = {
            requested: options.refreshLimit!,
            processed: 0,
            updated: 0,
            noChange: 0,
            failed: options.refreshLimit!,
            status: 'FAIL',
            error: err.message ?? String(err),
          };
        }
      }

      // STEP 2: ACQUISITION (for mode 'acquisition' or 'full' without structural refresh failure)
      if (options.mode === 'acquisition' || (options.mode === 'full' && !refreshStructuralFailure)) {
        try {
          acquisitionSummary = await this.runAcquisition({
            limit: options.acquisitionLimit!,
            apply,
            snapshotPath: options.snapshotPath,
          });
        } catch (err: any) {
          acquisitionSummary = {
            requested: options.acquisitionLimit!,
            processed: 0,
            inserted: 0,
            skipped: 0,
            ambiguous: 0,
            failed: options.acquisitionLimit!,
            status: 'FAIL',
            error: err.message ?? String(err),
          };
        }
      }

      const catalogCountAfter = await this.getCatalogCount();
      const finishedAt = new Date();

      // Determine combined maintenanceResult: PASS | PARTIAL | FAIL
      let maintenanceResult: MaintenanceResult = 'PASS';

      if (refreshStructuralFailure) {
        maintenanceResult = 'FAIL';
      } else {
        const refreshFailed = (refreshSummary?.failed ?? 0) > 0;
        const acqFailed = (acquisitionSummary?.failed ?? 0) > 0;
        const acqPartial = acquisitionSummary?.status === 'PARTIAL';
        const acqFail = acquisitionSummary?.status === 'FAIL';
        const refreshFail = refreshSummary?.status === 'FAIL';

        if (
          (options.mode === 'full' && refreshFail && acqFail) ||
          (options.mode === 'refresh' && refreshFail) ||
          (options.mode === 'acquisition' && acqFail)
        ) {
          maintenanceResult = 'FAIL';
        } else if (refreshFailed || acqFailed || acqPartial || acqFail || refreshFail) {
          maintenanceResult = 'PARTIAL';
        } else {
          maintenanceResult = 'PASS';
        }
      }

      return {
        sessionId,
        mode: options.mode,
        apply,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        catalogCountBefore,
        catalogCountAfter,
        refresh: refreshSummary,
        acquisition: acquisitionSummary,
        maintenanceResult,
      };
    } finally {
      await lock.release(sessionId);
    }
  }
}

export function formatCatalogMaintenanceReport(report: CatalogMaintenanceReport): string {
  const lines: string[] = [];
  lines.push('='.repeat(80));
  lines.push(`NEXTPLAY — CATALOG MAINTENANCE REPORT [${report.maintenanceResult}]`);
  lines.push('='.repeat(80));
  lines.push(`sessionId:          ${report.sessionId}`);
  lines.push(`mode:               ${report.mode}`);
  lines.push(`apply:              ${report.apply ? 'YES (LIVE WRITES)' : 'NO (DRY-RUN)'}`);
  lines.push(`startedAt:          ${report.startedAt}`);
  lines.push(`finishedAt:         ${report.finishedAt}`);
  lines.push(`catalogCountBefore: ${report.catalogCountBefore}`);
  lines.push(`catalogCountAfter:  ${report.catalogCountAfter}`);
  lines.push(`maintenanceResult:  ${report.maintenanceResult}`);
  if (report.rejectionReason) {
    lines.push(`rejectionReason:    ${report.rejectionReason}`);
  }
  if (report.error) {
    lines.push(`error:              ${report.error}`);
  }

  if (report.refresh) {
    lines.push('-'.repeat(80));
    lines.push(`REFRESH (${report.refresh.status}):`);
    lines.push(`  requested: ${report.refresh.requested}`);
    lines.push(`  processed: ${report.refresh.processed}`);
    lines.push(`  updated:   ${report.refresh.updated}`);
    lines.push(`  noChange:  ${report.refresh.noChange}`);
    lines.push(`  failed:    ${report.refresh.failed}`);
    if (report.refresh.error) {
      lines.push(`  error:     ${report.refresh.error}`);
    }
  }

  if (report.acquisition) {
    lines.push('-'.repeat(80));
    lines.push(`ACQUISITION (${report.acquisition.status}):`);
    lines.push(`  requested: ${report.acquisition.requested}`);
    lines.push(`  processed: ${report.acquisition.processed}`);
    lines.push(`  inserted:  ${report.acquisition.inserted}`);
    lines.push(`  skipped:   ${report.acquisition.skipped}`);
    lines.push(`  ambiguous: ${report.acquisition.ambiguous}`);
    lines.push(`  failed:    ${report.acquisition.failed}`);
    if (report.acquisition.error) {
      lines.push(`  error:     ${report.acquisition.error}`);
    }
  }

  lines.push('='.repeat(80));
  return lines.join('\n');
}

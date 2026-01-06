/**
 * Fetch Run Tracker - Observability for all data fetches
 * 
 * Every fetch MUST create a FetchRun record for tracking:
 * - When it started/finished
 * - How many rows inserted/updated/failed
 * - Error messages if any
 */

import { prisma } from './db';

export interface FetchRunParams {
  source: 'metal' | 'sge' | 'fx' | 'comex_stock' | 'comex_price' | 'retail' | 'backfill';
  triggeredBy?: 'cron' | 'manual' | 'ui';
  params?: Record<string, any>;
}

export class FetchRunTracker {
  private runId: string | null = null;
  private source: string;
  private triggeredBy: string;
  private params: any;
  
  constructor(config: FetchRunParams) {
    this.source = config.source;
    this.triggeredBy = config.triggeredBy || 'manual';
    this.params = config.params || {};
  }

  /**
   * Start tracking - creates fetch_run record with status=RUNNING
   */
  async start(): Promise<string> {
    try {
      const run = await prisma.fetchRun.create({
        data: {
          source: this.source,
          status: 'RUNNING',
          triggeredBy: this.triggeredBy,
          params: this.params,
          inserted: 0,
          updated: 0,
          failed: 0,
        },
      });
      
      this.runId = run.id;
      console.log(`[FETCH_RUN_START] ${this.source} run_id=${this.runId}`);
      return this.runId;
    } catch (error) {
      console.error('[FETCH_RUN_START_ERROR]', error);
      // Don't fail entire fetch if tracking fails
      return 'unknown';
    }
  }

  /**
   * Update counts during fetch
   */
  async updateCounts(counts: { inserted?: number; updated?: number; failed?: number }) {
    if (!this.runId) return;

    try {
      await prisma.fetchRun.update({
        where: { id: this.runId },
        data: {
          inserted: counts.inserted || 0,
          updated: counts.updated || 0,
          failed: counts.failed || 0,
        },
      });
    } catch (error) {
      console.error('[FETCH_RUN_UPDATE_ERROR]', error);
    }
  }

  /**
   * Mark as successful
   */
  async success(counts: { inserted: number; updated: number; failed?: number }, sampleUrl?: string) {
    if (!this.runId) return;

    try {
      await prisma.fetchRun.update({
        where: { id: this.runId },
        data: {
          status: counts.failed && counts.failed > 0 ? 'PARTIAL' : 'OK',
          finishedAt: new Date(),
          inserted: counts.inserted,
          updated: counts.updated,
          failed: counts.failed || 0,
          sampleUrl: sampleUrl || null,
        },
      });
      
      console.log(`[FETCH_RUN_OK] ${this.source} run_id=${this.runId} inserted=${counts.inserted} updated=${counts.updated}`);
    } catch (error) {
      console.error('[FETCH_RUN_SUCCESS_ERROR]', error);
    }
  }

  /**
   * Mark as failed
   */
  async fail(error: Error | string, counts?: { inserted?: number; updated?: number; failed?: number }) {
    if (!this.runId) return;

    const errorMessage = error instanceof Error ? error.message : String(error);

    try {
      await prisma.fetchRun.update({
        where: { id: this.runId },
        data: {
          status: 'ERROR',
          finishedAt: new Date(),
          errorMessage: errorMessage.substring(0, 1000), // Limit length
          inserted: counts?.inserted || 0,
          updated: counts?.updated || 0,
          failed: counts?.failed || 0,
        },
      });
      
      console.error(`[FETCH_RUN_ERROR] ${this.source} run_id=${this.runId} error="${errorMessage}"`);
    } catch (err) {
      console.error('[FETCH_RUN_FAIL_ERROR]', err);
    }
  }
}

/**
 * Convenience function for simple one-shot tracking
 */
export async function trackFetchRun<T>(
  config: FetchRunParams,
  fn: () => Promise<{ inserted: number; updated: number; sampleUrl?: string }>
): Promise<{ ok: boolean; inserted: number; updated: number; error?: string }> {
  const tracker = new FetchRunTracker(config);
  await tracker.start();

  try {
    const result = await fn();
    await tracker.success(result, result.sampleUrl);
    return { ok: true, inserted: result.inserted, updated: result.updated };
  } catch (error) {
    await tracker.fail(error as Error);
    return { 
      ok: false, 
      inserted: 0, 
      updated: 0, 
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Result types for resilient data fetching
 * Follows "no throw" principle - always return structured result
 */

export type SourceStatus = 'ok' | 'stale' | 'unavailable';

export interface SourceResult<T> {
  status: SourceStatus;
  value?: T;
  asOf?: Date;
  message?: string;
  source: string;
  error?: string;
}

export interface FetchAttempt {
  source: string;
  status: SourceStatus;
  timestamp: Date;
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Creates a successful result
 */
export function ok<T>(source: string, value: T, asOf: Date = new Date()): SourceResult<T> {
  return {
    status: 'ok',
    value,
    asOf,
    source,
  };
}

/**
 * Creates a stale result (using old data)
 */
export function stale<T>(source: string, value: T, asOf: Date, message: string): SourceResult<T> {
  return {
    status: 'stale',
    value,
    asOf,
    source,
    message,
  };
}

/**
 * Creates an unavailable result (no data)
 */
export function unavailable<T>(source: string, message: string, error?: string): SourceResult<T> {
  return {
    status: 'unavailable',
    source,
    message,
    error,
  };
}

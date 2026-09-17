/**
 * The turn-stall limits only work as an ordered chain: the runtime must report
 * a stall before the layer above it drops the connection, and the local gateway
 * cap must stay above the runtime's own duration limit. That ordering used to
 * live in comments, where one edit could silently invert it.
 */
import { expect, test } from 'vitest';

import { AISPHERE_GATEWAY_REQUEST_TIMEOUT_MS } from '../../aisphere/gateway';
import { PI_TURN_STALL_LIMITS, PI_TURN_STALL_UPSTREAM_LIMIT_MS } from './piTurnStallWatchdog';

test('reports a silent turn before the upstream caps the stream', () => {
  expect(PI_TURN_STALL_LIMITS.idleMs).toBeLessThan(PI_TURN_STALL_UPSTREAM_LIMIT_MS);
});

test('keeps the gateway cap above the runtime duration limit', () => {
  expect(PI_TURN_STALL_LIMITS.durationMs).toBeLessThan(AISPHERE_GATEWAY_REQUEST_TIMEOUT_MS);
});

test('checks often enough to hold the idle margin', () => {
  expect(PI_TURN_STALL_LIMITS.tickMs).toBeLessThan(PI_TURN_STALL_LIMITS.idleMs);
  expect(PI_TURN_STALL_LIMITS.settleGraceMs).toBeLessThan(PI_TURN_STALL_LIMITS.idleMs);
});

test('keeps the idle limit below the duration limit', () => {
  expect(PI_TURN_STALL_LIMITS.idleMs).toBeLessThan(PI_TURN_STALL_LIMITS.durationMs);
});

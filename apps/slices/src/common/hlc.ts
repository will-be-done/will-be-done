export type HlcTimestamp = string;

export interface HlcParts {
  physical: number;
  logical: number;
  actorId: string;
}

const PHYSICAL_WIDTH = 16;
const LOGICAL_WIDTH = 8;
const MAX_LOGICAL = 10 ** LOGICAL_WIDTH - 1;

const assertNonNegativeSafeInteger = (value: number, name: string) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`);
  }
};

export const formatHlc = ({
  physical,
  logical,
  actorId,
}: HlcParts): HlcTimestamp => {
  assertNonNegativeSafeInteger(physical, "HLC physical time");
  assertNonNegativeSafeInteger(logical, "HLC logical counter");
  if (logical > MAX_LOGICAL) {
    throw new Error("HLC logical counter exceeds its encoded width");
  }
  if (actorId.length === 0) {
    throw new Error("HLC actor id cannot be empty");
  }

  return `${physical.toString().padStart(PHYSICAL_WIDTH, "0")}-${logical
    .toString()
    .padStart(LOGICAL_WIDTH, "0")}-${actorId}`;
};

export const parseHlc = (timestamp: HlcTimestamp): HlcParts => {
  const firstSeparator = timestamp.indexOf("-");
  const secondSeparator = timestamp.indexOf("-", firstSeparator + 1);
  if (firstSeparator <= 0 || secondSeparator <= firstSeparator + 1) {
    throw new Error(`Invalid HLC timestamp: ${timestamp}`);
  }

  const physical = Number(timestamp.slice(0, firstSeparator));
  const logical = Number(timestamp.slice(firstSeparator + 1, secondSeparator));
  const actorId = timestamp.slice(secondSeparator + 1);
  assertNonNegativeSafeInteger(physical, "HLC physical time");
  assertNonNegativeSafeInteger(logical, "HLC logical counter");
  if (actorId.length === 0) {
    throw new Error(`Invalid HLC timestamp: ${timestamp}`);
  }

  return { physical, logical, actorId };
};

export const canonicalizeHlc = (timestamp: HlcTimestamp): HlcTimestamp =>
  formatHlc(parseHlc(timestamp));

export const compareHlc = (left: HlcTimestamp, right: HlcTimestamp): number => {
  const a = parseHlc(left);
  const b = parseHlc(right);

  if (a.physical !== b.physical) return a.physical < b.physical ? -1 : 1;
  if (a.logical !== b.logical) return a.logical < b.logical ? -1 : 1;
  return a.actorId < b.actorId ? -1 : a.actorId > b.actorId ? 1 : 0;
};

export const maxHlc = (
  timestamps: Iterable<HlcTimestamp | null | undefined>,
): HlcTimestamp | undefined => {
  let result: HlcTimestamp | undefined;
  for (const timestamp of timestamps) {
    if (timestamp == null || timestamp === "") continue;
    if (result === undefined || compareHlc(timestamp, result) > 0) {
      result = timestamp;
    }
  }
  return result;
};

export const nextHlc = ({
  actorId,
  now = Date.now(),
  local,
  observed,
}: {
  actorId: string;
  now?: number;
  local?: HlcTimestamp | null;
  observed?: Iterable<HlcTimestamp | null | undefined>;
}): HlcTimestamp => {
  assertNonNegativeSafeInteger(now, "HLC wall time");
  const remote = maxHlc(observed ?? []);
  const localParts = local ? parseHlc(local) : undefined;
  const remoteParts = remote ? parseHlc(remote) : undefined;
  let physical = Math.max(
    now,
    localParts?.physical ?? 0,
    remoteParts?.physical ?? 0,
  );

  let logical: number;
  const localMatches = localParts?.physical === physical;
  const remoteMatches = remoteParts?.physical === physical;
  if (localMatches && remoteMatches) {
    logical = Math.max(localParts.logical, remoteParts.logical) + 1;
  } else if (localMatches) {
    logical = localParts.logical + 1;
  } else if (remoteMatches) {
    logical = remoteParts.logical + 1;
  } else {
    logical = 0;
  }

  if (logical > MAX_LOGICAL) {
    physical += 1;
    logical = 0;
  }

  return formatHlc({ physical, logical, actorId });
};

export const observedChangeClocks = (change: {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  changes: Record<string, string>;
}): HlcTimestamp[] => [
  change.createdAt,
  change.updatedAt,
  ...(change.deletedAt === null ? [] : [change.deletedAt]),
  ...Object.values(change.changes),
];

export type HlcClock = (() => HlcTimestamp) & {
  observe: (timestamps: Iterable<HlcTimestamp | null | undefined>) => void;
  calibrate: (serverTimeMs: number) => void;
  current: () => HlcTimestamp | undefined;
};

export type HlcTimeSource = {
  wallTime?: () => number;
  monotonicTime?: () => number;
};

/**
 * Process-local HLC state. Call `observe` before producing a timestamp for a
 * merge so the resulting clock is causally after every received value. A
 * server-time calibration anchors future physical time to a monotonic timer;
 * it never lowers `local` or rewrites an existing timestamp.
 */
export const createHlcClock = (
  actorId: string,
  initial?: HlcTimestamp | null,
  timeSource: HlcTimeSource = {},
): HlcClock => {
  const wallTime = timeSource.wallTime ?? Date.now;
  const monotonicTime = timeSource.monotonicTime ?? (() => performance.now());
  let local = initial ? canonicalizeHlc(initial) : undefined;
  let calibration:
    | { serverTimeMs: number; monotonicTimeMs: number }
    | undefined;
  const calibratedWallTime = () => {
    if (!calibration) return wallTime();
    const elapsed = Math.max(0, monotonicTime() - calibration.monotonicTimeMs);
    return Math.floor(calibration.serverTimeMs + elapsed);
  };
  const clock = (() => {
    local = nextHlc({ actorId, local, now: calibratedWallTime() });
    return local;
  }) as HlcClock;
  clock.observe = (timestamps) => {
    const observed = maxHlc(timestamps);
    if (observed && (!local || compareHlc(observed, local) > 0)) {
      local = canonicalizeHlc(observed);
    }
  };
  clock.calibrate = (serverTimeMs) => {
    assertNonNegativeSafeInteger(serverTimeMs, "HLC server time");
    const monotonicTimeMs = monotonicTime();
    if (!Number.isFinite(monotonicTimeMs) || monotonicTimeMs < 0) {
      throw new Error("HLC monotonic time must be a non-negative number");
    }
    calibration = { serverTimeMs, monotonicTimeMs };
  };
  clock.current = () => local;
  return clock;
};

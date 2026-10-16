import { describe, expect, it } from 'vitest';
import { deriveGeofenceTransition, haversineMeters } from '../geo.js';

describe('haversineMeters', () => {
  it('returns ~0 for the same point', () => {
    expect(haversineMeters(40.7128, -74.006, 40.7128, -74.006)).toBeCloseTo(0, 3);
  });

  it('matches a known distance (NYC to LA, ~3936km)', () => {
    const meters = haversineMeters(40.7128, -74.006, 34.0522, -118.2437);
    expect(meters / 1000).toBeCloseTo(3936, -1);
  });
});

describe('deriveGeofenceTransition (11.35 fix: state tracked independent of alert_on)', () => {
  it('returns undefined (dedup) when isInside matches wasInside', () => {
    expect(
      deriveGeofenceTransition({ isInside: true, wasInside: true, alertOn: 'both' })
    ).toBeUndefined();
  });

  it("alert_on='both': every real transition both changes state and persists", () => {
    const entered = deriveGeofenceTransition({ isInside: true, wasInside: false, alertOn: 'both' });
    expect(entered).toEqual({ stateChanged: true, eventType: 'enter', shouldPersist: true });

    const exited = deriveGeofenceTransition({ isInside: false, wasInside: true, alertOn: 'both' });
    expect(exited).toEqual({ stateChanged: true, eventType: 'exit', shouldPersist: true });
  });

  it("a bare exit with no prior history is just the dedup case (wasInside is false by convention when there's no history)", () => {
    // hasPriorEvent=false implies the caller passes wasInside=false (Laravel's
    // own "no history = treated as outside" convention) — isInside=false then
    // matches wasInside=false, so this is dedup, not a transition at all.
    // (Laravel's own equivalent guard for this exact case is unreachable
    // dead code — see the doc comment on `deriveGeofenceTransition`.)
    expect(
      deriveGeofenceTransition({ isInside: false, wasInside: false, alertOn: 'both' })
    ).toBeUndefined();
  });

  it("11.35 FIX: alert_on='exit' correctly tracks an enter->exit->enter->exit cycle (Laravel never logs anything at all here)", () => {
    // Visit 1: enter (not persisted — alert_on only cares about exits — but
    // the caller must still record `wasInside=true` for the next call,
    // since stateChanged=true here, independent of shouldPersist).
    const enter1 = deriveGeofenceTransition({ isInside: true, wasInside: false, alertOn: 'exit' });
    expect(enter1).toEqual({ stateChanged: true, eventType: 'enter', shouldPersist: false });

    // Visit 1 exit: real transition, alert_on='exit' matches -> persisted.
    // This is exactly what Laravel's bug (11.35) can never produce, because
    // it never recorded the entry above (see the deep-dive's §2.1 trace).
    const exit1 = deriveGeofenceTransition({ isInside: false, wasInside: true, alertOn: 'exit' });
    expect(exit1).toEqual({ stateChanged: true, eventType: 'exit', shouldPersist: true });

    // Visit 2: enter again — still a real transition (wasInside=false from the exit above).
    const enter2 = deriveGeofenceTransition({ isInside: true, wasInside: false, alertOn: 'exit' });
    expect(enter2).toEqual({ stateChanged: true, eventType: 'enter', shouldPersist: false });

    // Visit 2 exit: also correctly detected and persisted — Laravel's version
    // goes permanently blind after the first cycle for 'enter'-only geofences
    // (§2.2) and never logs anything at all for 'exit'-only ones (§2.1); this
    // implementation has no such degradation since wasInside is never derived
    // from the filtered/persisted set.
    const exit2 = deriveGeofenceTransition({ isInside: false, wasInside: true, alertOn: 'exit' });
    expect(exit2).toEqual({ stateChanged: true, eventType: 'exit', shouldPersist: true });
  });

  it("11.35 FIX: alert_on='enter' doesn't go blind after the first entry", () => {
    const enter1 = deriveGeofenceTransition({ isInside: true, wasInside: false, alertOn: 'enter' });
    expect(enter1?.shouldPersist).toBe(true);

    const exit1 = deriveGeofenceTransition({ isInside: false, wasInside: true, alertOn: 'enter' });
    expect(exit1).toEqual({ stateChanged: true, eventType: 'exit', shouldPersist: false });

    // Second entry: wasInside is false (from the real exit above, not from
    // "last persisted event was enter" like Laravel's buggy version) ->
    // correctly detected as a real transition again.
    const enter2 = deriveGeofenceTransition({ isInside: true, wasInside: false, alertOn: 'enter' });
    expect(enter2).toEqual({ stateChanged: true, eventType: 'enter', shouldPersist: true });
  });
});

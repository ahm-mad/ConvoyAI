import { ValidationError } from '../../platform/errors/app-error.js';
import {
  MAX_TRIP_STOPS,
  type EditPlannedYardInput,
  type TripPlannedYard,
} from './fleet-trips.types.js';

/**
 * D-0175 (B5) — pure rules for a trip's stop list, shared by `POST /trips` and `PUT /trips/{id}` so create and edit can never
 * disagree. Deliberately NOT checked (owner decision Q18 "(a)"): stop times against the trip's planned window or each other,
 * ascending order, and repeated yards — planned times are advisory, and the same yard twice is a supported case (the sensor
 * bridge matches repeated yards by sequence).
 */

/** The stop as it will be after the edit: an entry with an `id` inherits every field the caller left out from the existing stop. */
export function effectiveStops(
  edits: ReadonlyArray<EditPlannedYardInput>,
  existing: ReadonlyArray<TripPlannedYard>
): Array<{
  id?: string | undefined;
  yardId: string;
  plannedArrivalAt: Date | null;
  plannedDepartureAt: Date | null;
}> {
  const byId = new Map(existing.map(stop => [stop.id, stop]));
  return edits.map(edit => {
    const current = edit.id !== undefined ? byId.get(edit.id) : undefined;
    return {
      id: edit.id,
      yardId: edit.yardId,
      plannedArrivalAt:
        edit.plannedArrivalAt !== undefined
          ? edit.plannedArrivalAt
          : (current?.plannedArrivalAt ?? null),
      plannedDepartureAt:
        edit.plannedDepartureAt !== undefined
          ? edit.plannedDepartureAt
          : (current?.plannedDepartureAt ?? null),
    };
  });
}

/** Throws one 422 listing every problem (keys are `planned_yards` or `planned_yards.N.<field>`, N = the stop's position in the array, from 0). */
export function validateStopRules(
  stops: ReadonlyArray<{
    id?: string | undefined;
    plannedArrivalAt: Date | null;
    plannedDepartureAt: Date | null;
  }>,
  knownStopIds?: ReadonlySet<string>
): void {
  const errors: Record<string, string[]> = {};
  const add = (key: string, message: string) => {
    (errors[key] ??= []).push(message);
  };

  if (stops.length > MAX_TRIP_STOPS)
    add('planned_yards', `A trip can have at most ${String(MAX_TRIP_STOPS)} stops.`);

  const seen = new Set<string>();
  for (const [index, stop] of stops.entries()) {
    const at = `planned_yards.${String(index)}`;
    if (stop.id !== undefined) {
      if (knownStopIds && !knownStopIds.has(stop.id))
        add(`${at}.id`, 'The selected stop id is invalid.');
      else if (seen.has(stop.id)) add(`${at}.id`, "The same stop can't appear twice.");
      seen.add(stop.id);
    }
    if (
      stop.plannedArrivalAt &&
      stop.plannedDepartureAt &&
      stop.plannedDepartureAt.getTime() < stop.plannedArrivalAt.getTime()
    ) {
      add(
        `${at}.planned_departure_at`,
        "The planned departure can't be before the planned arrival."
      );
    }
  }

  if (Object.keys(errors).length > 0) throw new ValidationError('Validation failed.', errors);
}

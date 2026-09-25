import AssignmentHistory from '@components/AssignmentHistory';

/** Company-wide driver ↔ vehicle assignment history (GET /assignment-history, paged + filtered by the backend). */
export default function Assignments() {
  return (
    <div className="flex flex-col p-5 h-full overflow-y-auto">
      <div className="mb-4">
        <h1 className="text-[15px] font-semibold text-ink-0 font-display">Assignments</h1>
        <p className="text-xs text-ink-2 mt-0.5">
          Which driver had which vehicle, and when. Open a vehicle or driver for their own history.
        </p>
      </div>

      <AssignmentHistory scope="company" />
    </div>
  );
}

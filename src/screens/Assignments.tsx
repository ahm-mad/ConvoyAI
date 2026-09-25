import AssignmentHistory from '@components/AssignmentHistory';

/** Company-wide driver ↔ vehicle assignment history (GET /assignment-history, paged + filtered by the backend). */
export default function Assignments() {
  return (
    <div className="flex flex-col pt-3 pb-12">
      <div className="mb-4">
        <h1 className="page-title">Assignments</h1>
        <p className="text-[13.5px] text-ink-1 mt-1">
          Which driver had which vehicle, and when. Open a vehicle or driver for their own history.
        </p>
      </div>

      <AssignmentHistory scope="company" />
    </div>
  );
}

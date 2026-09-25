'use client';

// route: /fleet-management/operations/incidents
import Incidents from '@screens/Incidents';

export default function IncidentsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <Incidents />
    </div>
  );
}

// route: /fleet-management — lands on the Overview (the old tabbed hub lives on at /fleet-management/legacy)
import { redirect } from 'next/navigation';

export default function FleetManagementIndex() {
  redirect('/fleet-management/operations/overview');
}

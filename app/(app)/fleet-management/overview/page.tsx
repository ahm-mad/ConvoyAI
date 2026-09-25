// route: /fleet-management/overview — the earlier preview address; kept so bookmarks keep working
import { redirect } from 'next/navigation';

export default function FleetOverviewPreviewRedirect() {
  redirect('/fleet-management/operations/overview');
}

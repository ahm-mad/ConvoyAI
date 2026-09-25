// DashboardWrapper
import { useParams } from '@lib/router-compat';
import Dashboard from '@pages/Dashboard';

export default function DashboardWrapper() {
  const { id } = useParams();
  return <Dashboard key={String(id ?? '')} />;
}

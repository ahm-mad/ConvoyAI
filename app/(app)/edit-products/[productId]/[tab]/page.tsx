'use client';

import { notFound, useParams } from 'next/navigation';
import ManageDeviceConfig from '@screens/ManageDeviceConfig';

const TABS = ['devices', 'configuration', 'integration'];

export default function Page() {
  const { tab } = useParams();
  if (typeof tab === 'string' && !TABS.includes(tab)) notFound();
  return <ManageDeviceConfig />;
}

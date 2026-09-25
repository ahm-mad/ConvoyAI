'use client';

import { notFound, useParams } from 'next/navigation';
import ManageDevice from '@screens/ManageDevice';

const TABS = ['devices', 'configuration', 'integration', 'history'];

export default function Page() {
  const { tab } = useParams();
  if (typeof tab === 'string' && !TABS.includes(tab)) notFound();
  return <ManageDevice />;
}

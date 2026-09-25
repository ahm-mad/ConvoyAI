import React, { Suspense } from 'react';
import SpinLoader from '../components/SpinLoader';

// Moved away from the widget grid (GridStack, per-attribute widgets) to a
// simpler per-device status view. Grid.jsx is intentionally untouched and
// still in the codebase — only this one import changed, so reverting is a
// one-line change if needed.
const DeviceStatusGrid = React.lazy(() => import('@components/DeviceStatusGrid'));

export default function Dashboard() {
  return (
    <React.Fragment>
      <Suspense
        fallback={
          <div>
            <SpinLoader />
          </div>
        }
      >
        <DeviceStatusGrid />
      </Suspense>
    </React.Fragment>
  );
}

'use client';

import NotFound from '@components/NotFound';

// Root catch-all — mirrors the old `<Route path="*" element={<NotFound />} />`.
export default function NotFoundPage() {
  return <NotFound />;
}

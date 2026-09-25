import type { ReactNode } from 'react';

function NonAuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-screen min-h-screen flex flex-col">
      {/* <NonAuthNavBar /> */}
      <main>{children}</main>
      {/* <NonAuthFooter /> */}
    </div>
  );
}

export default NonAuthLayout;

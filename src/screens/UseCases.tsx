import React from 'react';

import Navbar from '../GuestHomeComponents/components/layout/Navbar';
import { Footer } from '../GuestHomeComponents/components/layout/Footer';
import { UseCasesShowcase } from '../GuestHomeComponents/components/sections';

function UseCases() {
  return (
    <div className="min-h-screen bg-[#0F1D2A]" style={{ fontFamily: "'Orbitron', sans-serif" }}>
      <Navbar />
      <UseCasesShowcase />
      <Footer />
    </div>
  );
}

export default UseCases;

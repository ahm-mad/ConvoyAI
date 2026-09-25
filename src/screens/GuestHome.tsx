import React from 'react';
import '../../styles/global.css';

// 1. Grouped imports using your alias configuration
import {
  Hero,
  SystemArchitecture,
  ProtocolIngestion,
  SpatialIntelligenceIntro,
  AIAgents,
  EnterpriseCapabilities,
  IndustryVerticals,
  CommandCenter,
  CaseStudies,
  TechStack,
  WhyChoose,
  FinalCTA,
} from '../GuestHomeComponents/components/sections';
import Navbar from '../GuestHomeComponents/components/layout/Navbar';
import { Footer } from '../GuestHomeComponents/components/layout/Footer';

// 2. Kept your existing standalone layout components

// import Challenge from '../GuestHomeComponents/Challenge';

function GuestHome() {
  return (
    <div className="min-h-screen bg-[#0F1D2A]" style={{ fontFamily: "'Orbitron', sans-serif" }}>
      {/* Structural layout components */}
      {/* <Header /> */}

      {/* New merged sectional components from your prompt */}
      <Navbar />
      <Hero />
      <SystemArchitecture />
      <ProtocolIngestion />
      <SpatialIntelligenceIntro />
      <AIAgents />
      <EnterpriseCapabilities />
      <IndustryVerticals />
      <CommandCenter />

      {/* Existing structural components mixed with the new sections */}
      {/* <Challenge /> */}
      <CaseStudies />
      {/* <HowItWorks /> */}
      {/* <Features /> */}
      <TechStack />
      <WhyChoose />
      <FinalCTA />
      {/* <Contact /> */}
      <Footer />
    </div>
  );
}

export default GuestHome;

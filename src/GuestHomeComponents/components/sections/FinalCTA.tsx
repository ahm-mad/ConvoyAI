// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { useState, useEffect } from 'react';
import { ArrowRight, Phone } from 'lucide-react';
import { PopupModal } from 'react-calendly';
import { Container } from '../../components/ui/Container';
import { Button } from '../../components/ui/Button';

export function FinalCTA() {
  const [calendlyOpen, setCalendlyOpen] = useState(false);

  // Lock body scroll while the Calendly popup is open
  useEffect(() => {
    document.body.style.overflow = calendlyOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [calendlyOpen]);

  return (
    <section className="  border-line-soft bg-surface-1 py-24">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-ink-0 sm:text-4xl">
            Transform Physical Infrastructure into Intelligent Digital Twins
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-1">
            Join leading smart cities, real estate portfolios, and industrial facilities. Schedule
            an enterprise briefing and platform demonstration with our technical specialists.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
            <Button
              className="cursor-pointer bg-[#1562AE]/80 text-white transition-colors hover:scale-103 hover:bg-[#0f4a7f]"
              variant="solid"
              icon={<ArrowRight className="size-4" />}
              onClick={() => setCalendlyOpen(true)}
            >
              Book a Demo
            </Button>

            <button
              type="button"
              onClick={() => setCalendlyOpen(true)}
              className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-accent-cyan transition-colors hover:text-accent-cyan/80"
            >
              <Phone className="size-4" strokeWidth={1.75} />
              Talk to an Expert
            </button>
          </div>
        </div>
      </Container>

      <PopupModal
        url="https://calendly.com/usama-waqas-chirptech/30min"
        pageSettings={{
          backgroundColor: 'ffffff',
          hideEventTypeDetails: false,
          hideLandingPageDetails: false,
          primaryColor: '00B8DB',
          textColor: '1a1a1a',
        }}
        onModalClose={() => setCalendlyOpen(false)}
        open={calendlyOpen}
        rootElement={document.getElementById('root')}
      />
    </section>
  );
}

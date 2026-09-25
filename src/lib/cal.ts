import { getCalApi } from '@calcom/embed-react';

// Replace with your actual Cal.com username/event slug
// (Cal.com dashboard → Event Types → your event → Copy link)
export const CAL_LINK = 'your-username/30min';
export const CAL_NAMESPACE = 'request-demo';

let initialized = false;

// Configures the dark theme + brand color once, no matter how many
// components call this. Safe to call from every component that needs
// to open the popup.
async function ensureCalInitialized() {
  const cal = await getCalApi({ namespace: CAL_NAMESPACE });
  if (!initialized) {
    cal('ui', {
      theme: 'dark',
      styles: {
        branding: { brandColor: '#00B8DB' },
      },
      hideEventTypeDetails: false,
      layout: 'month_view',
    });
    initialized = true;
  }
  return cal;
}

export async function openCalPopup() {
  const cal = await ensureCalInitialized();
  cal('modal', {
    calLink: CAL_LINK,
    config: {
      theme: 'dark',
    },
  });
}

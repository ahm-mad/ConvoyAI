// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

const fakeCompanyData = {
  name: 'chirpTech Solutions Inc.',
  country: 'USA',
  city: 'San Francisco',
  address: '123 Innovation Street, Suite 456',
  state: 'California',
  zip_code: '94105',
  email: 'contact@chirptech-solutions.com',
};

let currentTourInstance = null;
let tourActive = false;
let popstateListener = null;
let formSaved = false;

const startAdvancedTour = (setValue = null) => {
  formSaved = false;

  const cleanupTour = () => {
    if (currentTourInstance) {
      try {
        currentTourInstance.destroy();
      } catch (error) {
        console.log('Tour cleanup error:', error);
      }
      currentTourInstance = null;
    }
    tourActive = false;

    if (popstateListener) {
      window.removeEventListener('popstate', popstateListener);
      popstateListener = null;
    }
  };

  popstateListener = () => {
    if (formSaved) {
      cleanupTour();
    } else {
      window.history.pushState(null, null, window.location.pathname);
      // alert('Please complete and save the form before navigating away!');
    }
  };

  window.addEventListener('popstate', popstateListener);
  tourActive = true;

  const driverObj = driver({
    animate: true,
    opacity: 0.75,
    padding: 10,
    allowClose: false,
    showProgress: true,
    showButtons: ['next', 'previous'],
    disableActiveInteraction: true,
    popoverClass: 'custom-driver-popover',
    nextBtnText: 'Next →',
    prevBtnText: '← Previous',
    doneBtnText: 'Save & Finish',

    onHighlighted: element => {
      if (!setValue || !tourActive) return;

      const elementId = element.id;
      switch (elementId) {
        case 'company-name-input':
          setValue('name', fakeCompanyData.name, { shouldValidate: true, shouldDirty: true });
          break;
        case 'company-country-select':
          setValue('country', fakeCompanyData.country, { shouldValidate: true, shouldDirty: true });
          break;
        case 'company-city-input':
          setValue('city', fakeCompanyData.city, { shouldValidate: true, shouldDirty: true });
          break;
        case 'company-address-input':
          setValue('address', fakeCompanyData.address, { shouldValidate: true, shouldDirty: true });
          break;
        case 'company-state-input':
          setValue('state', fakeCompanyData.state, { shouldValidate: true, shouldDirty: true });
          break;
        case 'company-zipcode-input':
          setValue('zip_code', fakeCompanyData.zip_code, {
            shouldValidate: true,
            shouldDirty: true,
          });
          break;
        case 'company-email-input':
          setValue('email', fakeCompanyData.email, { shouldValidate: true, shouldDirty: true });
          break;
      }
    },

    onDestroyed: () => {
      cleanupTour();
    },

    steps: [
      {
        element: '#company-name-input',
        popover: {
          title: 'Company Name',
          description: 'Enter your company name.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '#company-country-select',
        popover: {
          title: 'Country Selection',
          description: 'Choose your country.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '#company-city-input',
        popover: {
          title: 'City',
          description: 'Specify your city.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '#company-address-input',
        popover: {
          title: 'Address',
          description: 'Enter company address.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '#company-state-input',
        popover: { title: 'State', description: 'Enter state.', side: 'bottom', align: 'start' },
      },
      {
        element: '#company-zipcode-input',
        popover: {
          title: 'Postal Code',
          description: 'Enter postal code.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '#company-email-input',
        popover: {
          title: 'Email',
          description: 'Enter company email.',
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '#company-save-button',
        popover: {
          title: 'Save Information',
          description: 'Click save to finish.',
          side: 'top',
          align: 'end',
          onNextClick: () => {
            formSaved = true;
            cleanupTour();
          },
        },
      },
    ],
  });

  currentTourInstance = driverObj;
  driverObj.drive();
};

export const markFormAsSaved = () => {
  formSaved = true;
  if (currentTourInstance) {
    try {
      currentTourInstance.destroy();
    } catch (error) {}
  }
};

export const isTourActive = () => tourActive && !formSaved;

export const stopTour = () => {
  if (currentTourInstance) {
    try {
      currentTourInstance.destroy();
    } catch (error) {}
  }
};

export const forceStopTour = () => {
  formSaved = true;
  if (currentTourInstance) {
    try {
      currentTourInstance.destroy();
    } catch (error) {}
  }
};

export default startAdvancedTour;

// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useEffect } from 'react';
import { useModal } from '@contexts/ModalContext';
// import GlobalPacketListener from '@components/GlobalPacketListener';
import { showPersistentPacketToast } from '../utils/packetToastManager';
import { useNavigate } from '@lib/router-compat';

export function StartModelDemo({ setFormData }) {
  const { closeModal } = useModal();
  const navigate = useNavigate();
  const updateStepOne = data => {
    setFormData(prev => ({
      ...prev,
      step1: {
        isFilled: true,
        data: {
          ...prev.step1?.data,
          ...data,
        },
      },
    }));
  };

  const updateStepThree = data => {
    setFormData(prev => ({
      ...prev,
      step2: {
        ...prev.step2,
        data: prev.step2.data.map(
          (item, index) => (index === 0 ? { ...item, ...data } : item) // update only first device
        ),
      },
    }));
  };

  useEffect(() => {
    const modalDriver = driver({
      showProgress: true,
      steps: [
        {
          element: '#add-device-modal-header',
          popover: {
            title: 'Welcome to Add Product',
            description:
              "This guided tour will show you how to add a new IoT product. We'll fill in sample data for each step.",
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '#step-indicators',
          popover: {
            title: 'Process Overview',
            description: 'The 4-step process: Connectivity → Product → Devices → Integration.',
            side: 'bottom',
            align: 'center',
          },
        },
        {
          element: '#connectivity-type-form',
          popover: {
            title: 'Step 1: Choose Connectivity',
            description: "We'll select LoRaWAN for this demo!",
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '#connectivity-option-lorawan',
          popover: {
            title: 'Step 1: Choose Connectivity',
            description: "We'll select LoRaWAN for this demo!",
            side: 'bottom',
            align: 'start',
            onNextClick: () => {
              const btn = document.querySelector('#connectivity-option-lorawan');
              if (btn) {
                btn.click();
                setTimeout(() => {
                  modalDriver.moveNext();
                }, 100);
              } else {
                modalDriver.moveNext();
              }
            },
          },
        },
        {
          element: '#step-1-next-button',
          popover: {
            title: 'Continue',
            description: 'Connectivity is set. Click Next to continue.',
            side: 'top',
            align: 'end',
            onNextClick: () => {
              const btn = document.querySelector('#step-1-next-button');
              if (btn) {
                btn.click();
                setTimeout(() => {
                  modalDriver.moveNext();
                }, 100);
              } else {
                modalDriver.moveNext();
              }
            },
          },
        },
        {
          element: '#product-selection-form',
          popover: {
            title: 'Step 2: Product Configuration',
            description: "We'll create a new product with a sample name.",
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '#new-template',
          popover: {
            title: 'Step 2: Product Configuration',
            description: "We'll create a new product with a sample name.",
            side: 'bottom',
            align: 'start',
            onNextClick: () => {
              const btn = document.querySelector('#new-template');
              if (btn) {
                btn.click();
                setTimeout(() => {
                  modalDriver.moveNext();
                }, 100);
              } else {
                modalDriver.moveNext();
              }
            },
          },
        },
        {
          element: '#temp-procedure',
          popover: {
            title: 'Step 2: Product Configuration',
            description: "We'll create a new product with a sample name.",
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '#existing-product',
          popover: {
            title: 'Step 2: Product Configuration',
            description: "We'll create a new product with a sample name.",
            side: 'bottom',
            align: 'start',
            onNextClick: () => {
              const btn = document.querySelector('#existing-product');
              if (btn) {
                btn.click();
                setTimeout(() => {
                  modalDriver.moveNext();
                }, 100);
              } else {
                modalDriver.moveNext();
              }
            },
          },
        },
        {
          element: '#device-info',
          popover: {
            title: 'Step 2: Product Configuration',
            description: "We'll create a new product with a sample name.",
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '#new-product',
          popover: {
            title: 'Step 2: Product Configuration',
            description: "We'll create a new product with a sample name.",
            side: 'bottom',
            align: 'start',
            onNextClick: () => {
              const btn = document.querySelector('#new-product');
              if (btn) {
                btn.click();
                setTimeout(() => {
                  modalDriver.moveNext();
                }, 100);
              } else {
                modalDriver.moveNext();
              }
            },
          },
        },
        {
          element: '#add-prd-name',
          popover: {
            title: 'Step 2: Product Configuration',
            description: "We'll create a new product with a sample name.",
            side: 'bottom',
            align: 'start',
          },
          onHighlightStarted: () => {
            updateStepOne({ name: 'Demo Product' });
          },
        },
        {
          element: '#product-in',
          popover: {
            title: 'Step 2: Product Configuration',
            description: "We'll create a new product with a sample name.",
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '#step-2-next-button',
          popover: {
            title: 'Continue',
            description: 'Product created. Click Next to continue.',
            side: 'top',
            align: 'end',
            onNextClick: () => {
              const btn = document.querySelector('#step-2-next-button');
              if (btn) {
                btn.click();
                setTimeout(() => {
                  modalDriver.moveNext();
                }, 100);
              } else {
                modalDriver.moveNext();
              }
            },
          },
        },
        {
          element: '#device-details-form',
          popover: {
            title: 'Step 3: Devices',
            description: "We've added two devices for you.",
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '#drop-csv',
          popover: {
            title: 'Step 3: Devices',
            description: "We've added two devices for you.",
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '#device-id',
          popover: {
            title: 'Step 3: Devices',
            description: "We've added two devices for you.",
            side: 'bottom',
            align: 'start',
          },
          onHighlightStarted: () => {
            updateStepThree({
              device_unique_identifier: 'demoId12345',
            });
          },
        },
        {
          element: '#device-name',
          popover: {
            title: 'Step 3: Devices',
            description: "We've added two devices for you.",
            side: 'bottom',
            align: 'start',
          },
          onHighlightStarted: () => {
            updateStepThree({
              name: 'Demo Device',
            });
          },
        },
        {
          element: '#device-location',
          popover: {
            title: 'Step 3: Devices',
            description: "We've added two devices for you.",
            side: 'bottom',
            align: 'start',
          },
          onHighlightStarted: () => {
            updateStepThree({
              location: 'Demo Location',
            });
          },
        },
        {
          element: '#device-tag',
          popover: {
            title: 'Step 3: Devices',
            description: "We've added two devices for you.",
            side: 'bottom',
            align: 'start',
          },
          onHighlightStarted: () => {
            updateStepThree({
              tags: 'Demo Tag',
            });
          },
        },
        {
          element: '#add-anpther-device',
          popover: {
            title: 'Step 3: Devices',
            description: "We've added two devices for you.",
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '#step-3-save-button',
          popover: {
            title: 'Devices Ready',
            description: 'Devices are configured. Click Save to continue.',
            side: 'top',
            align: 'end',
            onNextClick: () => {
              const btn = document.querySelector('#step-3-save-button');
              if (btn) {
                btn.click();
                setTimeout(() => {
                  modalDriver.moveNext();
                }, 100);
              } else {
                modalDriver.moveNext();
              }
            },
          },
        },
        {
          element: '#integration-form',
          popover: {
            title: 'Step 4: Integration',
            description: 'Set up data integration options.',
            side: 'bottom',
            align: 'start',
          },
        },
        {
          element: '#acknowledge-button',
          popover: {
            title: 'Tour Complete!',
            description: "You've successfully learned how to add a product with devices.",
            side: 'top',
            align: 'end',
            onNextClick: () => {
              closeModal();

              showPersistentPacketToast({
                productId: 'demo-product-123',
                productName: 'Demo Product',
                navigate,
              });
              modalDriver.destroy();
            },
          },
        },
      ],
    });

    modalDriver.drive();
  }, []);
  return null;
}

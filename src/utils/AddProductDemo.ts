// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

// Fake data for all steps
const fakeProductData = {
  connectivity: {
    type: 'lorawan',
    selectedOption: 'lorawan',
  },
  step1: {
    selectedBox: 2,
    productName: 'Smart Environmental Monitor Pro',
  },
  step2: {
    devices: [
      {
        id: Date.now(),
        device_unique_identifier: 'ENV-001-2024',
        name: 'Main Sensor Unit',
        location: 'Building A - Lobby',
        tags: 'environment, temperature, humidity',
      },
      {
        id: Date.now() + 1,
        device_unique_identifier: 'ENV-002-2024',
        name: 'Backup Sensor Unit',
        location: 'Building A - Server Room',
        tags: 'environment, backup, monitoring',
      },
    ],
  },
};

// Helpers (instant updates, no delays)
const updateConnectivityStep = (setFormData, type) => {
  if (!setFormData) return;
  setFormData(prev => ({
    ...prev,
    connectivity: {
      isFilled: true,
      data: { type, selectedOption: type },
    },
  }));

  // Simulate visual click instantly
  const connectivityOptions = document.querySelectorAll('#connectivity-type-form .cursor-pointer');
  const targetOption = Array.from(connectivityOptions).find(
    option => option.textContent.includes('LoRaWAN') && type === 'lorawan'
  );
  if (targetOption) targetOption.click();
};

const updateStep1 = (setFormData, boxIndex, productName) => {
  if (!setFormData) return;

  // Select the box
  setFormData(prev => ({
    ...prev,
    step1: {
      isFilled: true,
      data: { name: productName },
      box: boxIndex,
    },
  }));

  // Simulate box click instantly
  const boxes = document.querySelectorAll('#product-selection-form .cursor-pointer');
  if (boxes[boxIndex]) {
    boxes[boxIndex].click();
  }
};

const updateStep2 = (setFormData, devices) => {
  if (!setFormData) return;

  setFormData(prev => ({
    ...prev,
    step2: {
      isFilled: true,
      data: devices,
    },
  }));
};

// Full tour (new product)
const startAddProductTour = (setFormData = null, setStep = null) => {
  const driverObj = driver({
    animate: true,
    opacity: 0.75,
    padding: 10,
    allowClose: false,
    showProgress: true,
    showButtons: ['next', 'previous', 'close'],
    disableActiveInteraction: false,
    popoverClass: 'custom-driver-popover',
    nextBtnText: 'Next →',
    prevBtnText: '← Previous',
    doneBtnText: 'Finish Tour',
    onHighlighted: element => {
      if (!setFormData || !setStep) return;
      const elementId = element.id;

      switch (elementId) {
        case 'connectivity-type-form':
          setStep(1);
          updateConnectivityStep(setFormData, fakeProductData.connectivity.type);
          break;

        case 'product-selection-form':
          setStep(2);
          updateStep1(
            setFormData,
            fakeProductData.step1.selectedBox,
            fakeProductData.step1.productName
          );
          break;

        case 'device-details-form':
          setStep(3);
          updateStep2(setFormData, fakeProductData.step2.devices);
          break;

        case 'integration-form':
          setStep(4);
          break;

        default:
          break;
      }
    },
    onDestroyed: () => {
      console.log('Add Product Tour finished');
    },
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
        element: '#step-1-next-button',
        popover: {
          title: 'Continue',
          description: 'Connectivity is set. Click Next to continue.',
          side: 'top',
          align: 'end',
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
        element: '#step-2-next-button',
        popover: {
          title: 'Continue',
          description: 'Product created. Click Next to continue.',
          side: 'top',
          align: 'end',
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
        element: '#step-3-save-button',
        popover: {
          title: 'Devices Ready',
          description: 'Devices are configured. Click Save to continue.',
          side: 'top',
          align: 'end',
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
        },
      },
    ],
  });

  driverObj.drive();
};

// Tour for new product
const startTourForNewProduct = (setFormData, setStep) => {
  startAddProductTour(setFormData, setStep);
};

// Tour for existing product
const startTourForExistingProduct = (setFormData, setStep) => {
  const driverObj = driver({
    animate: true,
    opacity: 0.75,
    padding: 10,
    allowClose: false,
    showProgress: true,
    showButtons: ['next', 'previous', 'close'],
    disableActiveInteraction: false,
    popoverClass: 'custom-driver-popover',
    nextBtnText: 'Next →',
    prevBtnText: '← Previous',
    doneBtnText: 'Finish Tour',
    onHighlighted: element => {
      if (element.id === 'device-details-form' && setFormData && setStep) {
        setStep(3);
        setFormData(prev => ({
          ...prev,
          step2: {
            isFilled: true,
            data: fakeProductData.step2.devices,
          },
        }));
      }
    },
    steps: [
      {
        element: '#device-details-form',
        popover: {
          title: 'Add Devices to Existing Product',
          description: "We'll start directly with device configuration.",
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '#step-3-save-button',
        popover: {
          title: 'Devices Ready',
          description: 'Sample devices have been configured. Click Save to complete.',
          side: 'top',
          align: 'end',
        },
      },
    ],
  });

  driverObj.drive();
};

export { startAddProductTour, startTourForNewProduct, startTourForExistingProduct };
export default startAddProductTour;

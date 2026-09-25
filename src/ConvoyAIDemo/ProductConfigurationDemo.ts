// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useModal } from '@contexts/ModalContext';

export default function ProductConfigurationDemo() {
  const { openModal, closeModal } = useModal();
  useEffect(() => {
    const driverObj = driver({
      showProgress: true,
      steps: [
        {
          element: '#prd-conf-name',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
          },
        },
        {
          element: '#webhook-link',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
          },
        },
        {
          element: '#webhook-token',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
          },
        },
        {
          element: '#att-selection',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
          },
        },
        {
          element: '#att',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
          },
        },
        {
          element: '#att-setting',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
            onNextClick: () => {
              const btn = document.querySelector('#att-setting');
              if (btn) {
                const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
                const up = new PointerEvent('pointerup', { bubbles: true, cancelable: true });
                const click = new MouseEvent('click', { bubbles: true, cancelable: true });

                btn.dispatchEvent(down);
                btn.dispatchEvent(up);
                btn.dispatchEvent(click);

                setTimeout(() => driverObj.moveNext(), 100);
              }
            },
          },
        },

        {
          element: '#configure-att',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
            onNextClick: () => {
              const btn = document.querySelector('#configure-att');
              if (btn) {
                btn.click();

                setTimeout(() => {
                  driverObj.moveNext();
                }, 2000);
              } else {
                driverObj.moveNext();
              }
            },
          },
        },
        {
          element: '#entr-label',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
            onNextClick: () => {
              const btn = document.querySelector('#ent-label');
              if (btn) {
                btn.click();
                setTimeout(() => {
                  driverObj.moveNext();
                }, 100);
              } else {
                driverObj.moveNext();
              }
            },
          },
        },
        {
          element: '#att-unit',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
          },
        },
        {
          element: '#att-condition',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
          },
        },
        {
          element: '#if-con',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
          },
        },
        {
          element: '#sel-att',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
          },
        },
        {
          element: '#selc-range',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
          },
        },
        {
          element: '#att-val',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
          },
        },
        {
          element: '#exp-sett',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
            onNextClick: () => {
              const btn = document.querySelector('#ent-label');
              if (btn) {
                btn.click();
                setTimeout(() => {
                  driverObj.moveNext();
                }, 100);
              } else {
                driverObj.moveNext();
              }
            },
          },
        },
        {
          element: '#att-widget',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
          },
        },
        {
          element: '#submit-modal',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
            onNextClick: () => {
              setTimeout(() => {
                closeModal();
                driverObj.moveNext();
              }, 1000);
            },
          },
        },
        {
          element: '#unique-att',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
          },
        },
        {
          element: '#setting-btn',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
            onNextClick: () => {
              const btn = document.querySelector('#setting-btn');
              if (btn) {
                const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
                const up = new PointerEvent('pointerup', { bubbles: true, cancelable: true });
                const click = new MouseEvent('click', { bubbles: true, cancelable: true });

                btn.dispatchEvent(down);
                btn.dispatchEvent(up);
                btn.dispatchEvent(click);

                setTimeout(() => driverObj.moveNext(), 100);
              }
            },
          },
        },
        {
          element: '#mark-unique',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
            onNextClick: () => {
              const btn = document.querySelector('#mark-unique');
              if (btn) {
                btn.click();
                setTimeout(() => {
                  driverObj.moveNext();
                }, 1000);
              } else {
                driverObj.moveNext();
              }
            },
          },
        },
        {
          element: '#save-config',
          popover: {
            title: 'Add New Product',
            description: 'Please save your product configuration settings.',
            side: 'bottom',
          },
        },
      ],
    });

    driverObj.drive();
  }, []);
  return null;
}

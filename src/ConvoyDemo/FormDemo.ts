// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export default function FormDemo({ setValue, products = [], sectionIndex = 0 }) {
  useEffect(() => {
    const driverObj = driver({
      showProgress: true,
      steps: [
        {
          element: '#wgt-name',
          popover: {
            title: 'Dashboard Title',
            description: 'Please add your dashboard title.',
            side: 'bottom',
          },
          onHighlightStarted: () => {
            setValue('widget_name', 'Demo Widget', { shouldValidate: true });
          },
        },
        {
          element: '#sel-prd',
          popover: {
            title: 'Dashboard Title',
            description: 'Please add your dashboard title.',
            side: 'bottom',
          },
          onHighlightStarted: () => {
            setValue(`sections.${sectionIndex}.product`, 'demo-product', {
              shouldValidate: true,
              shouldDirty: true,
            });
          },
        },
        {
          element: '#sel-device',
          popover: {
            title: 'Dashboard Title',
            description: 'Please add your dashboard title.',
            side: 'bottom',
          },
          onHighlightStarted: () => {
            setValue(`sections.${sectionIndex}.device`, 'demo-device', {
              shouldValidate: true,
              shouldDirty: true,
            });
          },
        },
        {
          element: '#sel-att',
          popover: {
            title: 'Dashboard Title',
            description: 'Please add your dashboard title.',
            side: 'bottom',
          },
          onHighlightStarted: () => {
            setValue(`sections.${sectionIndex}.attributes`, 'demo-attribute', {
              shouldValidate: true,
              shouldDirty: true,
            });
          },
        },
        {
          element: '#att-unit',
          popover: {
            title: 'Dashboard Title',
            description: 'Please add your dashboard title.',
            side: 'bottom',
            onNextClick: () => {
              const btn = document.querySelector('#att-unit');
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
          element: '#unit-0',
          popover: {
            title: 'Dashboard Title',
            description: 'Please add your dashboard title.',
            side: 'bottom',
            onNextClick: () => {
              const btn = document.querySelector('#unit-0');
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
          element: '#condition',
          popover: {
            title: 'Dashboard Title',
            description: 'Please add your dashboard title.',
            side: 'bottom',
          },
        },
        {
          element: '#sel-range',
          popover: {
            title: 'Dashboard Title',
            description: 'Please add your dashboard title.',
            side: 'bottom',
          },
        },
        {
          element: '#att-val',
          popover: {
            title: 'Dashboard Title',
            description: 'Please add your dashboard title.',
            side: 'bottom',
          },
        },
        {
          element: '#color-val',
          popover: {
            title: 'Dashboard Title',
            description: 'Please add your dashboard title.',
            side: 'bottom',
          },
        },
        {
          element: '#selc-color',
          popover: {
            title: 'Dashboard Title',
            description: 'Please add your dashboard title.',
            side: 'bottom',
          },
        },
        {
          element: '#save-form',
          popover: {
            title: 'Dashboard Title',
            description: 'Please add your dashboard title.',
            side: 'bottom',
            onNextClick: () => {
              const btn = document.querySelector('#save-form');
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
      ],
    });

    driverObj.drive();
  }, [setValue]);
  return null;
}

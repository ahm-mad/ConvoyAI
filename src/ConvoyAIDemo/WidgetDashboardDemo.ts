import { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export default function WidgetDashboardDemo({ handlePlusButtonClick, filteredWidgets }) {
  useEffect(() => {
    const driverObj = driver({
      showProgress: true,
      steps: [
        {
          element: '#das-title',
          popover: {
            title: 'Dashboard Title',
            description: 'Please add your dashboard title.',
            side: 'bottom',
          },
        },
        {
          element: '#drg-widgets',
          popover: {
            title: 'Dashboard Title',
            description: 'Please add your dashboard title.',
            side: 'bottom',
            onNextClick: () => {
              const widget = filteredWidgets.realtime[0];
              if (widget) {
                handlePlusButtonClick(widget);
                setTimeout(() => {
                  driverObj.moveNext();
                }, 2000);
              }
            },
          },
        },
        // {
        //   element: '#wgt-name',
        //   popover: {
        //     title: 'Dashboard Title',
        //     description: 'Please add your dashboard title.',
        //     side: 'bottom',
        //   },
        //   onHighlightStarted:()=>{
        //     const input = document.querySelector('#wgt-name');
        //     if (input) {
        //       input.value = 'My Dashboard';
        //     }
        //   }
        // },
        // {
        //   element: '#sel-prd',
        //   popover: {
        //     title: 'Dashboard Title',
        //     description: 'Please add your dashboard title.',
        //     side: 'bottom',
        //   },
        // },
        // {
        //   element: '#sel-device',
        //   popover: {
        //     title: 'Dashboard Title',
        //     description: 'Please add your dashboard title.',
        //     side: 'bottom',
        //   },
        // },
        // {
        //   element: '#sel-att',
        //   popover: {
        //     title: 'Dashboard Title',
        //     description: 'Please add your dashboard title.',
        //     side: 'bottom',
        //   },
        // },
        // {
        //   element: '#att-unit',
        //   popover: {
        //     title: 'Dashboard Title',
        //     description: 'Please add your dashboard title.',
        //     side: 'bottom',
        //   },
        // },
        // {
        //   element: '#condition',
        //   popover: {
        //     title: 'Dashboard Title',
        //     description: 'Please add your dashboard title.',
        //     side: 'bottom',
        //   },
        // },
        // {
        //   element: '#sel-range',
        //   popover: {
        //     title: 'Dashboard Title',
        //     description: 'Please add your dashboard title.',
        //     side: 'bottom',
        //   },
        // },
        // {
        //   element: '#att-val',
        //   popover: {
        //     title: 'Dashboard Title',
        //     description: 'Please add your dashboard title.',
        //     side: 'bottom',
        //   },
        // },
        // {
        //   element: '#color-val',
        //   popover: {
        //     title: 'Dashboard Title',
        //     description: 'Please add your dashboard title.',
        //     side: 'bottom',
        //   },
        // },
        // {
        //   element: '#selc-color',
        //   popover: {
        //     title: 'Dashboard Title',
        //     description: 'Please add your dashboard title.',
        //     side: 'bottom',
        //   },
        // },
        // {
        //   element: '#save-form',
        //   popover: {
        //     title: 'Dashboard Title',
        //     description: 'Please add your dashboard title.',
        //     side: 'bottom',
        //   },
        // },
      ],
    });

    driverObj.drive();
  }, []);
  return null;
}

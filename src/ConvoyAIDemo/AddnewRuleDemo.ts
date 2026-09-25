// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export default function useAddNewRuleDemo() {
  useEffect(() => {
    const timer = setTimeout(() => {
      const driverObj = driver({
        showProgress: true,
        steps: [
          {
            element: '#add-rule-name',
            popover: {
              title: 'Add Rule Name',
              description: 'Please enter the name of your rule here.',
              side: 'bottom',
            },
          },
          {
            element: '#rule-state',
            popover: {
              title: 'Active & Inactive',
              description: 'You can toggle this rule between active and inactive',
              side: 'bottom',
            },
          },
          {
            element: '#select-product',
            popover: {
              title: 'Product and Attributes',
              description: 'Please select the  product and then Attributes aginst that product',
              side: 'bottom',
              onNextClick: () => {
                const btn = document.querySelector('#select-product');
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
            element: '#row-select-product',
            popover: {
              title: 'First Product',
              description: 'Click here to select the first product.',
              side: 'right',
              onNextClick: () => {
                const btn = document.querySelector('#row-select-product');
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
            element: '#dropdown-product-0',
            popover: {
              title: 'First Product',
              description: 'Click here to select the first product.',
              side: 'right',
              onNextClick: () => {
                const btn = document.querySelector('#dropdown-product-0');
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
            element: '#row-select-attribute',
            popover: {
              title: 'First Product',
              description: 'Click here to select the first product.',
              side: 'right',
              onNextClick: () => {
                const btn = document.querySelector('#row-select-attribute');
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
            element: '#dropdown-attribute-0',
            popover: {
              title: 'First Attribute',
              description: 'Now choose an attribute.',
              side: 'right',
              onNextClick: () => {
                const btn = document.querySelector('#dropdown-attribute-0');
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
            element: '#select-range',
            popover: {
              title: 'Value Range',
              description: 'Please select value range for your selected attribute',
              side: 'bottom',
            },
          },
          {
            element: '#add-att-value',
            popover: {
              title: 'Attribute Value',
              description: 'Please enter your your attribute value',
              side: 'bottom',
            },
          },
          {
            element: '#add-condition',
            popover: {
              title: 'Add Condition',
              description: 'You can add conditions between your product',
              side: 'bottom',
              onNextClick: () => {
                const btn = document.querySelector('#add-condition');
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
            element: '#logical-operation',
            popover: {
              title: 'Add Logical Operations',
              description: 'You can add logical operation between products e.g: AND, OR',
              side: 'bottom',
              onNextClick: () => {
                const btn = document.querySelector('#logical-operation');
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
            element: '#custom-select-item-0',
            popover: {
              title: 'AND Logical Operation',
              description: 'You can add the AND condition between you products.',
              side: 'bottom',
            },
          },
          {
            element: '#notify',
            popover: {
              title: 'Notify',
              description: 'Click add button to notify you',
              side: 'bottom',
              onNextClick: () => {
                const btn = document.querySelector('#notify');
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
            element: '#notify-email',
            popover: {
              title: 'Notify Method',
              description: 'we can notify you through your email',
              side: 'bottom',
              onNextClick: () => {
                const btn = document.querySelector('#notify-email');
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
            element: '#email-input',
            popover: {
              title: 'Email',
              description: 'Please enter your email',
              side: 'bottom',
            },
          },
          {
            element: '#add-email',
            popover: {
              title: 'Click To Add',
              description: 'Please Click on Add button to confirm you email',
              side: 'bottom',
            },
          },
          {
            element: '#email-subject',
            popover: {
              title: 'Subject',
              description: 'Please enter your email subject',
              side: 'bottom',
            },
          },
          {
            element: '#email-message',
            popover: {
              title: 'Message',
              description: 'Please enter your Message',
              side: 'bottom',
            },
          },
          {
            element: '#notify-sms',
            popover: {
              title: 'Notify Method',
              description: 'We can notify through your phone number',
              side: 'bottom',
              onNextClick: () => {
                const btn = document.querySelector('#notify-sms');
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
            element: '#number-input',
            popover: {
              title: 'Phone Number',
              description: 'Please enter your phone number',
              side: 'bottom',
            },
          },
          {
            element: '#add-number',
            popover: {
              title: 'Click To Add',
              description: 'Please Click on Add button to confirm you phone number',
              side: 'bottom',
            },
          },
          {
            element: '#phone-message',
            popover: {
              title: 'Message',
              description: 'Please enter your Message',
              side: 'bottom',
            },
          },
          {
            element: '#notify-notification',
            popover: {
              title: 'Notify Method',
              description: 'We can notify through in app notification',
              side: 'bottom',
              onNextClick: () => {
                const btn = document.querySelector('#notify-notification');
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
            element: '#notify-message',
            popover: {
              title: 'Message',
              description: 'Please enter your Message',
              side: 'bottom',
            },
          },
          {
            element: '#message-recursion',
            popover: {
              title: 'Message Recursion',
              description: 'We can notify you at regular intervals.',
              side: 'bottom',
            },
          },
          {
            element: '#add-time',
            popover: {
              title: 'Add time',
              description:
                'Please enter your time interval. We will notify you repeatedly at that interval.',
              side: 'bottom',
            },
          },
          {
            element: '#mark-retrigger',
            popover: {
              title: 'Check Retriggering',
              description: 'You can retrigger the messages if you check this.',
              side: 'bottom',
              onNextClick: () => {
                const btn = document.querySelector('#mark-retrigger');
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
            element: '#create-cancel',
            popover: {
              title: 'Create Or Cancel',
              description: 'You can create or cancel the rules.',
              side: 'bottom',
            },
          },
        ],
        onDestroy: () => {
          // Ensure dropdown closes no matter where user stopped
          document.querySelector('.fixed.inset-0.z-10')?.click();
        },
      });

      driverObj.drive();
    }, 1000);

    return () => clearTimeout(timer);
  }, []);
  return null;
}

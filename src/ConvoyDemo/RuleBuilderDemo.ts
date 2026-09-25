// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

export default function RuleBuilderDemo() {
  useEffect(() => {
    const timer = setTimeout(() => {
      const driverObj = driver({
        showProgress: true,
        steps: [
          {
            element: '#add-new-btn',
            popover: {
              title: 'Add New Rule',
              description: 'Please click on this button to add new rule.',
              side: 'bottom',
              onNextClick: () => {
                const btn = document.querySelector('#add-new-btn');
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
    }, 1200);
    return () => clearTimeout(timer);
  }, []);
  return null;
}

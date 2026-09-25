// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useModal } from '@contexts/ModalContext';

export default function ManageProductDemo() {
  const { closeModal } = useModal();

  useEffect(() => {
    const driverObj = driver({
      showProgress: true,
      steps: [
        {
          element: '#add-new-prd',
          popover: {
            title: 'Add New Product',
            description: 'Please click on this button to add new product.',
            side: 'bottom',
            onNextClick: () => {
              const btn = document.querySelector('#add-new-prd');
              if (btn) {
                btn.click();
                driverObj.destroy();
                setTimeout(() => {}, 100);
              }
            },
          },
        },
        // {
        //   element: '#search-prd',
        //   popover: {
        //     title: 'Product search',
        //     description: 'In this field, you can search your product by name.',
        //     side: 'bottom',
        //   },
        // },
        // {
        //   element: '#check-all-id',
        //   popover: {
        //     title: 'Check All',
        //     description: 'Click to select all products to perform bulk actions.',
        //     side: 'bottom',
        //     onNextClick: () => {
        //       const btn = document.querySelector('#check-all-id');
        //       if (btn) {
        //         btn.click();
        //         setTimeout(() => {
        //           driverObj.moveNext();
        //         }, 100);
        //       } else {
        //         driverObj.moveNext();
        //       }
        //     },
        //   },
        // },
        // {
        //   element: '#bulk-id',
        //   popover: {
        //     title: 'Bulk Action',
        //     description: 'Click to delete the select products.',
        //     side: 'bottom',
        //     onNextClick: () => {
        //       const btn = document.querySelector('#bulk-id');
        //       if (btn) {
        //         btn.click();
        //         setTimeout(() => {
        //           driverObj.moveNext();
        //         }, 100);
        //       } else {
        //         driverObj.moveNext();
        //       }
        //     },
        //   },
        // },
        // {
        //   element: '#bulk-item',
        //   popover: {
        //     title: 'Delete product',
        //     description: 'You can delete your selected product.',
        //     side: 'bottom',
        //   },
        // },
        // {
        //   element: '#edit-prd',
        //   popover: {
        //     title: 'Edit Product',
        //     description: 'Click to edit the product',
        //     side: 'bottom',
        //     onNextClick: () => {
        //       const btn = document.querySelector('#edit-prd');
        //       if (btn) {
        //         btn.click();
        //         setTimeout(() => {
        //           driverObj.moveNext();
        //         }, 100);
        //       } else {
        //         driverObj.moveNext();
        //       }
        //     },
        //   },
        // },
      ],
    });

    driverObj.drive();
  }, []);
  return null;
}

import React from 'react';
import { Popover } from '@mui/material';

const CustomPopover = ({
  isOpen,
  anchorEl,
  onClose,
  options = [],
  selectedValue,

  sx = {},
  onChange,
}) => {
  return (
    <Popover
      open={isOpen}
      anchorEl={anchorEl}
      onClose={onClose}
      sx={sx}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    >
      <div className="p-2">
        {options.map((option, index) => (
          <div
            key={index}
            className={`p-2  cursor-pointer ${option === selectedValue ? 'bg-gray-200' : ''}`}
            onClick={() => onChange(option)}
          >
            {option === selectedValue && '✓ '}
            {option}
          </div>
        ))}
      </div>
    </Popover>
  );
};

export default CustomPopover;

// import React from 'react';
// import { useTranslation } from 'react-i18next';

// // Icons - you'll need to import or create these
// const LoRaWANIcon = () => (
//   <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
//     <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
//       <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
//       <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2"/>
//     </svg>
//   </div>
// );

// const APIIcon = () => (
//   <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
//     <span className="text-sm font-bold">API</span>
//   </div>
// );

// const QRCodeIcon = () => (
//   <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
//     <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
//       <rect x="3" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2"/>
//       <rect x="14" y="3" width="7" height="7" stroke="currentColor" strokeWidth="2"/>
//       <rect x="3" y="14" width="7" height="7" stroke="currentColor" strokeWidth="2"/>
//       <rect x="14" y="14" width="3" height="3" fill="currentColor"/>
//       <rect x="18" y="14" width="3" height="3" fill="currentColor"/>
//       <rect x="14" y="18" width="7" height="3" fill="currentColor"/>
//     </svg>
//   </div>
// );

// const DraginoIcon = () => (
//   <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
//     <span className="text-xs font-bold text-blue-600">DG</span>
//   </div>
// );

// const NCEIcon = () => (
//   <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
//     <span className="text-xs font-bold text-blue-600">1NCE</span>
//   </div>
// );

// export default function ConnectivityStepForm({ formData, setFormData }) {
//   const { t } = useTranslation();

//   const connectivityOptions = [
//     {
//       id: 'lorawan',
//       title: 'LoRaWAN',
//       description: 'Choose from 17 LoRaWAN networks',
//       icon: <LoRaWANIcon />
//     },
//     {
//       id: 'api',
//       title: 'API',
//       description: 'Generic API device with support for MQTT and HTTP connectivity',
//       icon: <APIIcon />
//     },
//     {
//       id: 'pincode',
//       title: ' Bluetooth',
//       description: 'Claim an existing device by pincode',
//       icon: <QRCodeIcon />
//     },
//     {
//       id: 'dragino',
//       title: 'NB-IoT',
//       description: 'Connect Dragino NB-IoT devices',
//       icon: <DraginoIcon />
//     },

//     {
//       id: '1nce',
//       title: '4G',
//       description: 'Connect 4G devices',
//       icon: <NCEIcon />
//     },
//     {
//       id: '1ce',
//       title: '5G',
//       description: 'Connect 5 devices',
//       icon: <NCEIcon />
//     }
//   ];

//   const handleOptionSelect = (optionId) => {
//     setFormData(prev => ({
//       ...prev,
//       connectivity: {
//         ...prev.connectivity,
//         isFilled: true,
//         data: {
//           ...prev.connectivity.data,
//           type: optionId,
//           selectedOption: optionId
//         }
//       }
//     }));
//   };

//   return (
//     <div className="mt-8">
//       {/* Header */}
//       <div className="mb-8">
//         <p className="text-gray-600 text-base">
//           First, choose the connectivity type of your device.
//         </p>
//       </div>

//       {/* Connectivity Options */}
//       <div className="space-y-4">
//         {connectivityOptions.map((option) => (
//           <div
//             key={option.id}
//             className={`border rounded-lg p-4 cursor-pointer transition-all duration-200 hover:shadow-md ${
//               formData.connectivity.data.selectedOption === option.id
//                 ? 'border-blue-500 bg-blue-50'
//                 : 'border-gray-200 hover:border-gray-300'
//             }`}
//             onClick={() => handleOptionSelect(option.id)}
//           >
//             <div className="flex items-center space-x-4">
//               {/* Radio Button */}
//               <div className="flex-shrink-0">
//                 <div
//                   className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
//                     formData.connectivity.data.selectedOption === option.id
//                       ? 'border-blue-500 bg-blue-500'
//                       : 'border-gray-300'
//                   }`}
//                 >
//                   {formData.connectivity.data.selectedOption === option.id && (
//                     <div className="w-2 h-2 rounded-full bg-white"></div>
//                   )}
//                 </div>
//               </div>

//               {/* Icon */}
//               <div className="flex-shrink-0">
//                 {option.icon}
//               </div>

//               {/* Content */}
//               <div className="flex-1">
//                 <h3 className="font-semibold text-gray-900 text-lg">
//                   {option.title}
//                 </h3>
//                 <p className="text-gray-600 text-sm mt-1">
//                   {option.description}
//                 </p>
//               </div>
//             </div>
//           </div>
//         ))}
//       </div>

//       {/* Info message */}
//       <div className="mt-6 p-4 bg-gray-50 rounded-lg">
//         <p className="text-sm text-gray-600">
//           <span className="font-medium">Note:</span> You can add individually billed devices.
//         </p>
//       </div>
//     </div>
//   );
// }

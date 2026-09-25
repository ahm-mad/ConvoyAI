import React from 'react';
import { useTranslation } from 'react-i18next';

const LoRaWANIcon = () => (
  <div className="w-12 h-12 bg-accent-cyan/10 text-accent-cyan rounded-full flex items-center justify-center">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
    </svg>
  </div>
);

const APIIcon = () => (
  <div className="w-12 h-12 bg-accent-cyan/10 rounded-full text-accent-cyan flex items-center justify-center">
    <span className="text-sm font-bold">API</span>
  </div>
);

const Bluetooth = () => (
  <div className="w-12 h-12 bg-accent-cyan/10 rounded-full text-accent-cyan flex items-center justify-center">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6.5 6.5 17 17l-5 5V2l5 5L6.5 17.5" />
    </svg>
  </div>
);

const DraginoIcon = () => (
  <div className="w-12 h-12 bg-accent-cyan/10 rounded-full flex items-center justify-center">
    <span className="text-xs font-bold text-accent-cyan">NB</span>
  </div>
);

const NCEIcon = () => (
  <div className="w-12 h-12 bg-accent-cyan/10 rounded-full flex items-center justify-center">
    <span className="text-xs font-bold text-accent-cyan">4G</span>
  </div>
);

const Icon = () => (
  <div className="w-12 h-12 bg-accent-cyan/10 rounded-full flex items-center justify-center">
    <span className="text-xs font-bold text-accent-cyan">5G</span>
  </div>
);

export default function FirststepForm({ formData, setFormData }) {
  const { t } = useTranslation();

  const connectivityOptions = [
    {
      id: 'lorawan',
      title: 'LoRaWAN',
      description: 'Long-range, low-power wireless communication with wide area coverage',
      icon: <LoRaWANIcon />,
    },
    {
      id: 'api',
      title: 'API',
      description: 'Direct API integration with custom endpoints and data formats',
      icon: <APIIcon />,
    },
    {
      id: 'pincode',
      title: 'Bluetooth',
      description: 'Short-range wireless communication for nearby device connections',
      icon: <Bluetooth />,
    },
    {
      id: 'dragino',
      title: 'NB-IoT',
      description: 'Narrowband IoT for efficient cellular connectivity and extended battery life',
      icon: <DraginoIcon />,
    },
    {
      id: '1nce',
      title: '4G LTE',
      description: 'High-speed cellular connectivity with reliable data transmission',
      icon: <NCEIcon />,
    },
    {
      id: '1ce',
      title: '5G',
      description: 'Next-generation cellular with ultra-fast speeds and low latency',
      icon: <Icon />,
    },
  ];

  const handleOptionSelect = optionId => {
    setFormData(prev => ({
      ...prev,
      connectivity: {
        ...prev.connectivity,
        isFilled: true,
        data: {
          ...prev.connectivity.data,
          type: optionId,
          selectedOption: optionId,
        },
      },
    }));
  };

  return (
    <div className="mt-8">
      {/* Header */}
      <div className="mb-8">
        <p className="text-ink-2 text-sm">First, choose the connectivity type of your device.</p>
      </div>

      {/* Connectivity Options */}
      <div className="space-y-4">
        {connectivityOptions.map(option => (
          <div
            key={option.id}
            id={`connectivity-option-${option.id}`}
            className={`border rounded-md p-4 cursor-pointer transition-all duration-200 ${
              formData.connectivity.data.selectedOption === option.id
                ? 'border-accent-cyan bg-accent-cyan/5'
                : 'border-line-soft hover:border-line'
            }`}
            onClick={() => handleOptionSelect(option.id)}
          >
            <div className="flex items-center space-x-4">
              {/* Radio Button */}
              <div className="flex-shrink-0">
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    formData.connectivity.data.selectedOption === option.id
                      ? 'border-accent-cyan bg-accent-cyan'
                      : 'border-line'
                  }`}
                >
                  {formData.connectivity.data.selectedOption === option.id && (
                    <div className="w-2 h-2 rounded-full bg-[#001820]"></div>
                  )}
                </div>
              </div>

              {/* Icon */}
              <div className="flex-shrink-0">{option.icon}</div>

              {/* Content */}
              <div className="flex-1">
                <h3 className="font-semibold text-ink-0 text-sm">{option.title}</h3>
                <p className="text-ink-2 text-xs mt-1">{option.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

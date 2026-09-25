import React from 'react';

export default function WaterLeakSvg() {
  return (
    <svg
      viewBox="0 0 313 138"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x="30" y="25" width="250" height="80" rx="8" fill="#399ACD" fillOpacity="0.64" />
      <rect
        x="25"
        y="20"
        width="260"
        height="90"
        rx="13"
        stroke="#20415F"
        strokeOpacity="0.8"
        strokeWidth="10"
      />
      <g filter="url(#filter0_d_8_67)">
        <path
          d="M9 8C9 6.34314 10.3431 5 12 5H36C37.6569 5 39 6.34315 39 8V122C39 123.657 37.6569 125 36 125H12C10.3431 125 9 123.657 9 122V8Z"
          fill="#0F1D2A"
          stroke="#20415F"
          strokeWidth="10"
        />
      </g>
      <g filter="url(#filter1_d_8_67)">
        <rect
          x="274"
          y="5"
          width="30"
          height="120"
          rx="3"
          fill="#0F1D2A"
          stroke="#20415F"
          strokeWidth="10"
        />
      </g>
      <path d="M133.202 25H44V105H144L133.202 25Z" fill="#295A87" fillOpacity="0.3" />
      <defs>
        <filter
          id="filter0_d_8_67"
          x="0"
          y="0"
          width="48"
          height="138"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="4" />
          <feGaussianBlur stdDeviation="2" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_8_67" />
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_8_67" result="shape" />
        </filter>
        <filter
          id="filter1_d_8_67"
          x="265"
          y="0"
          width="48"
          height="138"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="4" />
          <feGaussianBlur stdDeviation="2" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_8_67" />
          <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_8_67" result="shape" />
        </filter>
      </defs>
    </svg>
  );
}

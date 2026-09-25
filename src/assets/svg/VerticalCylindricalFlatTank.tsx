import React, { useState } from 'react';

const VerticalCylindricalFlatTank = ({ fillPercentage = 0, fillColor = 'orange' }) => {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0 });

  const clamped = Math.max(0, Math.min(100, fillPercentage));
  const topY = 20; // top fill area (y of top part of tank)
  const bottomY = 80.9; // bottom of tank
  const maxFillHeight = bottomY - topY;
  const fillHeight = (clamped / 100) * maxFillHeight;
  const fillY = bottomY - fillHeight;

  const handleMouseMove = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({
      visible: true,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div className="w-full h-full relative">
      <svg
        className="w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
      >
        <defs>
          <clipPath id="vertical-flat-clip">
            <path d="M37.6 20L25 26.5V80.9h37.3l12.6-6.5V20z" />
          </clipPath>
        </defs>

        {/* Tank Background */}
        <path d="M37.6 20L25 26.5V80.9h37.3l12.6-6.5V20z" fill="#399ACD" opacity="0.1" />

        {/* Fill */}
        <rect
          x="25"
          y={fillY}
          width="50"
          height={fillHeight}
          fill={fillColor}
          opacity="0.6"
          clipPath="url(#vertical-flat-clip)"
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseMove}
          onMouseLeave={() => setTooltip({ ...tooltip, visible: false })}
        />

        {/* Tank Lines (unchanged) */}
        <path
          d="M74.9 74.4V20H37.6L25 26.5V80.9h37.3z"
          stroke="#1263AD"
          strokeWidth="1"
          fill="none"
        />
        <path
          d="M37.6 74.4V20"
          stroke="#1263AD"
          strokeWidth="1"
          fill="none"
          strokeDasharray="1,1"
          opacity="0.5"
        />
        <path
          d="M74.9 20l-12.6 6.5v54.4M25 26.5h37.3"
          stroke="#1263AD"
          strokeWidth="1"
          fill="none"
        />
        <path
          d="M25 80.9l12.6-6.5M74.9 74.4H37.6"
          stroke="#1263AD"
          strokeWidth="1"
          fill="none"
          strokeDasharray="1,1"
          opacity="0.5"
        />
      </svg>

      {/* Tooltip */}
      {tooltip.visible && (
        <div
          className="absolute px-2 py-1 text-xs text-white bg-black rounded shadow pointer-events-none"
          style={{
            top: tooltip.y,
            left: tooltip.x,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {`Fill: ${clamped.toFixed(1)}%`}
        </div>
      )}
    </div>
  );
};

export default VerticalCylindricalFlatTank;

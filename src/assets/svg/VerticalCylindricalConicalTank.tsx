import React, { useState } from 'react';

const VerticalCylindricalConicalTank = ({ fillPercentage = 0, fillColor = '#399ACD' }) => {
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0 });

  const clampedPercentage = Math.max(0, Math.min(100, fillPercentage));
  const fillHeight = (clampedPercentage / 100) * 60;
  const fillY = 85 - fillHeight;

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
      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        <defs>
          <clipPath id="tank-clip">
            <path d="M74.9 24.1v52.8c0 4.5-11.2 8.1-25 8.1C36.2 85 25 81.4 25 76.9V24.1c0-4.5 11.2-8.1 25-8.1 13.7 0 24.9 3.6 24.9 8.1z" />
          </clipPath>
        </defs>

        {/* Tank background */}
        <path
          d="M74.9 24.1v52.8c0 4.5-11.2 8.1-25 8.1C36.2 85 25 81.4 25 76.9V24.1c0-4.5 11.2-8.1 25-8.1 13.7 0 24.9 3.6 24.9 8.1"
          fill={fillColor}
          opacity="0.1"
        />

        {/* Fill area with custom tooltip trigger */}
        <rect
          x="25"
          y={fillY}
          width="50"
          height={fillHeight}
          fill="orange"
          opacity="0.6"
          clipPath="url(#tank-clip)"
          onMouseMove={handleMouseMove}
          onMouseEnter={handleMouseMove}
          onMouseLeave={() => setTooltip({ ...tooltip, visible: false })}
          style={{ cursor: 'pointer' }}
        />

        {/* Tank outline */}
        <path
          d="M74.9 24.1v52.8c0 4.5-11.2 8.1-25 8.1C36.2 85 25 81.4 25 76.9V24.1c0-4.5 11.2-8.1 25-8.1 13.7 0 24.9 3.6 24.9 8.1z"
          stroke="#1263AD"
          strokeWidth="1"
          fill="none"
        />
        <path
          d="M25 76.9c0-4.5 11.2-8.1 25-8.1s24.9 3.6 24.9 8.1"
          stroke="#1263AD"
          strokeWidth="1"
          fill="none"
        />
        <path
          d="M25 24.1c0 4.5 11.2 8.1 25 8.1s24.9-3.6 24.9-8.1"
          stroke="#1263AD"
          strokeWidth="1"
          fill="none"
          strokeDasharray="1,1"
          opacity="0.5"
        />
      </svg>

      {/* Custom tooltip */}
      {tooltip.visible && (
        <div
          className="absolute px-2 py-1 text-xs text-white bg-black rounded shadow"
          style={{
            top: tooltip.y,
            left: tooltip.x,
            transform: 'translate(-50%, -100%)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {`Fill: ${clampedPercentage.toFixed(1)}%`}
        </div>
      )}
    </div>
  );
};

export default VerticalCylindricalConicalTank;

import React from 'react';
import { BaseEdge, getBezierPath } from 'reactflow';

const AnimatedEdge = ({ id, sourceX, sourceY, targetX, targetY, markerEnd }) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: 'var(--color-accent-cyan)',
          strokeWidth: 1.5,
          strokeDasharray: '5',
          strokeDashoffset: '0',
          animation: 'dashmove 1s linear infinite',
          opacity: 0.7,
        }}
      />
      <style>
        {`
          @keyframes dashmove {
            to {
              stroke-dashoffset: -10;
            }
          }
        `}
      </style>
    </>
  );
};

export default AnimatedEdge;

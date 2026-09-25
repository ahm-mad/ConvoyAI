import CircleChevronUp from '@assets/icons/ReactIcon/CircleChevronUp';
import CircleChevronDown from '@assets/icons/ReactIcon/CircleChevronDown';
import { useState } from 'react';

const ReuseAbleSetting = ({ className, children }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleSize = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div>
      <div
        className={` ${className} glass  rounded-md p-3  w-auto h-auto "
        } mt-2 transition-all duration-300`}
      >
        {isExpanded ? (
          <CircleChevronDown
            className="text-ink-2  w-6 h-6 cursor-pointer hover:text-ink-0 transition-colors"
            onClick={toggleSize}
          />
        ) : (
          <CircleChevronUp
            className="text-ink-2  w-6 h-6 cursor-pointer hover:text-ink-0 transition-colors"
            onClick={toggleSize}
          />
        )}
        {isExpanded && <div>{children}</div>}
      </div>
    </div>
  );
};

export default ReuseAbleSetting;

// import { CircleChevronUp, CircleChevronDown } from "lucide-react";
import CircleChevronUp from '@assets/icons/ReactIcon/CircleChevronUp';
import CircleChevronDown from '@assets/icons/ReactIcon/CircleChevronDown';
import { useState } from 'react';

const Settings = () => {
  const [isExpanded, setIsExpanded] = useState(true);

  const toggleSize = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div>
      <div
        className={`bg-gray-200 rounded-xl w-${isExpanded ? '[760px]' : '[752px]'} h-${isExpanded ? '[500px]' : '[50px]'} mt-2 transition-all duration-300`}
      >
        {isExpanded ? (
          <CircleChevronDown className="text-gray-400 cursor-pointer" onClick={toggleSize} />
        ) : (
          <CircleChevronUp className="text-gray-400 cursor-pointer" onClick={toggleSize} />
        )}
      </div>
    </div>
  );
};

export default Settings;

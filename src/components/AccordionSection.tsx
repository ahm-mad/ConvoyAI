import React from 'react';
import { ChevronDown } from 'lucide-react';

const AccordionSection = ({ title, isOpen, icon, onToggle, children, isExpanded = true }) => {
  return (
    <div className="w-full">
      {/* Header */}
      <div
        onClick={onToggle}
        className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-ink-2 cursor-pointer hover:text-ink-0 transition-colors duration-200 select-none ${
          isExpanded ? 'flex items-center justify-between' : 'flex items-center justify-center'
        }`}
      >
        <div className={`flex items-center ${!isExpanded ? 'justify-center' : ''}`}>
          {icon && <span className="transition-transform duration-200 text-ink-2">{icon}</span>}
          <span
            className={`transition-all duration-300 ${
              !isExpanded ? 'opacity-0 w-0 ml-0' : 'opacity-100 w-auto ml-2'
            }`}
          >
            {title}
          </span>
        </div>

        {isExpanded && (
          <ChevronDown
            size={12}
            className={`transition-all duration-300 ease-in-out transform ${
              isOpen ? 'rotate-180' : 'rotate-0'
            } text-ink-2 hover:text-ink-0`}
          />
        )}
      </div>

      {/* Content with smooth Tailwind animation */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div
          className={`pb-2 transform transition-transform duration-300 ${
            isOpen ? 'translate-y-0' : '-translate-y-2'
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export default AccordionSection;

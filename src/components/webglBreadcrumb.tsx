import React from 'react';
import { ChevronRight } from 'lucide-react';

const Breadcrumb = ({ items }) => {
  return (
    <nav className="flex flex-wrap  max-lg:-mt-3  max-md:-mt-4   items-center  justify-center text-base max-lg:text-xs text-white gap-1">
      {items.map((item, index) => (
        <React.Fragment key={index}>
          <span
            className={`  ${
              index === items.length - 1
                ? 'text-[#29d3ff] font-semibold'
                : 'hover:text-white/70 cursor-pointer'
            } truncate max-w-[110px]`}
            title={item?.name} // show full text on hover
          >
            {item?.name}
          </span>
          {index < items.length - 1 && (
            <ChevronRight size={14} className="text-white/40 shrink-0" />
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};

export default Breadcrumb;

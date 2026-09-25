import React from 'react';

const FilterButton = ({ label, Icon, onClick, className }) => {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 border-r border-gray-200 h-full p-2 font-medium cursor-pointer ${className}`}
    >
      <span>{label}</span>
      <div className="hover:bg-gray-200 rounded-lg text-blue-700">
        {Icon && <Icon fontSize="small" className="m-1" />}
      </div>
    </div>
  );
};

export default FilterButton;

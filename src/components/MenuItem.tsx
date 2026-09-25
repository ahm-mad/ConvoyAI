import type { MouseEvent, ReactNode } from 'react';
import { NavLink } from '@lib/router-compat';
import { ChevronDown } from 'lucide-react';

interface MenuItemProps {
  icon?: ReactNode;
  text?: ReactNode;
  route?: string;
  active?: boolean;
  badge?: ReactNode;
  hasDropdown?: boolean;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  /** Controls sidebar open/collapse */
  isExpanded?: boolean;
}

const MenuItem = ({
  icon,
  text,
  route = '#',
  active = false,
  badge,
  hasDropdown = false,
  onClick,
  isExpanded = true,
}: MenuItemProps) => {
  return (
    <NavLink
      to={route}
      onClick={onClick}
      className={({ isActive }: { isActive: boolean }) =>
        `px-4 py-3 w-full flex items-center justify-between hover:bg-gray-50 transition-all duration-200 ease-in-out transform hover:translate-x-1 ${
          active || isActive
            ? 'bg-blue-50 border-r-2 border-blue-500 text-blue-600'
            : 'text-gray-700'
        }`
      }
    >
      {/* Left Side: Icon + Text */}
      <div className="flex items-center">
        {icon && <span className="mr-3 transition-transform duration-200">{icon}</span>}
        <span
          className={`transition-all duration-300 ${
            !isExpanded ? 'opacity-0 w-0' : 'opacity-100 w-auto'
          } text-sm whitespace-nowrap`}
        >
          {text}
        </span>
      </div>

      {/* Right Side: Badge + Dropdown Arrow */}
      {isExpanded && (
        <div className="flex items-center transition-all duration-300">
          {badge && (
            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-500 rounded transition-all duration-200">
              {badge}
            </span>
          )}
          {hasDropdown && (
            <ChevronDown size={12} className="text-gray-400 ml-2 transition-colors duration-200" />
          )}
        </div>
      )}
    </NavLink>
  );
};

export default MenuItem;

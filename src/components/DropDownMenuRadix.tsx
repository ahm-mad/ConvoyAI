// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

const DropdownMenuRadix = ({
  trigger,
  options = [],
  side = 'bottom',
  align = 'end',
  sideOffset = 5,
  id,
}: {
  trigger?: any;
  options?: any[];
  side?: string;
  align?: string;
  sideOffset?: number;
  id?: string;
}) => {
  return (
    <DropdownMenu.Root>
      {/* Trigger can be ANY element */}
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>

      {/* Menu Content */}
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          className="min-w-[220px] max-h-60 overflow-y-auto bg-white border border-line rounded-xl shadow-lg p-1 z-50"
        >
          {options.map((option, idx) => (
            <DropdownMenu.Item
              key={idx}
              onClick={option.onClick}
              className={`p-2 text-sm flex items-center gap-2 rounded cursor-pointer 
                focus:outline-none hover:bg-surface-3 text-ink-1 hover:text-ink-0 ${option.className || ''}`}
            >
              {option.icon && <span className="w-4 h-4">{option.icon}</span>}
              {option.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

export default DropdownMenuRadix;

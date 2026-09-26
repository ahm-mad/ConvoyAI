// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState } from 'react';
import { EllipsisVertical, Trash, Edit, UserPlus, Users } from 'lucide-react';
import { useNavigate } from '@lib/router-compat';
import { HexagonBadge } from '../assets/svg/hexagon-badge';
import DropdownMenu from './DropDownMenuRadix';
import { useModal } from '@contexts/ModalContext';
import AddMemberForm from './AddMemberForm';
import { del } from '../utils/apiHelper';

const CardRole = ({
  id,
  path,
  title,
  subTitle,
  description,
  team,
  badge,
  onRoleDeleted,
  onSuccess = () => {},
  onClose = () => {},
}) => {
  const { openModal, closeModal } = useModal();
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleAddMember = () => {
    openModal(<AddMemberForm roleId={id} onClose={closeModal} />);
  };

  const handleViewMembers = () => {
    navigate(`/members?role=${id}`);
  };

  const handleEditRole = () => {
    navigate(`/assign-permission/${id}`);
  };

  const runDelete = async () => {
    if (isDeleting) return;

    setIsDeleting(true);
    try {
      const response = await del(`/api/roles/${id}/delete`);

      if (response?.success) {
        // alert('Role deleted successfully');

        if (onRoleDeleted) {
          onRoleDeleted(id);
        }
      } else {
        // alert(response?.message || 'Failed to delete role');
      }
    } catch (error) {
      console.error('Failed to delete role:', error);
      // alert('An error occurred while deleting the role. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteRole = () => {
    openModal(
      <div className="w-[420px] max-w-full">
        <h2 className="card-title">Delete role “{title}”?</h2>
        <p className="card-subtitle mt-2">
          Members lose the access this role gives them. A role that still has members cannot be
          deleted.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={closeModal} className="btn-soft">
            Keep role
          </button>
          <button
            type="button"
            onClick={() => {
              closeModal();
              runDelete();
            }}
            className="btn-soft-danger"
          >
            Delete role
          </button>
        </div>
      </div>
    );
  };

  const menuOptions = [
    {
      label: 'Add Member',
      icon: <UserPlus size={16} />,
      onClick: handleAddMember,
    },
    {
      label: 'View Members',
      icon: <Users size={16} />,
      onClick: handleViewMembers,
    },
    {
      label: 'Edit Role',
      icon: <Edit size={16} />,
      onClick: handleEditRole,
    },
    {
      label: 'Delete Role',
      icon: <Trash size={16} />,
      className: 'text-danger hover:bg-danger/10',
      onClick: handleDeleteRole,
      disabled: isDeleting,
    },
  ];

  return (
    <div className="flex flex-col gap-3 sm:gap-3.5 md:gap-4 p-3.5 sm:p-4 lg:p-5 min-h-[180px] sm:min-h-[200px] md:h-52 glass-strong  card-lift">
      <div className="flex items-start sm:items-center flex-wrap justify-between gap-2">
        <div className="flex items-start sm:items-center gap-2 sm:gap-2.5 flex-1 min-w-0">
          <div className="flex-shrink-0">
            <HexagonBadge
              badge={<Users className="w-4 h-4 sm:w-5 sm:h-5 text-accent-cyan" />}
              size="w-8 h-8 sm:w-10 sm:h-10"
              stroke="stroke-accent-cyan"
              fill="fill-accent-cyan/10"
            />
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <div className="text-sm sm:text-base font-medium text-ink-0 hover:text-accent-cyan mb-px truncate">
              {title}
            </div>
            <span className="text-xs sm:text-sm text-ink-2 truncate">{subTitle}</span>
          </div>
        </div>
        <div className="flex-shrink-0">
          <DropdownMenu
            trigger={
              <button
                className="p-1.5 sm:p-2 hover:bg-surface-3 rounded-sm text-ink-2 hover:text-ink-0 transition-colors"
                aria-label="Role actions"
                disabled={isDeleting}
              >
                <EllipsisVertical className="w-4 h-4 sm:w-5 sm:h-5 cursor-pointer" />
              </button>
            }
            options={menuOptions}
          />
        </div>
      </div>
      <p className="text-xs sm:text-sm text-ink-1 line-clamp-2 sm:line-clamp-3 flex-1">
        {description}
      </p>
      <span className="text-xs sm:text-sm text-ink-1 font-medium mt-auto">
        {team} {team === 1 ? 'member' : 'members'}
      </span>
    </div>
  );
};

export default CardRole;

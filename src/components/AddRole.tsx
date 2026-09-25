// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import React, { useState } from 'react';
import GlobalInput from './Input';
import CrossIcon from '../assets/icons/MUIicons/CrossIcon';
import Button from '../components/Button';
import { useModal } from '@contexts/ModalContext';
import SelectReuseAble from './Select';
import { useTranslation } from 'react-i18next';
function AddRole() {
  const { t } = useTranslation();
  const { closeModal } = useModal();

  const [selectedRole, setSelectedRole] = useState('');

  const roleOptions = [
    { label: 'Admin', value: 'admin' },
    { label: 'User', value: 'user' },
    { label: 'Super Admin', value: 'super_admin' },
    { label: 'Manager', value: 'manager' },
  ];

  const handleSave = () => {
    alert(`Role saved successfully!\nSelected Role: ${selectedRole}`);
  };

  return (
    <div className="rounded-lg w-[600px]">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-gray-800">{t('addRole.title')}</h2>
        <button onClick={closeModal} className="text-gray-500 hover:text-red-500">
          <CrossIcon className="h-5 w-5" />
        </button>
      </div>
      <div className="space-y-4">
        <div className="flex items-center">
          <div className="w-1/3 text-gray-700 font-medium">
            <span>{t('addRole.roleName')}</span>
          </div>
          <div className="w-2/3">
            <GlobalInput size="small" />
          </div>
        </div>

        <div className="flex items-center">
          <div className="w-1/3 text-gray-700 font-medium">
            <span>{t('addRole.selectRoleType')}</span>
          </div>
          <div className="w-2/3">
            <SelectReuseAble
              options={roleOptions}
              label={t('addRole.selectAnOption')}
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <Button
          onClick={closeModal}
          sx={{
            backgroundColor: 'var(--color-text-light)',
            padding: '8px 24px',
            borderRadius: '6px',
          }}
        >
          {t('addRole.cancel')}
        </Button>

        <Button
          onClick={handleSave}
          sx={{
            backgroundColor: 'var(--color-primary)',
            color: '#fff',
            padding: '8px 24px',
            borderRadius: '6px',
          }}
        >
          {t('addRole.save')}
        </Button>
      </div>
    </div>
  );
}

export default AddRole;

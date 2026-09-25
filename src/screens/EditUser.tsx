/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { Settings, Package } from 'lucide-react';
import ManageProduct from './ManageProductConfig';
import AccountSetting from './AccountSettings';
import { useParams } from '@lib/router-compat';
import { useSimpleQuery } from '@hooks/useSimpleQuery';

interface TabComponentProps {
  passedUserId?: any;
}

// Products Tab Component
const ProductsTab = ({ passedUserId }: TabComponentProps) => {
  return <ManageProduct passedUserId={passedUserId} />;
};

const UserSettingsTab = ({ passedUserId }: TabComponentProps) => {
  return <AccountSetting passedUserId={passedUserId} />;
};

// Main App Component
export default function App() {
  const { id } = useParams<{ id: string }>(); // Get id from URL parameter

  console.log('User ID from URL:', id);

  const [activeTab, setActiveTab] = useState('products');

  const {
    data: profileData,
    isLoading,
    refetch,
  } = useSimpleQuery(['user-profile', id], `/api/profile`, {
    user_id: id,
  });

  console.log('Profile Data:', profileData);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (profileData?.data) {
      const userData = profileData.data;
      setFormData({
        firstName: userData.first_name || '',
        lastName: userData.last_name || '',
        email: userData.email || '',
        phone: userData.number || userData.phone || '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    }
  }, [profileData]);

  const tabs: {
    id: string;
    label: string;
    icon: ComponentType<{ className?: string }>;
    component: ComponentType<TabComponentProps>;
  }[] = [
    { id: 'products', label: 'Products', icon: Package, component: ProductsTab },
    { id: 'settings', label: 'User Settings', icon: Settings, component: UserSettingsTab },
    // { id: 'users', label: 'Internal Users', icon: Users, component: InternalUsersTab },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-ink-2 text-sm">Loading user data...</div>
      </div>
    );
  }

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component;

  return (
    <div className="">
      {/* Tab Navigation */}
      <div className="border-b border-line">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-6">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-1.5 max-md:text-[10px] cursor-pointer px-0.5 py-3 border-b-2 font-medium text-xs transition-colors
                    ${
                      activeTab === tab.id
                        ? 'border-accent-cyan text-ink-0'
                        : 'border-transparent text-ink-2 hover:text-ink-1 hover:border-line'
                    }
                  `}
                >
                  <Icon className="w-4 h-4 max-md:w-3.5 max-md:h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto">
        {ActiveComponent && <ActiveComponent passedUserId={id} />}
      </div>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from '@lib/router-compat';
import { Users, Package } from 'lucide-react';

import AllUser from './AllUser';
import AccountSetting from './AccountSettings';
import Allasset from './AllAsset';
import { useSimpleQuery } from '@hooks/useSimpleQuery';

interface TabNavigationProps {
  activeTab: string;
  companyId?: string;
  companyName?: string;
}

const TabNavigation = ({ activeTab, companyId, companyName }: TabNavigationProps) => {
  const navigate = useNavigate();

  const tabs = [
    { id: 'users', label: 'Users', icon: <Users size={16} /> },
    // { id: 'company-settings', label: 'Company Settings', icon: <Settings size={16} /> },
    { id: 'assets', label: 'Assets', icon: <Package size={16} /> },
  ];

  const handleTabClick = (tabId: string) => {
    navigate(`/companies/${companyId}/${tabId}`, {
      state: { companyName },
    });
  };

  return (
    <div className="border-b border-line mb-4">
      <nav className="flex gap-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={`py-2.5 px-0.5 border-b-2 font-medium cursor-pointer text-xs flex items-center gap-1.5 transition-colors ${
              activeTab === tab.id
                ? 'border-accent-cyan text-ink-0'
                : 'border-transparent text-ink-2 hover:text-ink-1 hover:border-line'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
};

const CompanyEditView = () => {
  const { companyId } = useParams<{ companyId: string }>();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('users');

  // Fetch single company data
  const {
    data: companyData,
    isLoading,
    refetch,
  } = useSimpleQuery(['company-detail', companyId], `/api/companies/${companyId}`, {});

  const company: any = companyData?.data;
  const companyName = location.state?.companyName || company?.name || `Company ${companyId}`;

  // Set active tab based on URL
  useEffect(() => {
    const pathParts = location.pathname.split('/');
    const lastPart = pathParts[pathParts.length - 1];

    if (['users', 'company-settings', 'assets'].includes(lastPart)) {
      setActiveTab(lastPart);
    }
  }, [location.pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-6 bg-surface-3 rounded w-1/4 mb-2"></div>
            <div className="h-3 bg-surface-3 rounded w-1/3 mb-5"></div>
            <div className="h-10 bg-surface-3 rounded mb-5"></div>
            <div className="h-96 bg-surface-3 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-[13px] font-semibold text-ink-0 font-display">{companyName}</h1>
          <p className="text-xs text-ink-2 mt-0.5">Manage company information and settings</p>
        </div>

        {/* Tab Navigation */}
        <TabNavigation activeTab={activeTab} companyId={companyId} companyName={companyName} />

        {/* Tab Content */}
        <div className="bg-surface-1 rounded-md border border-line-soft">
          {activeTab === 'users' && (
            <AllUser
              users={company?.users || []}
              companyId={companyId}
              onRefetch={refetch} // Now passing the refetch function
            />
          )}
          {activeTab === 'company-settings' && <AccountSetting companyId={companyId} />}
          {activeTab === 'assets' && <Allasset />}
        </div>
      </div>
    </div>
  );
};

export default CompanyEditView;

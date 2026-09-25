import React, { useState } from 'react';
import { Check } from 'lucide-react';

const PermissionsCheck = () => {
  const [permissions, setPermissions] = useState({
    workspaceSettings: { view: false, modify: false, publish: false, configure: false },
    billingManagement: { view: false, modify: false, publish: true, configure: true },
    integrationSetup: { view: true, modify: false, publish: true, configure: false },
    mapCreation: { view: true, modify: true, publish: true, configure: true },
    dataExport: { view: true, modify: false, publish: false, configure: false },
    userRoles: { view: true, modify: false, publish: false, configure: false },
    securitySettings: { view: true, modify: false, publish: false, configure: false },
    insightsAccess: { view: false, modify: false, publish: false, configure: false },
    merchantList: { view: true, modify: true, publish: false, configure: false },
  });

  const handleCheckboxChange = (module, permission) => {
    setPermissions(prev => ({
      ...prev,
      [module]: {
        ...prev[module],
        [permission]: !prev[module][permission],
      },
    }));
  };

  const handleRestoreDefaults = () => {
    setPermissions({
      workspaceSettings: { view: false, modify: false, publish: false, configure: false },
      billingManagement: { view: false, modify: false, publish: true, configure: true },
      integrationSetup: { view: true, modify: false, publish: true, configure: false },
      mapCreation: { view: true, modify: true, publish: true, configure: true },
      dataExport: { view: true, modify: false, publish: false, configure: false },
      userRoles: { view: true, modify: false, publish: false, configure: false },
      securitySettings: { view: true, modify: false, publish: false, configure: false },
      insightsAccess: { view: false, modify: false, publish: false, configure: false },
      merchantList: { view: true, modify: true, publish: false, configure: false },
    });
  };

  const handleSaveChanges = () => {
    alert('Changes saved successfully!');
  };

  const modules = [
    { key: 'workspaceSettings', label: 'Workspace Settings' },
    { key: 'billingManagement', label: 'Billing Management' },
    { key: 'integrationSetup', label: 'Integration Setup' },
    { key: 'mapCreation', label: 'Map Creation' },
    { key: 'dataExport', label: 'Data Export' },
    { key: 'userRoles', label: 'User Roles' },
    { key: 'securitySettings', label: 'Security Settings' },
    { key: 'insightsAccess', label: 'Insights Access' },
    { key: 'merchantList', label: 'Merchant List' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">Permissions - Check</h1>
          <p className="text-gray-600">Overview of all team members and roles.</p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-lg shadow">
          {/* Card Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div>
              <span className="text-blue-600 font-medium text-lg">Project Manager </span>
              <span className="text-gray-900 font-medium text-lg">Role Permissions</span>
            </div>
            <button className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50">
              New Permission
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Module</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-gray-700">View</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-gray-700">
                    Modify
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-gray-700">
                    Publish
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-gray-700">
                    Configure
                  </th>
                </tr>
              </thead>
              <tbody>
                {modules.map((module, index) => (
                  <tr
                    key={module.key}
                    className={index !== modules.length - 1 ? 'border-b border-gray-200' : ''}
                  >
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{module.label}</td>
                    {['view', 'modify', 'publish', 'configure'].map(permission => (
                      <td key={permission} className="px-6 py-4 text-center">
                        <div className="flex justify-center">
                          <button
                            onClick={() => handleCheckboxChange(module.key, permission)}
                            className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                              permissions[module.key][permission]
                                ? 'bg-blue-600 hover:bg-blue-700'
                                : 'border-2 border-gray-300 hover:border-gray-400'
                            }`}
                          >
                            {permissions[module.key][permission] && (
                              <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                            )}
                          </button>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer Buttons */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              onClick={handleRestoreDefaults}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Restore Defaults
            </button>
            <button
              onClick={handleSaveChanges}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PermissionsCheck;

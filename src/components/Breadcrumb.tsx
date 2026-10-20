import { Link, useLocation, useNavigate } from '@lib/router-compat';
import { ChevronRight, ArrowLeft } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  path: string | null;
}

export default function Breadcrumb() {
  const location = useLocation();
  const navigate = useNavigate();

  const getBreadcrumbItems = (pathname: string): BreadcrumbItem[] => {
    // Static route matches
    const routeMap: Record<string, BreadcrumbItem[]> = {
      '/home': [{ label: 'Home', path: null }],
      '/assets': [
        { label: 'Home', path: '/home' },
        { label: 'Assets', path: null },
      ],
      '/manage-product': [
        { label: 'Home', path: '/home' },
        { label: 'Manage Product', path: null },
      ],
      '/documentation': [
        { label: 'Home', path: '/home' },
        { label: 'Documentation', path: null },
      ],
      '/map': [
        { label: 'Home', path: '/home' },
        { label: 'Map', path: null },
      ],
      '/profile': [
        { label: 'Home', path: '/home' },
        { label: 'Profile', path: null },
      ],
      '/company-location': [
        { label: 'Home', path: '/home' },
        { label: 'Company Location', path: null },
      ],
      '/account-setting': [
        { label: 'Home', path: '/home' },
        { label: 'Account Settings', path: null },
      ],
      '/roles-permission': [
        { label: 'Home', path: '/home' },
        { label: 'Roles', path: null },
      ],
      '/members': [
        { label: 'Home', path: '/home' },
        { label: 'Members', path: null },
      ],
      '/integration': [
        { label: 'Home', path: '/home' },
        { label: 'Integration', path: null },
      ],
      '/rule-builder': [
        { label: 'Home', path: '/home' },
        { label: 'Rule Builder', path: null },
      ],
      '/new-rule': [
        { label: 'Home', path: '/home' },
        { label: 'Rule Builder', path: '/rule-builder' },
        { label: 'Add New Rule', path: null },
      ],
      '/analytics': [{ label: 'Analytics', path: null }],
      '/users': [
        { label: 'Analytics', path: '/analytics' },
        { label: 'Users', path: null },
      ],
      '/all-products': [
        { label: 'Analytics', path: '/analytics' },
        { label: 'All Products', path: null },
      ],
      '/companies': [
        { label: 'Analytics', path: '/analytics' },
        { label: 'Companies', path: null },
      ],
      '/internal-user': [
        { label: 'Analytics', path: '/home' },
        { label: 'Internal User', path: null },
      ],
      '/assign-permission': [
        { label: 'Analytics', path: '/home' },
        { label: 'Assign Permission', path: null },
      ],
    };

    // Check for exact matches first
    if (routeMap[pathname]) {
      return routeMap[pathname];
    }

    // Pattern: /users/:userId/profile
    const userProfileMatch = pathname.match(/^\/users\/(.+)\/profile$/);
    if (userProfileMatch) {
      return [
        { label: 'Home', path: '/analytics' },
        { label: 'Users', path: '/users' },
        { label: 'Profile', path: null },
      ];
    }

    // Pattern: /users/:userId/security
    const userSecurityMatch = pathname.match(/^\/users\/(.+)\/security$/);
    if (userSecurityMatch) {
      return [
        { label: 'Home', path: '/analytics' },
        { label: 'Users', path: '/users' },
        { label: 'Security', path: null },
      ];
    }

    // Pattern: /users/:userId/activity
    const userActivityMatch = pathname.match(/^\/users\/(.+)\/activity$/);
    if (userActivityMatch) {
      return [
        { label: 'Home', path: '/analytics' },
        { label: 'Users', path: '/users' },
        { label: 'Activity', path: null },
      ];
    }

    // Pattern: /all-products/:productId/devices
    const allProductDevicesMatch = pathname.match(/^\/all-products\/(.+)\/devices$/);
    if (allProductDevicesMatch) {
      return [
        { label: 'Analytics', path: '/analytics' },
        { label: 'All Products', path: '/all-products' },
        { label: 'Devices', path: null },
      ];
    }

    // Pattern: /all-products/:productId/configuration
    const allProductConfigMatch = pathname.match(/^\/all-products\/(.+)\/configuration$/);
    if (allProductConfigMatch) {
      return [
        { label: 'Analytics', path: '/analytics' },
        { label: 'All Products', path: '/all-products' },
        { label: 'Configuration', path: null },
      ];
    }

    // Pattern: /all-products/:productId/integration
    const allProductIntegrationMatch = pathname.match(/^\/all-products\/(.+)\/integration$/);
    if (allProductIntegrationMatch) {
      return [
        { label: 'Analytics', path: '/analytics' },
        { label: 'All Products', path: '/all-products' },
        { label: 'Integration', path: null },
      ];
    }

    // Pattern: /companies/:companyId/users
    const companyUsersMatch = pathname.match(/^\/companies\/(.+)\/users$/);
    if (companyUsersMatch) {
      return [
        { label: 'Analytics', path: '/analytics' },
        { label: 'Companies', path: '/companies/list' },
        { label: 'Users', path: null },
      ];
    }

    // Pattern: /companies/:companyId/company-settings
    const companySettingsMatch = pathname.match(/^\/companies\/(.+)\/company-settings$/);
    if (companySettingsMatch) {
      return [
        { label: 'Analytics', path: '/analytics' },
        { label: 'Companies', path: '/companies/list' },
        { label: 'Company Settings', path: null },
      ];
    }

    // Pattern: /companies/:companyId/assets
    const companyAssetsMatch = pathname.match(/^\/companies\/(.+)\/assets$/);
    if (companyAssetsMatch) {
      return [
        { label: 'Analytics', path: '/analytics' },
        { label: 'Companies', path: '/companies/list' },
        { label: 'Assets', path: null },
      ];
    }

    // Pattern: /dashboard/123
    const dashboardMatch = pathname.match(/^\/dashboard\/(.+)$/);
    if (dashboardMatch) {
      const dashboardId = dashboardMatch[1];
      return [
        { label: 'Home', path: '/home' },
        { label: 'Dashboard', path: '/dashboard' },
        { label: `Dashboard ${dashboardId}`, path: null },
      ];
    }

    // Pattern: /products/:productId/devices
    const productDevicesMatch = pathname.match(/^\/products\/(.+)\/devices$/);
    if (productDevicesMatch) {
      return [
        { label: 'Home', path: '/home' },
        { label: 'Manage Product', path: '/manage-product' },
        { label: 'Devices', path: null },
      ];
    }

    // Pattern: /products/:productId/configuration
    const productConfigMatch = pathname.match(/^\/products\/(.+)\/configuration$/);
    if (productConfigMatch) {
      return [
        { label: 'Home', path: '/home' },
        { label: 'Manage Product', path: '/manage-product' },
        { label: 'Configuration', path: null },
      ];
    }

    // Pattern: /products/:productId/integration
    const productIntegrationMatch = pathname.match(/^\/products\/(.+)\/integration$/);
    if (productIntegrationMatch) {
      return [
        { label: 'Home', path: '/home' },
        { label: 'Manage Product', path: '/manage-product' },
        { label: 'Integration', path: null },
      ];
    }

    // ===== ADD THESE NEW PATTERNS FOR /edit-products =====

    // Pattern: /edit-products/:productId/devices
    const editProductDevicesMatch = pathname.match(/^\/edit-products\/(.+)\/devices$/);
    if (editProductDevicesMatch) {
      return [
        { label: 'Home', path: '/home' },
        { label: 'Manage Product', path: '/manage-product' },
        { label: 'Edit Devices', path: null },
      ];
    }

    const editProductConfigMatch = pathname.match(/^\/edit-products\/([^/]+)\/configuration$/);

    if (editProductConfigMatch) {
      const productId = editProductConfigMatch[1];
      const { userId, fromEditUser } = location.state || {};

      // Agar Edit User se aaye ho
      if (fromEditUser && userId) {
        return [
          { label: 'Analytics', path: '/analytics' },
          { label: 'Companies', path: '/companies/list' },
          // { label: 'Users', path: location.state?.companyId ? `/companies/${location.state.companyId}/users` : null },
          { label: 'Edit User', path: `/edit-user/${userId}` },
          { label: 'Edit Configuration', path: null },
        ];
      }

      // Normal flow (Manage Product se aaye ho)
      return [
        { label: 'Home', path: '/home' },
        { label: 'Manage Product', path: '/manage-product' },
        { label: 'Edit Configuration', path: null },
      ];
    }
    // Pattern: /edit-products/:productId/integration
    const editProductIntegrationMatch = pathname.match(/^\/edit-products\/(.+)\/integration$/);
    if (editProductIntegrationMatch) {
      return [
        { label: 'Home', path: '/home' },
        { label: 'Manage Product', path: '/manage-product' },
        { label: 'Edit Integration', path: null },
      ];
    }

    // ===== END OF NEW PATTERNS =====

    // Pattern: /new-rule/:ruleId
    const editRuleMatch = pathname.match(/^\/new-rule\/(.+)$/);
    if (editRuleMatch) {
      return [
        { label: 'Home', path: '/home' },
        { label: 'Rule Builder', path: '/rule-builder' },
        { label: `Edit Rule`, path: null },
      ];
    }

    // Pattern: /edit-user/:id
    const editUserMatch = pathname.match(/^\/edit-user\/([^/]+)$/);

    if (editUserMatch) {
      const companyId = location.state?.companyId;

      return [
        { label: 'Analytics', path: '/analytics' },
        { label: 'Companies', path: '/companies/list' },
        {
          label: 'Users',
          path: companyId ? `/companies/${companyId}/users` : null,
        },
        { label: 'Edit User', path: null },
      ];
    }

    // Pattern: /product-configuration/:id
    const productConfigurationMatch = pathname.match(/^\/product-configuration\/(.+)$/);
    if (productConfigurationMatch) {
      return [
        { label: 'Home', path: '/home' },
        { label: 'Manage Product', path: '/manage-product' },
        { label: 'Product Configuration', path: null },
      ];
    }

    return [{ label: '', path: '/home' }];
  };

  const breadcrumbItems = getBreadcrumbItems(location.pathname);

  const getPreviousPath = (): string | null => {
    for (let i = breadcrumbItems.length - 2; i >= 0; i--) {
      if (breadcrumbItems[i].path) {
        return breadcrumbItems[i].path;
      }
    }
    return null;
  };

  const previousPath = getPreviousPath();

  const handleBack = () => {
    if (previousPath) {
      navigate(previousPath);
    }
  };

  return (
    <nav aria-label="Breadcrumb" className="px-4 py-2 text-sm">
      <div className="flex items-center space-x-3">
        {/* Back Button - show only if there's a previous path */}
        {previousPath && (
          <button
            onClick={handleBack}
            className="flex items-center cursor-pointer justify-center w-8 h-8 rounded-lg hover:bg-surface-2 transition-colors group"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-ink-2 group-hover:text-ink-0" />
          </button>
        )}

        {/* Breadcrumb */}
        <ol className="flex items-center space-x-1 text-ink-2">
          {breadcrumbItems.map((item, index) => {
            const isLast = index === breadcrumbItems.length - 1;

            return (
              <li key={index} className="flex items-center">
                {index > 0 && <ChevronRight className="w-4 h-4 mx-1 text-ink-2" />}

                {item.path && !isLast ? (
                  <Link
                    to={item.path}
                    className="hover:text-accent-cyan transition-colors font-medium"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className={`${isLast ? 'font-semibold text-ink-0' : 'text-ink-1'}`}>
                    {item.label}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}

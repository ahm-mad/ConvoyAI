import {
  BarChart3,
  Fuel,
  Gauge,
  History,
  LayoutDashboard,
  Map as MapIcon,
  Cpu,
  Activity,
  Route,
  ShieldAlert,
  ShieldCheck,
  Truck,
  TriangleAlert,
  Users,
  Warehouse,
  Wrench,
  Building2,
  Boxes,
  Settings2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

export interface NavLeaf {
  label: string;
  hint?: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  key: string;
  label: string;
  /** Direct link (no menu) when set and `items` is empty. */
  href?: string;
  icon: LucideIcon;
  items: NavLeaf[];
  /** Route prefixes that mark this group as active. */
  match: string[];
}

export interface NavPermissions {
  isSuperAdmin?: boolean;
  isDemo?: boolean;
  hasPermission: (key: string) => boolean;
}

const OPS = '/fleet-management/operations';
const AN = '/fleet-management/analytics';

/** Top-level navigation of the ConvoyAI shell, gated by the SAME permission rules as the old sidebar. */
export function buildNav({ isSuperAdmin, isDemo, hasPermission }: NavPermissions): NavGroup[] {
  const groups: NavGroup[] = [];

  if (hasPermission('all-fleet')) {
    groups.push(
      {
        key: 'overview',
        label: 'Overview',
        href: `${OPS}/overview`,
        icon: LayoutDashboard,
        items: [],
        match: [`${OPS}/overview`, '/fleet-management/overview'],
      },
      {
        key: 'map',
        label: 'Live Map',
        href: `${OPS}/map`,
        icon: MapIcon,
        items: [],
        match: [`${OPS}/map`],
      },
      {
        key: 'fleet',
        label: 'Fleet',
        icon: Truck,
        match: [
          `${OPS}/vehicles`,
          `${OPS}/drivers`,
          `${OPS}/trips`,
          `${OPS}/yards`,
          `${OPS}/geofences`,
          `${OPS}/assignments`,
          `${OPS}/incidents`,
          '/fleet-management/settings',
        ],
        items: [
          {
            label: 'Vehicles',
            hint: 'Assets, trackers, lifecycle',
            href: `${OPS}/vehicles`,
            icon: Truck,
          },
          { label: 'Drivers', hint: 'Licences, availability', href: `${OPS}/drivers`, icon: Users },
          {
            label: 'Trips & dispatch',
            hint: 'Plan, start, complete',
            href: `${OPS}/trips`,
            icon: Route,
          },
          { label: 'Yards', hint: 'Depots and slots', href: `${OPS}/yards`, icon: Warehouse },
          {
            label: 'Geofences',
            hint: 'Zones and alerts',
            href: `${OPS}/geofences`,
            icon: ShieldAlert,
          },
          {
            label: 'Assignments',
            hint: 'Who drove what',
            href: `${OPS}/assignments`,
            icon: History,
          },
          {
            label: 'Incidents',
            hint: 'Safety and claims',
            href: `${OPS}/incidents`,
            icon: TriangleAlert,
          },
          {
            label: 'Fleet settings',
            hint: 'Units, targets, thresholds',
            href: '/fleet-management/settings',
            icon: Settings2,
          },
        ],
      },
      {
        key: 'ai',
        label: 'AI',
        href: '/ai',
        icon: Sparkles,
        items: [],
        match: ['/ai'],
      },
      {
        key: 'analytics',
        label: 'Analytics',
        icon: BarChart3,
        match: [AN],
        items: [
          {
            label: 'Utilisation',
            hint: 'How hard vehicles work',
            href: `${AN}/utilisation`,
            icon: Gauge,
          },
          {
            label: 'Trips & delivery',
            hint: 'On-time, delays, outcomes',
            href: `${AN}/trips`,
            icon: Route,
          },
          {
            label: 'Fuel & efficiency',
            hint: 'Economy, spend, fill-ups',
            href: `${AN}/fuel`,
            icon: Fuel,
          },
          {
            label: 'Maintenance',
            hint: 'Schedules, history, compliance',
            href: `${AN}/maintenance`,
            icon: Wrench,
          },
        ],
      }
    );
  }

  const deviceItems: NavLeaf[] = [
    ...(hasPermission('all-product')
      ? [
          {
            label: 'Products & devices',
            hint: 'Templates, devices, protocols',
            href: '/manage-product',
            icon: Cpu,
          },
        ]
      : []),
    ...(hasPermission('all-connect')
      ? [
          {
            label: 'Connector health',
            hint: 'Ingest status',
            href: '/connector-health',
            icon: Activity,
          },
        ]
      : []),
    ...(isSuperAdmin
      ? [{ label: 'All products', hint: 'Platform catalogue', href: '/all-products', icon: Boxes }]
      : []),
  ];

  if (deviceItems.length) {
    groups.push({
      key: 'devices',
      label: 'Devices',
      icon: Cpu,
      match: [
        '/manage-product',
        '/product-configuration',
        '/connector-health',
        '/all-products',
        '/edit-products',
      ],
      items: deviceItems,
    });
  }

  const accessItems: NavLeaf[] = [
    ...(hasPermission('all-role-permission') && !isDemo
      ? [
          {
            label: 'Roles & permissions',
            hint: 'Who can do what',
            href: '/roles-permission',
            icon: ShieldCheck,
          },
        ]
      : []),
    ...(isSuperAdmin
      ? [
          {
            label: 'Companies',
            hint: 'Tenants and plans',
            href: '/companies/list',
            icon: Building2,
          },
        ]
      : []),
  ];

  if (accessItems.length) {
    groups.push({
      key: 'access',
      label: 'Access',
      icon: ShieldCheck,
      match: [
        '/roles-permission',
        '/assign-permission',
        '/companies',
        '/users',
        '/members',
        '/internal-user',
      ],
      items: accessItems,
    });
  }

  // Users without any fleet access still need a landing page.
  if (!groups.length && hasPermission('all-dashboard')) {
    groups.push({
      key: 'home',
      label: 'Home',
      href: '/home',
      icon: LayoutDashboard,
      items: [],
      match: ['/home'],
    });
  }

  return groups;
}

/** Flat list for the command palette. */
export function flattenNav(groups: NavGroup[]): (NavLeaf & { group: string })[] {
  return groups.flatMap(g =>
    g.items.length
      ? g.items.map(i => ({ ...i, group: g.label }))
      : g.href
        ? [{ label: g.label, href: g.href, icon: g.icon, group: 'Go to' }]
        : []
  );
}

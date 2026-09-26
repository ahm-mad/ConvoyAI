'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

interface Crumb {
  label: string;
  href?: string;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Breadcrumb trail for pages that sit below a list (product pages, role editor, edit user, company). */
const trailFor = (path: string): Crumb[] | null => {
  let m: RegExpMatchArray | null;

  if ((m = path.match(/^\/(?:all-products|products|edit-products)\/[^/]+\/([^/]+)/)))
    return [
      { label: 'Devices' },
      { label: 'Products & devices', href: '/manage-product' },
      { label: cap(m[1]) },
    ];

  if (/^\/product-configuration\//.test(path))
    return [
      { label: 'Devices' },
      { label: 'Products & devices', href: '/manage-product' },
      { label: 'Configuration' },
    ];

  if ((m = path.match(/^\/assign-permission(?:\/([^/]+))?/)))
    return [
      { label: 'Access' },
      { label: 'Roles & permissions', href: '/roles-permission' },
      { label: m[1] ? 'Edit role' : 'Create role' },
    ];

  if (/^\/edit-user\//.test(path))
    return [{ label: 'Access' }, { label: 'Members', href: '/members' }, { label: 'Edit user' }];

  if ((m = path.match(/^\/companies\/(?!list)[^/]+\/([^/]+)/)))
    return [
      { label: 'Access' },
      { label: 'Companies', href: '/companies/list' },
      { label: cap(m[1].replace(/-/g, ' ')) },
    ];

  return null;
};

export default function Crumbs() {
  const path = usePathname() ?? '';
  const trail = trailFor(path);

  if (!trail) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-3 px-1 sm:px-4">
      <ol className="flex flex-wrap items-center gap-1.5 text-caption text-ink-2">
        {trail.map((c, i) => (
          <li key={c.label} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={12} aria-hidden />}
            {c.href ? (
              <Link href={c.href} className="text-ink-1 hover:text-brand-ink hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current={i === trail.length - 1 ? 'page' : undefined}>{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

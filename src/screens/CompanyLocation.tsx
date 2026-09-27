'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Building2, Mail, MapPin, Pencil, Warehouse } from 'lucide-react';
import { useModal } from '@contexts/ModalContext';
import { useUser } from '@contexts/UserContext';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useUnits } from '@hooks/useUnits';
import { formatQty } from '@utils/units';
import AddLocation from '../components/AddLocation';

/** Company profile + its locations (yards). Editing reuses the original company-info form. */
export default function CompanyLocation() {
  const { openModal } = useModal();
  const { user } = useUser();
  const u = useUnits();

  const { data: companyData, refetch } = useSimpleQuery(
    'companyData',
    `/api/companies/${user?.company_id}`
  );
  const yardsQ = useSimpleQuery<any>('yards-company-locations', '/api/yards', {
    page: 1,
    per_page: 8,
  });
  const c = companyData?.data;
  const yards: any[] = yardsQ.data?.data?.items ?? [];
  const yardTotal: number = yardsQ.data?.data?.pagination?.total ?? yards.length;

  const edit = () => openModal(<AddLocation companyData={companyData?.data} refetch={refetch} />);

  // Original behaviour: a company without details is asked to fill them in straight away.
  useEffect(() => {
    if (!user?.company_info) edit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const address = [c?.address, c?.city, c?.state, c?.zip_code, c?.country]
    .filter(Boolean)
    .join(', ');
  const stats = [
    { label: 'Locations', value: yardTotal },
    { label: 'Members', value: Array.isArray(c?.users) ? c.users.length : '—' },
    { label: 'Products', value: Array.isArray(c?.products) ? c.products.length : '—' },
    { label: 'Currency', value: c?.currency || '—' },
  ];

  return (
    <div className="p-1 sm:p-4">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Workspace</div>
          <h1 className="page-title mt-1">{c?.name || 'Company & locations'}</h1>
          <p className="page-subtitle mt-1">
            Company profile and the places your fleet operates from.
          </p>
        </div>
        <button
          type="button"
          onClick={edit}
          className="btn-brand inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium"
        >
          <Pencil size={13} /> Edit company
        </button>
      </div>

      <div className="glass mb-6 grid grid-cols-2 gap-5 p-5 lg:grid-cols-4">
        {stats.map(s => (
          <div key={s.label}>
            <div className="eyebrow">{s.label}</div>
            <div className="kpi-value mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="glass p-6 xl:col-span-1">
          <div className="card-title mb-4">Company profile</div>
          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <Building2 size={16} className="mt-0.5 text-brand" />
              <dl>
                <dt className="eyebrow">Name</dt>
                <dd className="text-ink-0">{c?.name || '—'}</dd>
              </dl>
            </div>
            <div className="flex items-start gap-3">
              <MapPin size={16} className="mt-0.5 text-brand" />
              <dl>
                <dt className="eyebrow">Address</dt>
                <dd className="text-ink-0">{address || '—'}</dd>
              </dl>
            </div>
            <div className="flex items-start gap-3">
              <Mail size={16} className="mt-0.5 text-brand" />
              <dl>
                <dt className="eyebrow">Company email</dt>
                <dd className="break-all text-ink-0">{c?.email || '—'}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className="glass p-6 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div className="card-title">Locations</div>
            <Link
              href="/fleet-management/operations/yards"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-ink hover:underline"
            >
              Manage yards <ArrowUpRight size={13} />
            </Link>
          </div>
          {yards.length === 0 ? (
            <div className="py-10 text-center text-sm text-ink-2">
              No locations yet. Add a yard to see it here.
            </div>
          ) : (
            <ul className="divide-y divide-line-soft">
              {yards.map(y => (
                <li key={y.id} className="flex items-center gap-3 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-wash text-brand icon-gradient">
                    <Warehouse size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink-0">{y.name}</div>
                    <div className="truncate text-xs text-ink-2">
                      {y.address || 'No address'}
                      {y.radius_m != null && ` · ${formatQty(u.length, y.radius_m, 0)} radius`}
                    </div>
                  </div>
                  <span className="text-xs tabular-nums text-ink-2">
                    {y.slots_count ?? 0} {y.slots_count === 1 ? 'slot' : 'slots'}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${y.is_active ? 'bg-success/15 text-success' : 'bg-surface-2 text-ink-2'}`}
                  >
                    {y.is_active ? 'Active' : 'Inactive'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {yardTotal > yards.length && (
            <div className="mt-3 text-xs text-ink-2">
              Showing {yards.length} of {yardTotal} locations.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

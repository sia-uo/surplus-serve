import { useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorState, Loading, LoadMore } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { api, qs } from '../../lib/api';
import { fmtDate, titleCase } from '../../lib/format';
import { usePaged } from '../../lib/hooks';
import { AdminTitle } from './AdminShell';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string | null;
  status: 'active' | 'suspended';
  suspendedReason: string | null;
  createdAt: number;
  orgName: string | null;
  city: string | null;
  verification: string | null;
  premium: boolean;
  noShows: number | null;
  reliability: number | null;
}

export default function AdminUsers() {
  const { t, intl } = useI18n();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [role, setRole] = useState('');
  const [onlySuspended, setOnlySuspended] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const h = setTimeout(() => setDebounced(q), 350);
    return () => clearTimeout(h);
  }, [q]);

  const list = usePaged<AdminUser>(`/api/admin/users${qs({ q: debounced, role, status: onlySuspended ? 'suspended' : '' })}`);

  async function toggle(u: AdminUser) {
    const suspend = u.status === 'active';
    const reason = suspend ? prompt(t('admin.suspendReason')) : null;
    if (suspend && reason === null) return;
    setBusy(u.id);
    setActionError(null);
    try {
      await api.post(`/api/admin/users/${u.id}/suspend`, { suspended: suspend, reason: reason ?? undefined });
      list.setItems((items) => items.map((x) => (x.id === u.id ? { ...x, status: suspend ? 'suspended' : 'active', suspendedReason: reason } : x)));
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <AdminTitle>{t('admin.users')}</AdminTitle>
      <div className="mb-5 flex flex-wrap gap-2">
        <input className="input max-w-sm flex-1" type="search" placeholder={t('admin.searchUsers')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('admin.searchUsers')} />
        <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value)} aria-label={t('admin.role')}>
          <option value="">{t('common.all')}</option>
          <option value="restaurant">{t('onboarding.restaurant')}</option>
          <option value="ngo">{t('onboarding.ngo')}</option>
          <option value="admin">{t('nav.admin')}</option>
        </select>
        <label className="chip border-leaf/40 text-ivory">
          <input type="checkbox" className="mr-2 accent-vine" checked={onlySuspended} onChange={(e) => setOnlySuspended(e.target.checked)} />
          {t('status.suspendedTitle')}
        </label>
      </div>
      {actionError && <ErrorState dark message={actionError} />}
      {list.error ? (
        <ErrorState dark message={list.error} onRetry={list.reload} />
      ) : list.loading && !list.items.length ? (
        <Loading dark />
      ) : list.items.length === 0 ? (
        <EmptyState dark icon="👤" title={t('admin.noUsers')} />
      ) : (
        <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[760px] text-left text-sm text-ink">
            <thead className="border-b border-ink/15 bg-ivory-200 text-xs text-ink/60 uppercase">
              <tr>
                <th className="px-4 py-3">{t('profile.title')}</th>
                <th className="px-4">{t('admin.role')}</th>
                <th className="px-4">{t('admin.status')}</th>
                <th className="px-4">{t('admin.noShows')}</th>
                <th className="px-4">{t('admin.joined')}</th>
                <th className="px-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {list.items.map((u) => (
                <tr key={u.id} className={u.status === 'suspended' ? 'bg-vine/5' : ''}>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{u.orgName ?? u.name}</p>
                    <p className="text-xs text-ink/60">
                      {u.email}
                      {u.city && ` · ${titleCase(u.city)}`}
                    </p>
                    {u.suspendedReason && <p className="text-xs text-vine">{u.suspendedReason}</p>}
                  </td>
                  <td className="px-4">
                    <span className="capitalize">{u.role ?? '—'}</span>
                    {u.verification && (
                      <Badge tone={u.verification === 'approved' ? 'green' : u.verification === 'rejected' ? 'red' : 'leaf'} className="ml-1">
                        {t(`verification.${u.verification}` as MessageKey)}
                      </Badge>
                    )}
                    {u.premium && <span className="ml-1 text-leaf-dark">🌿</span>}
                  </td>
                  <td className="px-4">
                    <Badge tone={u.status === 'active' ? 'green' : 'red'}>{u.status}</Badge>
                  </td>
                  <td className="px-4">
                    {u.noShows ?? '—'}
                    {u.reliability != null && <span className="ml-1 text-xs text-ink/60">({u.reliability})</span>}
                  </td>
                  <td className="px-4 text-xs">{fmtDate(u.createdAt, intl)}</td>
                  <td className="px-4 text-right">
                    {u.role !== 'admin' && (
                      <Button variant={u.status === 'active' ? 'outline' : 'leaf-solid'} className="min-h-9 py-1" loading={busy === u.id} onClick={() => toggle(u)}>
                        {u.status === 'active' ? t('admin.suspend') : t('admin.reinstate')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 pb-4">
            <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={list.loadMore} />
          </div>
        </Card>
      )}
    </div>
  );
}

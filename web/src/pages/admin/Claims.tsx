import { useState } from 'react';
import type { Claim, ClaimStatus } from '../../../../shared/types';
import { Badge, Card, EmptyState, ErrorState, Loading, LoadMore, Tabs } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { fmtDateTime } from '../../lib/format';
import { usePaged } from '../../lib/hooks';
import { AdminTitle } from './AdminShell';

export default function AdminClaims() {
  const { t, intl } = useI18n();
  const [status, setStatus] = useState<ClaimStatus | 'all'>('all');
  const list = usePaged<Claim>(`/api/admin/claims${status === 'all' ? '' : `?status=${status}`}`);
  const statuses: (ClaimStatus | 'all')[] = ['all', 'pending', 'completed', 'cancelled', 'no_show'];

  return (
    <div>
      <AdminTitle>{t('admin.claims')}</AdminTitle>
      <Tabs dark value={status} onChange={setStatus} tabs={statuses.map((s) => ({ value: s, label: s === 'all' ? t('common.all') : t(`claim.${s}` as MessageKey) }))} />
      {list.error ? (
        <ErrorState dark message={list.error} onRetry={list.reload} />
      ) : list.loading && !list.items.length ? (
        <Loading dark />
      ) : list.items.length === 0 ? (
        <EmptyState dark title={t('admin.noClaims')} />
      ) : (
        <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[720px] text-left text-sm text-ink">
            <thead className="border-b border-ink/15 bg-ivory-200 text-xs text-ink/60 uppercase">
              <tr>
                <th className="px-4 py-3">{t('newListing.foodTitle')}</th>
                <th className="px-4">{t('onboarding.restaurant')}</th>
                <th className="px-4">{t('onboarding.ngo')}</th>
                <th className="px-4">{t('common.servings')}</th>
                <th className="px-4">{t('admin.status')}</th>
                <th className="px-4">{t('admin.when')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {list.items.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-semibold">{c.listingTitle}</td>
                  <td className="px-4">{c.restaurant?.name}</td>
                  <td className="px-4">
                    {c.ngo?.name}
                    {c.ngo && <span className="ml-1 text-xs text-ink/60">({c.ngo.reliabilityScore})</span>}
                  </td>
                  <td className="px-4">{c.servings}</td>
                  <td className="px-4">
                    <Badge tone={c.status === 'completed' ? 'green' : c.status === 'pending' ? 'gold' : c.status === 'no_show' ? 'red' : 'gray'}>{t(`claim.${c.status}` as MessageKey)}</Badge>
                  </td>
                  <td className="px-4 text-xs">{fmtDateTime(c.createdAt, intl)}</td>
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

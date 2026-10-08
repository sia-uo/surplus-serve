import { useState } from 'react';
import type { Listing, ListingStatus } from '../../../../shared/types';
import { ListingCard } from '../../components/ListingCard';
import { EmptyState, ErrorState, LoadMore, SkeletonCards, Tabs } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { qs } from '../../lib/api';
import { usePaged } from '../../lib/hooks';
import { AdminTitle } from './AdminShell';

export default function AdminListings() {
  const { t } = useI18n();
  const [status, setStatus] = useState<ListingStatus | 'all'>('all');
  const [city, setCity] = useState('');
  const list = usePaged<Listing>(`/api/admin/listings${qs({ status: status === 'all' ? '' : status, city: city.trim() })}`);
  const statuses: (ListingStatus | 'all')[] = ['all', 'active', 'claimed', 'completed', 'expired', 'cancelled'];

  return (
    <div>
      <AdminTitle actions={<input className="input w-48" placeholder={t('admin.city')} value={city} onChange={(e) => setCity(e.target.value)} aria-label={t('admin.city')} />}>
        {t('admin.listings')}
      </AdminTitle>
      <Tabs dark value={status} onChange={setStatus} tabs={statuses.map((s) => ({ value: s, label: s === 'all' ? t('common.all') : t(`listing.${s}` as MessageKey) }))} />
      {list.error ? (
        <ErrorState dark message={list.error} onRetry={list.reload} />
      ) : list.loading && !list.items.length ? (
        <SkeletonCards />
      ) : list.items.length === 0 ? (
        <EmptyState dark title={t('admin.noListings')} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.items.map((l) => (
              <ListingCard key={l.id} listing={l} showStatus />
            ))}
          </div>
          <LoadMore dark hasMore={list.hasMore} loading={list.loading} onClick={list.loadMore} />
        </>
      )}
    </div>
  );
}

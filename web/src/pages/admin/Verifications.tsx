import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { directionsUrl } from '../../../../shared/geo';
import type { NgoProfile, RestaurantProfile, Verification } from '../../../../shared/types';
import { PartnerBadge } from '../../components/ListingCard';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, LoadMore, SkeletonCards, Tabs } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { api } from '../../lib/api';
import { fmtDate, titleCase } from '../../lib/format';
import { usePaged } from '../../lib/hooks';
import { AdminTitle } from './AdminShell';

interface Item {
  userId: string;
  email: string;
  userStatus: string;
  createdAt: number;
  profile: RestaurantProfile | NgoProfile;
}

function VerificationCard({ item, type, onDone }: { item: Item; type: 'restaurant' | 'ngo'; onDone: () => void }) {
  const { t, intl } = useI18n();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const p = item.profile;
  const isRestaurant = type === 'restaurant';
  const r = p as RestaurantProfile;
  const n = p as NgoProfile;

  async function act(path: string, body: Record<string, unknown>, label: string) {
    setBusy(label);
    setError(null);
    try {
      await api.post(path, body);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="animate-rise">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-serif text-xl font-bold text-verd">{p.name}</h3>
          <p className="text-sm text-ink/70">
            {item.email} · {t('admin.joined')} {fmtDate(item.createdAt, intl)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={p.verification === 'approved' ? 'green' : p.verification === 'rejected' ? 'red' : 'leaf'}>{t(`verification.${p.verification}` as MessageKey)}</Badge>
          {isRestaurant && r.premium && <PartnerBadge />}
          {item.userStatus === 'suspended' && <Badge tone="red">{t('admin.suspend')}</Badge>}
        </div>
      </div>
      <dl className="mt-4 grid gap-x-4 gap-y-2 text-sm text-ink sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-xs text-ink/60">{t('profile.address')}</dt>
          <dd>
            {p.address} ({titleCase(p.city)}) ·{' '}
            <a className="underline" href={directionsUrl(p.lat, p.lng)} target="_blank" rel="noreferrer">
              map
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink/60">{t('profile.phone')}</dt>
          <dd>{p.phone}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink/60">{isRestaurant ? t('profile.fssai') : t('profile.regNumber')}</dt>
          <dd className="font-mono">{isRestaurant ? r.fssaiNumber : n.registrationNumber}</dd>
        </div>
        {!isRestaurant && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-ink/60">{t('admin.document')}</dt>
            <dd>
              {n.certificateKey ? (
                <a className="font-medium text-verd underline" href={`/api/files/${n.certificateKey}`} target="_blank" rel="noreferrer">
                  📄 {t('common.view')}
                </a>
              ) : (
                <span className="text-vine">{t('admin.noDocument')}</span>
              )}
            </dd>
          </div>
        )}
        {p.rejectionReason && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-ink/60">{t('status.reason')}</dt>
            <dd>{p.rejectionReason}</dd>
          </div>
        )}
      </dl>
      <div className="mt-4 space-y-2">
        <input className="input text-sm" placeholder={t('admin.rejectReason')} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        <div className="flex flex-wrap gap-2">
          {p.verification !== 'approved' && (
            <Button className="min-h-9 py-1.5" loading={busy === 'a'} onClick={() => act(`/api/admin/${type}s/${item.userId}/verify`, { decision: 'approved' }, 'a')}>
              ✓ {t('admin.approve')}
            </Button>
          )}
          {p.verification !== 'rejected' && (
            <Button variant="outline" className="min-h-9 py-1.5" disabled={!reason.trim()} loading={busy === 'r'} onClick={() => act(`/api/admin/${type}s/${item.userId}/verify`, { decision: 'rejected', reason }, 'r')}>
              ✗ {t('admin.reject')}
            </Button>
          )}
          {isRestaurant && (
            <Button variant="leaf-solid" className="min-h-9 py-1.5" loading={busy === 'p'} onClick={() => act(`/api/admin/restaurants/${item.userId}/premium`, { premium: !r.premium }, 'p')}>
              🌿 {r.premium ? t('admin.premiumOff') : t('admin.premiumOn')}
            </Button>
          )}
        </div>
      </div>
      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}
    </Card>
  );
}

export default function AdminVerifications() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const type = params.get('type') === 'restaurant' ? 'restaurant' : 'ngo';
  const status = (params.get('status') as Verification) || 'pending';
  const list = usePaged<Item>(`/api/admin/verifications?type=${type}&status=${status}`);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

  return (
    <div>
      <AdminTitle>{t('admin.verifications')}</AdminTitle>
      <Tabs dark value={type} onChange={(v) => set('type', v)} tabs={[{ value: 'ngo', label: t('admin.ngos') }, { value: 'restaurant', label: t('admin.restaurants') }]} />
      <Tabs
        dark
        value={status}
        onChange={(v) => set('status', v)}
        tabs={(['pending', 'approved', 'rejected'] as const).map((s) => ({ value: s, label: t(`verification.${s}` as MessageKey) }))}
      />
      {list.error ? (
        <ErrorState dark message={list.error} onRetry={list.reload} />
      ) : list.loading && !list.items.length ? (
        <SkeletonCards n={2} />
      ) : list.items.length === 0 ? (
        <EmptyState dark icon="✅" title={t('admin.noPending')} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {list.items.map((i) => (
              <VerificationCard key={i.userId} item={i} type={type} onDone={list.reload} />
            ))}
          </div>
          <LoadMore dark hasMore={list.hasMore} loading={list.loading} onClick={list.loadMore} />
        </>
      )}
    </div>
  );
}

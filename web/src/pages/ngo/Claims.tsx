import { useState } from 'react';
import type { Claim } from '../../../../shared/types';
import { VerificationBanner } from '../../components/Guards';
import { Container } from '../../components/Layout';
import { FoodTypeBadge } from '../../components/ListingCard';
import { RatingForm } from '../../components/RatingForm';
import { Alert, Badge, Button, EmptyState, ErrorState, LinkButton, LoadMore, PageHeader, SkeletonCards, Stars, Tabs } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { useDocumentTitle, usePaged } from '../../lib/hooks';

type Tab = 'upcoming' | 'completed' | 'cancelled';

function ClaimCard({ claim, onChange }: { claim: Claim; onChange: () => void }) {
  const { t, intl } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rated, setRated] = useState<number | null>(claim.foodRating);
  const [rateOpen, setRateOpen] = useState(false);
  const r = claim.restaurant;

  async function cancel() {
    if (!confirm(t('claims.cancelConfirm'))) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/ngo/claims/${claim.id}/cancel`);
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card animate-rise p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-serif text-xl font-bold text-verd">{claim.listingTitle}</h3>
          {r && <p className="text-sm text-ink/70">{r.name}</p>}
        </div>
        <div className="flex gap-1.5">
          <FoodTypeBadge type={claim.foodType} />
          <Badge tone={claim.status === 'completed' ? 'green' : claim.status === 'pending' ? 'leaf' : claim.status === 'no_show' ? 'red' : 'gray'}>{t(`claim.${claim.status}` as MessageKey)}</Badge>
        </div>
      </div>

      <p className="mt-2 text-sm text-ink">
        🍛 {claim.servings} {t('common.servings')}
        {claim.packagingCost > 0 && <> · 📦 ₹{claim.packagingCost * claim.servings}</>}
      </p>

      {claim.status === 'pending' && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-dashed border-vine/50 bg-white px-4 py-3">
            <span className="text-xs font-semibold tracking-widest text-ink/60 uppercase">{t('claims.otp')}</span>
            <span className="font-mono text-3xl font-bold tracking-[0.25em] text-vine">{claim.otp}</span>
          </div>
          <p className={`mt-2 text-sm font-medium ${claim.pickupBy - Date.now() < 3600_000 ? 'text-vine' : 'text-ink/80'}`}>⏰ {t('claims.collectBy', { time: fmtDateTime(claim.pickupBy, intl) })}</p>
          {r && (
            <div className="mt-3 text-sm text-ink/80">
              <p>{r.address}</p>
              {r.upiId && <p>{t('claimModal.upi', { id: r.upiId })}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <a className="btn btn-primary min-h-10 py-2" href={r.directionsUrl} target="_blank" rel="noreferrer">
                  🧭 {t('claimModal.directions')}
                </a>
                <a className="btn btn-outline min-h-10 py-2" href={`tel:${r.phone}`}>
                  ☎ {t('claimModal.call')}
                </a>
                <Button variant="ghost" className="min-h-10 py-2 text-vine" loading={busy} onClick={cancel}>
                  {t('claims.cancel')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {claim.status === 'completed' && (
        <div className="mt-3">
          <p className="text-xs text-ink/60">{claim.completedAt && fmtDateTime(claim.completedAt, intl)}</p>
          <div className="mt-2">
            {rated ? (
              <div className="flex items-center gap-2 text-sm text-ink/70">
                {t('claims.yourRating')}: <Stars value={rated} size="text-lg" />
              </div>
            ) : rateOpen ? (
              <RatingForm endpoint={`/api/ngo/claims/${claim.id}/rate`} onDone={setRated} />
            ) : (
              <Button variant="outline" className="min-h-9 py-1.5" onClick={() => setRateOpen(true)}>
                ★ {t('claims.rateFood')}
              </Button>
            )}
          </div>
        </div>
      )}

      {claim.status === 'no_show' && <p className="mt-3 text-sm text-vine">{t('claims.noShowNote')}</p>}
      {claim.status === 'cancelled' && claim.cancelReason && <p className="mt-3 text-sm text-ink/60">{claim.cancelReason}</p>}
      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}
    </article>
  );
}

export default function NgoClaims() {
  const { t } = useI18n();
  useDocumentTitle(t('claims.title'));
  const [tab, setTab] = useState<Tab>('upcoming');
  const list = usePaged<Claim>(`/api/ngo/claims?status=${tab}`);
  const empty: Record<Tab, MessageKey> = { upcoming: 'claims.noUpcoming', completed: 'claims.noCompleted', cancelled: 'claims.noCancelled' };

  return (
    <Container>
      <PageHeader eyebrow={t('nav.myClaims')} title={t('claims.title')} />
      <VerificationBanner />
      <Tabs
        dark
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'upcoming', label: t('claims.upcoming') },
          { value: 'completed', label: t('claims.completed') },
          { value: 'cancelled', label: t('claims.cancelled') },
        ]}
      />
      {list.error ? (
        <ErrorState dark message={list.error} onRetry={list.reload} />
      ) : list.loading && !list.items.length ? (
        <SkeletonCards n={2} />
      ) : list.items.length === 0 ? (
        <EmptyState dark icon="🧾" title={t(empty[tab])} action={tab === 'upcoming' ? <LinkButton to="/ngo">{t('claims.findFood')}</LinkButton> : undefined} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {list.items.map((c) => (
              <ClaimCard key={c.id} claim={c} onChange={list.reload} />
            ))}
          </div>
          <LoadMore dark hasMore={list.hasMore} loading={list.loading} onClick={list.loadMore} />
        </>
      )}
    </Container>
  );
}

import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { Claim, Listing, ListingStatus } from '../../../../shared/types';
import { VerificationBanner } from '../../components/Guards';
import { Container } from '../../components/Layout';
import { FoodTypeBadge, ListingCard } from '../../components/ListingCard';
import { RatingForm } from '../../components/RatingForm';
import { Alert, Badge, Button, EmptyState, ErrorState, LinkButton, LoadMore, PageHeader, SkeletonCards, Stars, Tabs } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtDateTime } from '../../lib/format';
import { useDocumentTitle, usePaged, useQuery } from '../../lib/hooks';

function VerifyCard({ claim, onVerified }: { claim: Claim; onVerified: () => void }) {
  const { t, intl } = useI18n();
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/restaurant/claims/${claim.id}/verify`, { otp });
      setDone(true);
      setTimeout(onVerified, 1200);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const overdue = claim.pickupBy < Date.now();
  return (
    <article className="card animate-rise p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-serif text-lg font-bold text-verd">{claim.listingTitle}</h3>
          <p className="text-sm text-ink/70">
            {t('restaurant.claimedBy')} <strong>{claim.ngo?.name}</strong> · ☎{' '}
            <a className="underline" href={`tel:${claim.ngo?.phone}`}>
              {claim.ngo?.phone}
            </a>
          </p>
        </div>
        <FoodTypeBadge type={claim.foodType} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Badge tone="verd">
          🍛 {claim.servings} {t('common.servings')}
        </Badge>
        <Badge tone={overdue ? 'red' : 'outline'}>
          ⏰ {t('restaurant.collectBy')} {fmtDateTime(claim.pickupBy, intl)}
        </Badge>
        {claim.ngo && <Badge tone="gray">{t('restaurant.reliability', { score: claim.ngo.reliabilityScore })}</Badge>}
        {claim.packagingCost > 0 && <Badge tone="leaf">₹{claim.packagingCost * claim.servings}</Badge>}
      </div>
      {done ? (
        <Alert tone="success" className="mt-4">
          ✓ {t('restaurant.verified')}
        </Alert>
      ) : (
        <form onSubmit={verify} className="mt-4 flex flex-wrap items-end gap-2">
          <label className="flex-1">
            <span className="label">{t('restaurant.enterOtp')}</span>
            <input
              className="input text-center font-mono text-xl tracking-[0.5em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
            />
          </label>
          <Button type="submit" loading={busy} disabled={otp.length !== 6}>
            {t('restaurant.verify')}
          </Button>
          {error && (
            <Alert tone="error" className="w-full">
              {error}
            </Alert>
          )}
        </form>
      )}
    </article>
  );
}

function HistoryRow({ claim }: { claim: Claim }) {
  const { t, intl } = useI18n();
  const [rated, setRated] = useState<number | null>(claim.ngoRating);
  const [open, setOpen] = useState(false);
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold text-verd">
          {claim.listingTitle} · {claim.servings} {t('common.servings')}
        </p>
        <p className="text-sm text-ink/70">
          {claim.ngo?.name} · {claim.completedAt ? fmtDateTime(claim.completedAt, intl) : t(`claim.${claim.status}` as MessageKey)}
        </p>
      </div>
      {claim.status === 'completed' &&
        (rated ? (
          <Stars value={rated} size="text-lg" />
        ) : open ? (
          <RatingForm endpoint={`/api/restaurant/claims/${claim.id}/rate`} onDone={setRated} />
        ) : (
          <Button variant="outline" className="min-h-9 py-1.5" onClick={() => setOpen(true)}>
            ★ {t('restaurant.rateNgo')}
          </Button>
        ))}
      {claim.status !== 'completed' && <Badge tone={claim.status === 'no_show' ? 'red' : 'gray'}>{t(`claim.${claim.status}` as MessageKey)}</Badge>}
    </li>
  );
}

export default function RestaurantHome() {
  const { t } = useI18n();
  const { user, restaurant } = useAuth();
  const location = useLocation();
  useDocumentTitle(t('restaurant.title'));
  const [tab, setTab] = useState<ListingStatus>('active');
  const dash = useQuery<{ counts: Record<ListingStatus, number>; pendingPickups: number }>('/api/restaurant/dashboard');
  const pending = usePaged<Claim>('/api/restaurant/claims?status=pending');
  const listings = usePaged<Listing>(`/api/restaurant/listings?status=${tab}`);
  const history = usePaged<Claim>('/api/restaurant/claims?status=completed');

  async function cancel(id: string) {
    if (!confirm(t('restaurant.cancelConfirm'))) return;
    try {
      await api.post(`/api/restaurant/listings/${id}/cancel`);
      listings.reload();
      dash.reload();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const statuses: ListingStatus[] = ['active', 'claimed', 'completed', 'expired', 'cancelled'];
  const approved = restaurant?.verification === 'approved';

  return (
    <Container>
      <PageHeader
        eyebrow={t('restaurant.title')}
        title={t('restaurant.hello', { name: restaurant?.name ?? user?.name ?? '' })}
        actions={approved && <LinkButton to="/restaurant/new">＋ {t('nav.postFood')}</LinkButton>}
      />
      <VerificationBanner />
      {(location.state as { posted?: boolean } | null)?.posted && (
        <Alert tone="success" className="mb-6">
          ✓ {t('newListing.posted')}
        </Alert>
      )}

      <section aria-labelledby="verify-h" className="mb-10">
        <h2 id="verify-h" className="mb-4 flex items-center gap-3 text-2xl font-bold text-leaf">
          {t('restaurant.toVerify')}
          {dash.data && dash.data.pendingPickups > 0 && <Badge tone="red">{dash.data.pendingPickups}</Badge>}
        </h2>
        {pending.error ? (
          <ErrorState dark message={pending.error} onRetry={pending.reload} />
        ) : pending.loading && !pending.items.length ? (
          <SkeletonCards n={2} />
        ) : pending.items.length === 0 ? (
          <EmptyState dark icon="🔐" title={t('restaurant.noPending')} />
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {pending.items.map((c) => (
                <VerifyCard
                  key={c.id}
                  claim={c}
                  onVerified={() => {
                    pending.reload();
                    dash.reload();
                    history.reload();
                    listings.reload();
                  }}
                />
              ))}
            </div>
            <LoadMore dark hasMore={pending.hasMore} loading={pending.loading} onClick={pending.loadMore} />
          </>
        )}
      </section>

      <section aria-labelledby="listings-h" className="mb-10">
        <h2 id="listings-h" className="mb-4 text-2xl font-bold text-leaf">
          {t('nav.myListings')}
        </h2>
        <Tabs dark value={tab} onChange={setTab} tabs={statuses.map((s) => ({ value: s, label: t(`listing.${s}` as MessageKey), count: dash.data?.counts[s] }))} />
        {listings.error ? (
          <ErrorState dark message={listings.error} onRetry={listings.reload} />
        ) : listings.loading && !listings.items.length ? (
          <SkeletonCards />
        ) : listings.items.length === 0 ? (
          <EmptyState dark title={t('restaurant.noListings')} action={approved && tab === 'active' ? <LinkButton to="/restaurant/new">{t('restaurant.postFirst')}</LinkButton> : undefined} />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {listings.items.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  showStatus
                  actions={
                    <>
                      {!!l.pendingClaims && <Badge tone="leaf">{t('restaurant.pendingClaims', { n: l.pendingClaims })}</Badge>}
                      {l.status === 'active' && !l.pendingClaims && (
                        <Button variant="outline" className="min-h-9 py-1.5" onClick={() => cancel(l.id)}>
                          {t('restaurant.cancelListing')}
                        </Button>
                      )}
                    </>
                  }
                />
              ))}
            </div>
            <LoadMore dark hasMore={listings.hasMore} loading={listings.loading} onClick={listings.loadMore} />
          </>
        )}
      </section>

      <section aria-labelledby="history-h">
        <h2 id="history-h" className="mb-4 text-2xl font-bold text-leaf">
          {t('restaurant.history')}
        </h2>
        {history.error ? (
          <ErrorState dark message={history.error} onRetry={history.reload} />
        ) : history.loading && !history.items.length ? (
          <SkeletonCards n={1} />
        ) : history.items.length === 0 ? (
          <EmptyState dark icon="📜" title={t('claims.noCompleted')} />
        ) : (
          <div className="card px-5">
            <ul className="divide-y divide-ink/10">
              {history.items.map((c) => (
                <HistoryRow key={c.id} claim={c} />
              ))}
            </ul>
            <LoadMore hasMore={history.hasMore} loading={history.loading} onClick={history.loadMore} />
          </div>
        )}
      </section>
    </Container>
  );
}

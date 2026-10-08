import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FOOD_TYPES, RADIUS_OPTIONS_KM, type FoodType } from '../../../../shared/constants';
import type { Claim, GeocodeResult, Listing } from '../../../../shared/types';
import { VerificationBanner } from '../../components/Guards';
import { Container } from '../../components/Layout';
import { ListingCard } from '../../components/ListingCard';
import { Alert, Button, Checkbox, cx, EmptyState, ErrorState, LinkButton, Modal, PageHeader, SkeletonCards, Spinner } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { api, qs } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtDateTime } from '../../lib/format';
import { useDocumentTitle } from '../../lib/hooks';

const MapView = lazy(() => import('../../components/MapView'));

interface Place {
  lat: number;
  lng: number;
  label: string;
}

interface SearchResult {
  items: Listing[];
  page: number;
  hasMore: boolean;
  total: number;
}

export function ClaimSuccess({ claim }: { claim: Claim }) {
  const { t, intl } = useI18n();
  const r = claim.restaurant;
  return (
    <div className="space-y-4">
      <Alert tone="success">✓ {t('claimModal.success')}</Alert>
      <div className="rounded-2xl border-2 border-dashed border-crimson/50 bg-white p-5 text-center">
        <p className="text-xs font-semibold tracking-widest text-ink/60 uppercase">{t('claimModal.otp')}</p>
        <p className="mt-1 font-mono text-5xl font-bold tracking-[0.3em] text-crimson" aria-live="polite">
          {claim.otp}
        </p>
        <p className="mt-2 text-sm text-ink/70">{t('claims.collectBy', { time: fmtDateTime(claim.pickupBy, intl) })}</p>
      </div>
      {r && (
        <div className="rounded-xl bg-ivory-200 p-4 text-sm text-ink">
          <p className="font-serif text-lg font-bold text-navy">{r.name}</p>
          <p>{r.address}</p>
          {r.upiId && <p className="mt-1">{t('claimModal.upi', { id: r.upiId })}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="btn btn-primary min-h-10 py-2" href={r.directionsUrl} target="_blank" rel="noreferrer">
              🧭 {t('claimModal.directions')}
            </a>
            <a className="btn btn-outline min-h-10 py-2" href={`tel:${r.phone}`}>
              ☎ {t('claimModal.call')} {r.phone}
            </a>
          </div>
        </div>
      )}
      {claim.packagingCost > 0 && <p className="text-sm text-ink/80">📦 {t('claimModal.payNote', { amount: claim.packagingCost * claim.servings })}</p>}
      <LinkButton to="/ngo/claims" variant="gold-solid" className="w-full">
        {t('claimModal.viewClaims')}
      </LinkButton>
    </div>
  );
}

function ClaimDialog({ listing, onClose, onClaimed }: { listing: Listing; onClose: () => void; onClaimed: () => void }) {
  const { t } = useI18n();
  const [servings, setServings] = useState(listing.servingsRemaining);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claim, setClaim] = useState<Claim | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ claim: Claim }>(`/api/listings/${listing.id}/claim`, { servings, safetyAck: ack });
      setClaim(res.claim);
      onClaimed();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={claim ? listing.title : t('claimModal.title')}>
      {claim ? (
        <ClaimSuccess claim={claim} />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <p className="font-serif text-lg font-bold text-navy">{listing.title}</p>
            <p className="text-sm text-ink/70">{listing.restaurantName}</p>
          </div>
          {listing.allergens.length > 0 && (
            <Alert tone="warning">
              ⚠ {t('newListing.allergens')}: {listing.allergens.map((a) => t(`allergen.${a}` as MessageKey)).join(', ')}
            </Alert>
          )}
          <label className="block">
            <span className="label">{t('claimModal.servings')}</span>
            <div className="flex items-center gap-2">
              <button type="button" className="btn btn-outline size-11 p-0 text-xl" onClick={() => setServings((s) => Math.max(1, s - 1))} aria-label="−1">
                −
              </button>
              <input
                type="number"
                className="input text-center text-lg font-semibold"
                min={1}
                max={listing.servingsRemaining}
                value={servings}
                onChange={(e) => setServings(Math.max(1, Math.min(listing.servingsRemaining, Number(e.target.value) || 1)))}
              />
              <button type="button" className="btn btn-outline size-11 p-0 text-xl" onClick={() => setServings((s) => Math.min(listing.servingsRemaining, s + 1))} aria-label="+1">
                +
              </button>
            </div>
            <span className="hint">{t('claimModal.max', { n: listing.servingsRemaining })}</span>
          </label>
          {listing.packagingCost > 0 && <p className="rounded-xl bg-gold/10 p-3 text-sm text-ink">📦 {t('claimModal.payNote', { amount: listing.packagingCost * servings })}</p>}
          <div className="rounded-xl border border-crimson/30 bg-crimson/5 p-2">
            <Checkbox checked={ack} onChange={setAck}>
              {t('claimModal.ack')}
            </Checkbox>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" loading={busy} disabled={!ack} className="w-full">
            {busy ? t('claimModal.claiming') : t('claimModal.confirm')}
          </Button>
        </form>
      )}
    </Modal>
  );
}

export default function NgoSearch() {
  const { t } = useI18n();
  const { ngo } = useAuth();
  useDocumentTitle(t('search.title'));

  const [query, setQuery] = useState('');
  const [place, setPlace] = useState<Place | null>(ngo ? { lat: ngo.lat, lng: ngo.lng, label: ngo.address } : null);
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [radius, setRadius] = useState<number>(ngo?.alertRadiusKm ?? 5);
  const [foodType, setFoodType] = useState<FoodType | ''>('');
  const [minServings, setMinServings] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [claiming, setClaiming] = useState<Listing | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  const canClaim = ngo?.verification === 'approved';

  const filterKey = JSON.stringify([place, radius, foodType, minServings]);
  const lastFilterKey = useRef(filterKey);

  useEffect(() => {
    if (!place) return;
    if (lastFilterKey.current !== filterKey) {
      lastFilterKey.current = filterKey;
      if (page !== 1) {
        setPage(1); // re-runs this effect with page 1
        return;
      }
    }
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .get<SearchResult>(`/api/listings/search${qs({ lat: place.lat.toFixed(5), lng: place.lng.toFixed(5), radius, foodType, minServings, page })}`)
      .then((r) => {
        if (!alive) return;
        setResult((prev) => (page > 1 && prev ? { ...r, items: [...prev.items, ...r.items] } : r));
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page, nonce]);

  async function geocode(e?: React.FormEvent) {
    e?.preventDefault();
    if (query.trim().length < 3) return;
    setGeoBusy(true);
    setGeoError(null);
    try {
      const res = await api.get<{ results: GeocodeResult[] }>(`/api/geocode?q=${encodeURIComponent(query)}`);
      if (res.results.length === 0) setGeoError(t('search.noResults'));
      else if (res.results.length === 1) setPlace({ lat: res.results[0].lat, lng: res.results[0].lng, label: res.results[0].label });
      else setSuggestions(res.results);
    } catch (err) {
      setGeoError((err as Error).message);
    } finally {
      setGeoBusy(false);
    }
  }

  function useDevice() {
    if (!navigator.geolocation) return setGeoError(t('search.locationDenied'));
    setGeoBusy(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoBusy(false);
        setSuggestions([]);
        setPlace({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: t('search.myLocation') });
      },
      () => {
        setGeoBusy(false);
        setGeoError(t('search.locationDenied'));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  const items = result?.items ?? [];

  return (
    <Container>
      <PageHeader eyebrow={t('nav.findFood')} title={t('search.title')} subtitle={t('search.subtitle')} />
      <VerificationBanner />
      {ngo?.verification === 'pending' && <p className="-mt-4 mb-6 text-sm text-ivory/70">{t('search.notApprovedNote')}</p>}

      {/* Search controls */}
      <div className="card mb-6 space-y-4 p-4 sm:p-5">
        <form onSubmit={geocode} className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="q">
            {t('search.placeholder')}
          </label>
          <input id="q" className="input flex-1" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search.placeholder')} autoComplete="street-address" />
          <div className="flex gap-2">
            <Button type="submit" loading={geoBusy} className="flex-1 sm:flex-none">
              🔎 {t('common.search')}
            </Button>
            <Button type="button" variant="outline" onClick={useDevice} disabled={geoBusy} className="flex-1 sm:flex-none">
              📍 {geoBusy ? t('search.locating') : t('search.useMyLocation')}
            </Button>
          </div>
        </form>
        {suggestions.length > 0 && (
          <ul className="divide-y divide-ink/10 overflow-hidden rounded-xl border border-ink/15 bg-white">
            {suggestions.map((s) => (
              <li key={`${s.lat},${s.lng}`}>
                <button
                  className="w-full px-4 py-3 text-left text-sm text-ink hover:bg-gold/10"
                  onClick={() => {
                    setPlace({ lat: s.lat, lng: s.lng, label: s.label });
                    setSuggestions([]);
                  }}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        {geoError && <Alert tone="error">{geoError}</Alert>}

        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <span className="label">{t('search.radius')}</span>
            <div className="flex gap-1.5" role="radiogroup">
              {RADIUS_OPTIONS_KM.map((r) => (
                <button key={r} type="button" role="radio" aria-checked={radius === r} onClick={() => setRadius(r)} className={cx('chip', radius === r ? 'border-navy bg-navy text-gold' : 'border-ink/20 bg-white text-ink')}>
                  {r} km
                </button>
              ))}
            </div>
          </div>
          <label>
            <span className="label">{t('search.foodType')}</span>
            <select className="input min-w-32" value={foodType} onChange={(e) => setFoodType(e.target.value as FoodType | '')}>
              <option value="">{t('search.anyType')}</option>
              {FOOD_TYPES.map((f) => (
                <option key={f} value={f}>
                  {t(`food.${f}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">{t('search.minServings')}</span>
            <input className="input w-28" type="number" min={1} inputMode="numeric" value={minServings} onChange={(e) => setMinServings(e.target.value)} />
          </label>
          <div className="ml-auto flex overflow-hidden rounded-full border border-navy" role="tablist">
            {(['list', 'map'] as const).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cx('min-h-10 px-4 text-sm font-semibold', view === v ? 'bg-navy text-gold' : 'bg-white text-navy')}>
                {v === 'list' ? `☰ ${t('search.list')}` : `🗺 ${t('search.map')}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {!place ? (
        <EmptyState dark icon="📍" title={t('search.startHint')} />
      ) : (
        <>
          <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ivory/80" aria-live="polite">
            {loading && <Spinner small className="text-gold" />}
            <span>
              {t('search.near', { place: place.label.length > 60 ? `${place.label.slice(0, 60)}…` : place.label })} ·{' '}
              {result && t('search.results', { n: result.total, km: radius })}
            </span>
          </p>
          {error ? (
            <ErrorState dark message={error} onRetry={() => setNonce((n) => n + 1)} />
          ) : loading && !result ? (
            <SkeletonCards />
          ) : view === 'map' ? (
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <div className="overflow-hidden rounded-2xl border border-gold/50">
                <Suspense fallback={<div className="grid h-[60vh] place-items-center bg-navy-800"><Spinner className="text-gold" /></div>}>
                  <MapView
                    className="h-[60vh] w-full"
                    center={place}
                    me={place}
                    radiusKm={radius}
                    markers={items.map((l) => ({ id: l.id, lat: l.lat, lng: l.lng, label: String(l.servingsRemaining), title: `${l.title} — ${l.restaurantName}`, urgent: l.urgent }))}
                    onMarkerClick={(id) => {
                      setHighlight(id);
                      document.getElementById(`listing-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }}
                  />
                </Suspense>
              </div>
              <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
                {items.length === 0 ? (
                  <EmptyState dark title={t('search.noResults')} body={t('search.noResultsHint')} />
                ) : (
                  items.map((l) => (
                    <ListingCard key={l.id} listing={l} highlighted={highlight === l.id} actions={canClaim && <Button onClick={() => setClaiming(l)}>{t('card.claim')}</Button>} />
                  ))
                )}
              </div>
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              dark
              title={t('search.noResults')}
              body={t('search.noResultsHint')}
              action={
                <Link to="/ngo/profile" className="btn btn-gold">
                  🔔 {t('profile.alerts')}
                </Link>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  actions={
                    canClaim ? (
                      <Button className="w-full" onClick={() => setClaiming(l)}>
                        {t('card.claim')}
                      </Button>
                    ) : undefined
                  }
                />
              ))}
            </div>
          )}
          {result?.hasMore && (
            <div className="mt-6 flex justify-center">
              <Button variant="gold" loading={loading} onClick={() => setPage((p) => p + 1)}>
                {t('common.next')} →
              </Button>
            </div>
          )}
        </>
      )}

      {claiming && (
        <ClaimDialog
          listing={claiming}
          onClose={() => setClaiming(null)}
          onClaimed={() => {
            setPage(1);
            setNonce((n) => n + 1);
          }}
        />
      )}
    </Container>
  );
}

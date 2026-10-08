import { lazy, Suspense, useState } from 'react';
import type { GeocodeResult } from '../../../shared/types';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { Alert, Button, Spinner } from './ui';

const MapView = lazy(() => import('./MapView'));

export const VADODARA = { lat: 22.3072, lng: 73.1812 };

export interface AddressValue {
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
}

/** Address search (Nominatim via our cached API) + draggable map pin. */
export function AddressPicker({ value, onChange }: { value: AddressValue; onChange: (v: AddressValue) => void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState(value.address);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (query.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.get<{ results: GeocodeResult[] }>(`/api/geocode?q=${encodeURIComponent(query)}`);
      setResults(res.results);
      if (res.results.length === 0) setError(t('search.noResults'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function choose(r: GeocodeResult) {
    onChange({ address: query.trim().length > 5 ? query.trim() : r.label, city: r.city || value.city, lat: r.lat, lng: r.lng });
    setResults([]);
  }

  function locate() {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        onChange({ ...value, address: value.address || query, lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setBusy(false);
        setError(t('search.locationDenied'));
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="addr-q">
          {t('profile.address')}
        </label>
        <div className="flex gap-2">
          <input
            id="addr-q"
            className="input"
            value={query}
            autoComplete="street-address"
            onChange={(e) => {
              setQuery(e.target.value);
              onChange({ ...value, address: e.target.value });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void search();
              }
            }}
            placeholder={t('search.placeholder')}
          />
          <Button type="button" variant="outline" onClick={search} loading={busy} className="shrink-0">
            {t('profile.findAddress')}
          </Button>
        </div>
        <p className="hint">{t('profile.addressHint')}</p>
      </div>

      {results.length > 0 && (
        <ul className="divide-y divide-ink/10 overflow-hidden rounded-xl border border-ink/15 bg-white" role="listbox">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button type="button" className="w-full px-4 py-3 text-left text-sm text-ink hover:bg-leaf/10" onClick={() => choose(r)}>
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink/60">{t('profile.pinHint')}</p>
        <Button type="button" variant="ghost" onClick={locate} className="min-h-9 py-1 text-sm">
          📍 {t('profile.useLocation')}
        </Button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-leaf/40">
        <Suspense
          fallback={
            <div className="grid h-64 place-items-center bg-ivory-200">
              <Spinner className="text-leaf-dark" />
            </div>
          }
        >
          <MapView
            className="h-64 w-full"
            center={value.lat != null && value.lng != null ? { lat: value.lat, lng: value.lng } : VADODARA}
            zoom={value.lat != null ? 15 : 12}
            pin={value.lat != null && value.lng != null ? { lat: value.lat, lng: value.lng } : null}
            onPinChange={(p) => onChange({ ...value, lat: p.lat, lng: p.lng })}
          />
        </Suspense>
      </div>
      {value.lat != null && value.lng != null ? (
        <p className="text-xs text-ink/60">
          📌 {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </p>
      ) : (
        <p className="text-xs font-medium text-vine">{t('profile.noLocation')}</p>
      )}
    </div>
  );
}

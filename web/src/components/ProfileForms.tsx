import { useState } from 'react';
import { RADIUS_OPTIONS_KM } from '../../../shared/constants';
import type { NgoProfile, RestaurantProfile } from '../../../shared/types';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { titleCase } from '../lib/format';
import { uploadFile } from '../lib/upload';
import { AddressPicker, type AddressValue } from './AddressPicker';
import { Alert, Button, Checkbox, Field } from './ui';

function useAddress(p: { address: string; city: string; lat: number; lng: number } | null): [AddressValue, (v: AddressValue) => void] {
  return useState<AddressValue>(
    p ? { address: p.address, city: titleCase(p.city), lat: p.lat, lng: p.lng } : { address: '', city: '', lat: null, lng: null },
  );
}

export function RestaurantProfileForm({ initial, onSaved }: { initial: RestaurantProfile | null; onSaved?: () => void }) {
  const { t } = useI18n();
  const { refresh } = useAuth();
  const [addr, setAddr] = useAddress(initial);
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    phone: initial?.phone ?? '',
    fssaiNumber: initial?.fssaiNumber ?? '',
    upiId: initial?.upiId ?? '',
    hideName: initial?.hideName ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (addr.lat == null || addr.lng == null) return setError(t('profile.noLocation'));
    setBusy(true);
    try {
      await api.put('/api/restaurant/profile', { ...form, upiId: form.upiId || null, address: addr.address, city: addr.city, lat: addr.lat, lng: addr.lng });
      await refresh();
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label={t('profile.restaurantName')}>
        {(id) => <input id={id} className="input" required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="organization" />}
      </Field>
      <AddressPicker value={addr} onChange={setAddr} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('profile.city')}>
          {(id) => <input id={id} className="input" required value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} autoComplete="address-level2" />}
        </Field>
        <Field label={t('profile.phone')}>
          {(id) => <input id={id} className="input" required type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" autoComplete="tel" />}
        </Field>
        <Field label={t('profile.fssai')} hint={t('profile.fssaiHint')}>
          {(id) => (
            <input id={id} className="input font-mono" required inputMode="numeric" pattern="\d{14}" maxLength={14} value={form.fssaiNumber} onChange={(e) => setForm({ ...form, fssaiNumber: e.target.value.replace(/\D/g, '') })} />
          )}
        </Field>
        <Field label={t('profile.upi')} hint={t('profile.upiHint')} optional>
          {(id) => <input id={id} className="input" value={form.upiId} onChange={(e) => setForm({ ...form, upiId: e.target.value.trim() })} placeholder="restaurant@upi" />}
        </Field>
      </div>
      <div>
        <Checkbox checked={form.hideName} onChange={(v) => setForm({ ...form, hideName: v })}>
          <strong>{t('profile.hideName')}</strong>
          <span className="block text-xs text-ink/60">{t('profile.hideNameHint')}</span>
        </Checkbox>
      </div>
      {initial && <p className="text-xs text-ink/60">ℹ️ {t('profile.reverifyNote')}</p>}
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">✓ {t('common.saved')}</Alert>}
      <Button type="submit" loading={busy} className="w-full sm:w-auto">
        {busy ? t('common.saving') : t('common.save')}
      </Button>
    </form>
  );
}

export function NgoProfileForm({ initial, onSaved }: { initial: NgoProfile | null; onSaved?: () => void }) {
  const { t } = useI18n();
  const { refresh } = useAuth();
  const [addr, setAddr] = useAddress(initial);
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    phone: initial?.phone ?? '',
    registrationNumber: initial?.registrationNumber ?? '',
    certificateKey: initial?.certificateKey ?? null,
    alertsEnabled: initial?.alertsEnabled ?? true,
    alertRadiusKm: initial?.alertRadiusKm ?? 5,
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (file.size > 5 * 1024 * 1024) return setError('File is too large (max 5 MB)');
    setUploading(true);
    try {
      const res = await uploadFile('cert', file);
      setForm((f) => ({ ...f, certificateKey: res.key }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (addr.lat == null || addr.lng == null) return setError(t('profile.noLocation'));
    setBusy(true);
    try {
      await api.put('/api/ngo/profile', { ...form, address: addr.address, city: addr.city, lat: addr.lat, lng: addr.lng });
      await refresh();
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label={t('profile.ngoName')}>
        {(id) => <input id={id} className="input" required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="organization" />}
      </Field>
      <AddressPicker value={addr} onChange={setAddr} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('profile.city')}>
          {(id) => <input id={id} className="input" required value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} autoComplete="address-level2" />}
        </Field>
        <Field label={t('profile.phone')}>
          {(id) => <input id={id} className="input" required type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" autoComplete="tel" />}
        </Field>
        <Field label={t('profile.regNumber')}>
          {(id) => <input id={id} className="input" required minLength={3} maxLength={60} value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} />}
        </Field>
      </div>

      <div>
        <span className="label">{t('profile.certificate')}</span>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-ink/25 bg-white p-4">
          <label className="btn btn-outline cursor-pointer">
            {uploading ? '…' : form.certificateKey ? t('profile.replaceCert') : t('profile.uploadCert')}
            <input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} disabled={uploading} />
          </label>
          {form.certificateKey && (
            <a href={`/api/files/${form.certificateKey}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-navy underline">
              📄 {t('profile.viewCert')}
            </a>
          )}
        </div>
        <p className="hint">{t('profile.certificateHint')}</p>
      </div>

      <div className="rounded-xl border border-ink/15 bg-white p-4">
        <Checkbox checked={form.alertsEnabled} onChange={(v) => setForm({ ...form, alertsEnabled: v })}>
          {t('profile.alerts')}
        </Checkbox>
        {form.alertsEnabled && (
          <div className="mt-2 flex flex-wrap items-center gap-2 pl-2">
            <span className="text-sm text-ink/70">{t('profile.alertRadius')}:</span>
            {RADIUS_OPTIONS_KM.map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setForm({ ...form, alertRadiusKm: r })}
                className={`chip ${form.alertRadiusKm === r ? 'border-gold bg-gold text-navy' : 'border-ink/20 text-ink'}`}
                aria-pressed={form.alertRadiusKm === r}
              >
                {r} km
              </button>
            ))}
          </div>
        )}
      </div>
      {initial && <p className="text-xs text-ink/60">ℹ️ {t('profile.reverifyNote')}</p>}
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">✓ {t('common.saved')}</Alert>}
      <Button type="submit" loading={busy} disabled={uploading} className="w-full sm:w-auto">
        {busy ? t('common.saving') : t('common.save')}
      </Button>
    </form>
  );
}

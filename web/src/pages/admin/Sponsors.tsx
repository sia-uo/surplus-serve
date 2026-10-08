import { useState } from 'react';
import { SPONSOR_TIERS, type SponsorTier } from '../../../../shared/constants';
import type { Sponsor } from '../../../../shared/types';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Loading, Modal } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { api } from '../../lib/api';
import { titleCase, todayIso } from '../../lib/format';
import { useQuery } from '../../lib/hooks';
import { uploadFile } from '../../lib/upload';
import { AdminTitle } from './AdminShell';

function SponsorForm({ initial, onSaved }: { initial: Sponsor | null; onSaved: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    website: initial?.website ?? '',
    city: initial ? (initial.city === 'all' ? 'all' : titleCase(initial.city)) : '',
    tier: (initial?.tier ?? 'gold') as SponsorTier,
    startDate: initial?.startDate ?? todayIso(),
    endDate: initial?.endDate ?? todayIso(365),
    logoKey: initial?.logoUrl ? initial.logoUrl.replace('/api/files/', '') : null as string | null,
  });
  const [preview, setPreview] = useState<string | null>(initial?.logoUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLogo(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const res = await uploadFile('logo', file);
      setForm((f) => ({ ...f, logoKey: res.key }));
      setPreview(res.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...form, website: form.website || null };
      if (initial) await api.put(`/api/admin/sponsors/${initial.id}`, body);
      else await api.post('/api/admin/sponsors', body);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t('admin.sponsorName')}>{(id) => <input id={id} className="input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
      <div>
        <span className="label">{t('admin.logo')}</span>
        <div className="flex items-center gap-3">
          {preview && <img src={preview} alt="" className="h-14 w-28 rounded-lg border border-ink/15 bg-white object-contain p-1" />}
          <label className="btn btn-outline cursor-pointer">
            {uploading ? '…' : t('common.edit')}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} />
          </label>
        </div>
      </div>
      <Field label={t('admin.website')} optional>
        {(id) => <input id={id} className="input" type="url" placeholder="https://" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('admin.sponsorCity')} hint={t('admin.sponsorCityHint')}>
          {(id) => <input id={id} className="input" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />}
        </Field>
        <Field label={t('admin.tier')}>
          {(id) => (
            <select id={id} className="input" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value as SponsorTier })}>
              {SPONSOR_TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {t(`admin.tier.${tier}` as MessageKey)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('admin.start')}>{(id) => <input id={id} className="input" type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />}</Field>
        <Field label={t('admin.end')}>{(id) => <input id={id} className="input" type="date" required min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />}</Field>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" loading={busy} disabled={uploading}>
        {t('common.save')}
      </Button>
    </form>
  );
}

export default function AdminSponsors() {
  const { t } = useI18n();
  const { data, error, loading, reload } = useQuery<{ items: Sponsor[] }>('/api/admin/sponsors');
  const [editing, setEditing] = useState<Sponsor | null | 'new'>(null);
  const today = todayIso();

  async function remove(s: Sponsor) {
    if (!confirm(t('admin.sponsorDelete'))) return;
    try {
      await api.del(`/api/admin/sponsors/${s.id}`);
      reload();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div>
      <AdminTitle actions={<Button onClick={() => setEditing('new')}>＋ {t('admin.sponsorAdd')}</Button>}>{t('admin.sponsors')}</AdminTitle>
      {loading ? (
        <Loading dark />
      ) : error ? (
        <ErrorState dark message={error} onRetry={reload} />
      ) : !data?.items.length ? (
        <EmptyState dark icon="🏅" title={t('admin.noSponsors')} action={<Button onClick={() => setEditing('new')}>{t('admin.sponsorAdd')}</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((s) => {
            const state = s.startDate > today ? 'scheduled' : s.endDate < today ? 'ended' : 'live';
            return (
              <Card key={s.id}>
                <div className="flex h-16 items-center justify-center rounded-xl bg-white">
                  {s.logoUrl ? <img src={s.logoUrl} alt={s.name} className="max-h-14 max-w-full object-contain" /> : <span className="font-serif text-xl font-bold text-navy">{s.name}</span>}
                </div>
                <h3 className="mt-3 font-serif text-lg font-bold text-navy">{s.name}</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone="gold">{t(`admin.tier.${s.tier}` as MessageKey)}</Badge>
                  <Badge tone="navy">{s.city === 'all' ? '🇮🇳 all' : titleCase(s.city)}</Badge>
                  <Badge tone={state === 'live' ? 'green' : state === 'scheduled' ? 'outline' : 'gray'}>{t(`admin.${state}` as MessageKey)}</Badge>
                </div>
                <p className="mt-2 text-xs text-ink/60">
                  {s.startDate} → {s.endDate}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" className="min-h-9 py-1" onClick={() => setEditing(s)}>
                    {t('common.edit')}
                  </Button>
                  <Button variant="ghost" className="min-h-9 py-1 text-crimson" onClick={() => remove(s)}>
                    {t('common.delete')}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? t('admin.sponsorAdd') : t('admin.sponsorEdit')}>
        {editing !== null && (
          <SponsorForm
            initial={editing === 'new' ? null : editing}
            onSaved={() => {
              setEditing(null);
              reload();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

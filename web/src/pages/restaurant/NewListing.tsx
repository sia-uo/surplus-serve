import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Allergen, FoodType } from '../../../../shared/constants';
import { listingTimeError } from '../../../../shared/listingTimes';
import { VerificationBanner } from '../../components/Guards';
import { Container } from '../../components/Layout';
import { AllergenPicker, checklistComplete, emptyChecklist, FoodTypePicker, SafetyChecklist } from '../../components/ListingFields';
import { Alert, Button, Card, Field, PageHeader } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fromLocalInput, toLocalInput } from '../../lib/format';
import { useDocumentTitle } from '../../lib/hooks';
import { uploadFile } from '../../lib/upload';

const MIN = 60_000;

export default function NewListing() {
  const { t } = useI18n();
  const { restaurant, config } = useAuth();
  const navigate = useNavigate();
  useDocumentTitle(t('newListing.title'));
  const cap = config?.packagingCap ?? 15;

  const defaults = useMemo(() => {
    const now = Math.floor(Date.now() / (5 * MIN)) * 5 * MIN;
    return {
      cookedAt: toLocalInput(now - 30 * MIN),
      safeUntil: toLocalInput(now + 4 * 60 * MIN),
      pickupStart: toLocalInput(now),
      pickupEnd: toLocalInput(now + 2 * 60 * MIN),
    };
  }, []);

  const [form, setForm] = useState({
    title: '',
    description: '',
    servings: 20,
    foodType: 'veg' as FoodType,
    allergens: [] as Allergen[],
    packagingCost: 0,
    ...defaults,
  });
  const [checklist, setChecklist] = useState(emptyChecklist);
  const [photo, setPhoto] = useState<{ key: string; url: string | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      setPhoto(await uploadFile('photo', file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  /** Why posting is blocked right now, if it is — shown instead of silently disabling the button. */
  function blocker(): string | null {
    if (!restaurant) return t('newListing.noProfile');
    if (restaurant.verification === 'pending') return t('newListing.notApproved');
    if (restaurant.verification === 'rejected') return t('newListing.rejected');
    if (!checklistComplete(checklist)) return t('newListing.checkAll');
    const timeError = listingTimeError(
      {
        cookedAt: fromLocalInput(form.cookedAt),
        safeUntil: fromLocalInput(form.safeUntil),
        pickupStart: fromLocalInput(form.pickupStart),
        pickupEnd: fromLocalInput(form.pickupEnd),
      },
      Date.now(),
    );
    if (timeError) return t(`time.${timeError}` as MessageKey);
    if (form.packagingCost > cap) return t('newListing.packagingHint', { cap });
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const reason = blocker();
    setError(reason);
    if (reason) return;
    setBusy(true);
    try {
      await api.post('/api/restaurant/listings', {
        title: form.title,
        description: form.description,
        servings: Number(form.servings),
        foodType: form.foodType,
        allergens: form.allergens,
        packagingCost: Number(form.packagingCost),
        cookedAt: fromLocalInput(form.cookedAt),
        safeUntil: fromLocalInput(form.safeUntil),
        pickupStart: fromLocalInput(form.pickupStart),
        pickupEnd: fromLocalInput(form.pickupEnd),
        photoKey: photo?.key ?? null,
        checklist,
      });
      navigate('/restaurant', { state: { posted: true } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const approved = restaurant?.verification === 'approved';

  return (
    <Container className="max-w-3xl">
      <PageHeader eyebrow={t('nav.postFood')} title={t('newListing.title')} subtitle={t('newListing.subtitle')} />
      <VerificationBanner />
      <Card>
        <form onSubmit={submit} className="space-y-6">
          <Field label={t('newListing.foodTitle')}>
            {(id) => <input id={id} className="input" required minLength={3} maxLength={100} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('newListing.foodTitlePh')} />}
          </Field>
          <Field label={t('newListing.description')} optional>
            {(id) => <textarea id={id} className="input min-h-24" maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t('newListing.descriptionPh')} />}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('newListing.servings')}>
              {(id) => <input id={id} className="input" type="number" required min={1} max={5000} value={form.servings} onChange={(e) => setForm({ ...form, servings: Number(e.target.value) })} />}
            </Field>
            <Field label={t('newListing.packagingCost')} hint={t('newListing.packagingHint', { cap })}>
              {(id) => (
                <input id={id} className="input" type="number" required min={0} max={cap} step={1} value={form.packagingCost} onChange={(e) => setForm({ ...form, packagingCost: Number(e.target.value) })} />
              )}
            </Field>
          </div>
          <div>
            <span className="label">{t('newListing.foodType')}</span>
            <FoodTypePicker value={form.foodType} onChange={(v) => setForm({ ...form, foodType: v })} />
          </div>
          <div>
            <span className="label">{t('newListing.allergens')}</span>
            <AllergenPicker value={form.allergens} onChange={(v) => setForm({ ...form, allergens: v })} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {(['cookedAt', 'safeUntil', 'pickupStart', 'pickupEnd'] as const).map((k) => (
              <Field key={k} label={t(`newListing.${k}`)}>
                {(id) => <input id={id} className="input" type="datetime-local" required value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />}
              </Field>
            ))}
          </div>
          <p className="-mt-3 text-xs text-ink/60">ℹ️ {t('newListing.timesHint')}</p>

          <div>
            <span className="label">
              {t('newListing.photo')} <span className="font-normal text-ink/50">({t('common.optional')})</span>
            </span>
            {photo?.url ? (
              <div className="flex items-center gap-3">
                <img src={photo.url} alt="" className="h-24 w-32 rounded-xl object-cover" />
                <Button type="button" variant="outline" onClick={() => setPhoto(null)}>
                  {t('newListing.removePhoto')}
                </Button>
              </div>
            ) : (
              <label className="btn btn-outline cursor-pointer">
                📷 {uploading ? '…' : t('newListing.uploadPhoto')}
                <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" disabled={uploading} onChange={(e) => onPhoto(e.target.files?.[0])} />
              </label>
            )}
          </div>

          <SafetyChecklist value={checklist} onChange={setChecklist} />

          {!approved && !error && <Alert tone="warning">⏳ {restaurant?.verification === 'rejected' ? t('newListing.rejected') : restaurant ? t('newListing.notApproved') : t('newListing.noProfile')}</Alert>}
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" loading={busy} disabled={uploading} className="px-8">
              {busy ? t('newListing.posting') : t('newListing.post')}
            </Button>
            <Link to="/restaurant/recurring" className="text-sm text-verd underline">
              {t('newListing.makeRecurring')}
            </Link>
          </div>
        </form>
      </Card>
    </Container>
  );
}

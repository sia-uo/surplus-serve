import { useState } from 'react';
import type { Allergen, FoodType } from '../../../../shared/constants';
import type { RecurringTemplate } from '../../../../shared/types';
import { VerificationBanner } from '../../components/Guards';
import { Container } from '../../components/Layout';
import { AllergenPicker, checklistComplete, emptyChecklist, FoodTypePicker, SafetyChecklist } from '../../components/ListingFields';
import { FoodTypeBadge } from '../../components/ListingCard';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Loading, Modal, PageHeader } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtDate } from '../../lib/format';
import { useDocumentTitle, useQuery } from '../../lib/hooks';

function NewRecurringForm({ onCreated }: { onCreated: () => void }) {
  const { t } = useI18n();
  const { config } = useAuth();
  const cap = config?.packagingCap ?? 15;
  const [form, setForm] = useState({
    title: '',
    description: '',
    servings: 20,
    foodType: 'veg' as FoodType,
    allergens: [] as Allergen[],
    packagingCost: 0,
    frequency: 'daily' as 'daily' | 'weekly',
    weekday: 1,
    postTime: '21:30',
    safeHours: 4,
    pickupStartOffsetMin: 0,
    pickupDurationMin: 120,
  });
  const [checklist, setChecklist] = useState(emptyChecklist);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const num = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: Number(e.target.value) });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!checklistComplete(checklist)) return setError(t('newListing.checkAll'));
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/restaurant/recurring', { ...form, weekday: form.frequency === 'weekly' ? form.weekday : null, checklist });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Field label={t('newListing.foodTitle')}>
        {(id) => <input id={id} className="input" required minLength={3} maxLength={100} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('newListing.foodTitlePh')} />}
      </Field>
      <Field label={t('newListing.description')} optional>
        {(id) => <textarea id={id} className="input min-h-20" maxLength={1000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('newListing.servings')}>{(id) => <input id={id} className="input" type="number" min={1} max={5000} required value={form.servings} onChange={num('servings')} />}</Field>
        <Field label={t('newListing.packagingCost')} hint={t('newListing.packagingHint', { cap })}>
          {(id) => <input id={id} className="input" type="number" min={0} max={cap} required value={form.packagingCost} onChange={num('packagingCost')} />}
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('recurring.frequency')}>
          {(id) => (
            <select id={id} className="input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as 'daily' | 'weekly' })}>
              <option value="daily">{t('recurring.daily')}</option>
              <option value="weekly">{t('recurring.weekly')}</option>
            </select>
          )}
        </Field>
        {form.frequency === 'weekly' && (
          <Field label={t('recurring.weekday')}>
            {(id) => (
              <select id={id} className="input" value={form.weekday} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}>
                {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                  <option key={d} value={d}>
                    {t(`day.${d}` as MessageKey)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label={t('recurring.postTime')}>{(id) => <input id={id} className="input" type="time" required value={form.postTime} onChange={(e) => setForm({ ...form, postTime: e.target.value })} />}</Field>
        <Field label={t('recurring.safeHours')}>{(id) => <input id={id} className="input" type="number" min={1} max={12} required value={form.safeHours} onChange={num('safeHours')} />}</Field>
        <Field label={t('recurring.pickupOffset')}>{(id) => <input id={id} className="input" type="number" min={0} max={600} required value={form.pickupStartOffsetMin} onChange={num('pickupStartOffsetMin')} />}</Field>
        <Field label={t('recurring.pickupDuration')}>{(id) => <input id={id} className="input" type="number" min={15} max={720} required value={form.pickupDurationMin} onChange={num('pickupDurationMin')} />}</Field>
      </div>
      <SafetyChecklist value={checklist} onChange={setChecklist} />
      <p className="text-xs text-ink/60">ℹ️ {t('recurring.checklistNote')}</p>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" loading={busy} disabled={!checklistComplete(checklist)}>
        {t('recurring.create')}
      </Button>
    </form>
  );
}

export default function Recurring() {
  const { t, intl } = useI18n();
  const { restaurant } = useAuth();
  useDocumentTitle(t('recurring.title'));
  const { data, error, loading, reload } = useQuery<{ items: RecurringTemplate[] }>('/api/restaurant/recurring');
  const [open, setOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function toggle(tpl: RecurringTemplate) {
    setActionError(null);
    try {
      await api.patch(`/api/restaurant/recurring/${tpl.id}`, { active: !tpl.active });
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }
  async function remove(tpl: RecurringTemplate) {
    if (!confirm(t('recurring.deleteConfirm'))) return;
    setActionError(null);
    try {
      await api.del(`/api/restaurant/recurring/${tpl.id}`);
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  const approved = restaurant?.verification === 'approved';

  return (
    <Container>
      <PageHeader
        eyebrow={t('nav.recurring')}
        title={t('recurring.title')}
        subtitle={t('recurring.subtitle')}
        actions={approved && <Button onClick={() => setOpen(true)}>＋ {t('recurring.new')}</Button>}
      />
      <VerificationBanner />
      {actionError && (
        <Alert tone="error" className="mb-4">
          {actionError}
        </Alert>
      )}
      {loading ? (
        <Loading dark />
      ) : error ? (
        <ErrorState dark message={error} onRetry={reload} />
      ) : !data?.items.length ? (
        <EmptyState dark icon="🔁" title={t('recurring.none')} action={approved ? <Button onClick={() => setOpen(true)}>{t('recurring.new')}</Button> : undefined} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.items.map((tpl) => (
            <Card key={tpl.id} className="animate-rise">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-serif text-xl font-bold text-navy">{tpl.title}</h3>
                <Badge tone={tpl.active ? 'green' : 'gray'}>{tpl.active ? t('recurring.active') : t('recurring.paused')}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                <FoodTypeBadge type={tpl.foodType} />
                <Badge tone="navy">
                  🔁 {tpl.frequency === 'daily' ? t('recurring.daily') : t(`day.${tpl.weekday ?? 0}` as MessageKey)} · {tpl.postTime} IST
                </Badge>
                <Badge tone="outline">
                  🍛 {tpl.servings} {t('common.servings')}
                </Badge>
              </div>
              <p className="mt-3 text-xs text-ink/60">{tpl.lastRunDate ? t('recurring.lastRun', { date: fmtDate(tpl.lastRunDate, intl) }) : t('recurring.never')}</p>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="min-h-9 py-1.5" onClick={() => toggle(tpl)}>
                  {tpl.active ? `⏸ ${t('recurring.pause')}` : `▶ ${t('recurring.resume')}`}
                </Button>
                <Button variant="ghost" className="min-h-9 py-1.5 text-crimson" onClick={() => remove(tpl)}>
                  {t('common.delete')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={t('recurring.new')} wide>
        <NewRecurringForm
          onCreated={() => {
            setOpen(false);
            reload();
          }}
        />
      </Modal>
    </Container>
  );
}

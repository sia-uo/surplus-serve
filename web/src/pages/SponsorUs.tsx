import { useState } from 'react';
import { Container } from '../components/Layout';
import { Alert, Button, Card, Field, PageHeader } from '../components/ui';
import { useI18n, type MessageKey } from '../i18n';
import { api } from '../lib/api';
import { useDocumentTitle } from '../lib/hooks';

export default function SponsorUs() {
  const { t } = useI18n();
  useDocumentTitle(t('nav.sponsorUs'));
  const [form, setForm] = useState({ name: '', email: '', organisation: '', city: '', phone: '', message: '', website: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/public/sponsor-contact', { ...form, city: form.city || undefined, phone: form.phone || undefined, website: form.website || undefined });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const why: [MessageKey, MessageKey, string][] = [
    ['sponsorUs.why1Title', 'sponsorUs.why1', '🔐'],
    ['sponsorUs.why2Title', 'sponsorUs.why2', '🏙️'],
    ['sponsorUs.why3Title', 'sponsorUs.why3', '📊'],
  ];

  return (
    <Container>
      <PageHeader eyebrow={t('nav.sponsorUs')} title={t('sponsorUs.title')} subtitle={t('sponsorUs.subtitle')} />
      <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          {why.map(([title, body, icon]) => (
            <div key={title} className="card-dark flex gap-4 p-5">
              <span className="text-3xl" aria-hidden>
                {icon}
              </span>
              <div>
                <h2 className="font-serif text-lg font-bold text-gold">{t(title)}</h2>
                <p className="mt-1 text-sm text-ivory/80">{t(body)}</p>
              </div>
            </div>
          ))}
        </div>
        <Card>
          <h2 className="mb-4 font-serif text-2xl font-bold text-verd">{t('sponsorUs.formTitle')}</h2>
          {sent ? (
            <Alert tone="success">✓ {t('sponsorUs.sent')}</Alert>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('sponsorUs.name')}>{(id) => <input id={id} className="input" required minLength={2} value={form.name} onChange={set('name')} autoComplete="name" />}</Field>
                <Field label={t('sponsorUs.email')}>{(id) => <input id={id} className="input" required type="email" value={form.email} onChange={set('email')} autoComplete="email" />}</Field>
                <Field label={t('sponsorUs.org')}>{(id) => <input id={id} className="input" required minLength={2} value={form.organisation} onChange={set('organisation')} autoComplete="organization" />}</Field>
                <Field label={t('sponsorUs.city')} optional>{(id) => <input id={id} className="input" value={form.city} onChange={set('city')} />}</Field>
                <Field label={t('sponsorUs.phone')} optional>{(id) => <input id={id} className="input" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />}</Field>
              </div>
              <Field label={t('sponsorUs.message')}>
                {(id) => <textarea id={id} className="input min-h-32" required minLength={10} maxLength={2000} value={form.message} onChange={set('message')} />}
              </Field>
              {/* Honeypot for bots — hidden from people and assistive tech */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={form.website} onChange={set('website')} />
              {error && <Alert tone="error">{error}</Alert>}
              <Button type="submit" loading={busy}>
                {busy ? t('common.sending') : t('sponsorUs.send')}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </Container>
  );
}

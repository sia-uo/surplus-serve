import { useState } from 'react';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { Alert, Button, Stars } from './ui';

/** Inline 1–5 star rating with an optional comment. */
export function RatingForm({ endpoint, onDone }: { endpoint: string; onDone: (rating: number) => void }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!rating) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(endpoint, { rating, comment: comment || undefined });
      onDone(rating);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-gold/40 bg-white p-3">
      <Stars value={rating} onChange={setRating} />
      <textarea className="input min-h-16 text-sm" placeholder={t('rating.comment')} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
      {error && <Alert tone="error">{error}</Alert>}
      <Button variant="gold-solid" className="min-h-9 py-1.5" disabled={!rating} loading={busy} onClick={submit}>
        {t('rating.submit')}
      </Button>
    </div>
  );
}

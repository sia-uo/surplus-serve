import { useEffect, useRef, useState } from 'react';
import { Container } from '../../components/Layout';
import { PartnerBadge } from '../../components/ListingCard';
import { Alert, Button, Card, ErrorState, Field, Loading, PageHeader, StatCard } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtNumber, titleCase } from '../../lib/format';
import { useDocumentTitle, useQuery } from '../../lib/hooks';

interface Analytics {
  monthly: { month: string; meals: number; pickups: number }[];
  topNgos: { name: string; meals: number; pickups: number }[];
  foodTypes: { type: string; meals: number }[];
  outcomes: Record<string, number>;
  rescueRate: number;
  avgMinutesToClaim: number;
}

interface CertData {
  restaurantName: string;
  city: string;
  month: string;
  meals: number;
  kgSaved: number;
  co2Avoided: number;
  pickups: number;
  ngos: number;
}

function Bars({ rows, label }: { rows: { key: string; label: string; value: number }[]; label: string }) {
  const { intl } = useI18n();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure>
      <figcaption className="sr-only">{label}</figcaption>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-2 text-sm">
            <span className="truncate text-ink/70">{r.label}</span>
            <span className="h-3 overflow-hidden rounded-full bg-ink/10">
              <span className="block h-full rounded-full bg-gradient-to-r from-gold-dark to-gold" style={{ width: `${(r.value / max) * 100}%` }} />
            </span>
            <span className="text-right font-semibold text-verd tabular-nums">{fmtNumber(r.value, intl)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** Draws the shareable certificate on a canvas (client-side; no server CPU). */
async function drawCertificate(canvas: HTMLCanvasElement, d: CertData, labels: Record<string, string>, intl: string) {
  const W = 1600;
  const H = 1000;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  await document.fonts?.ready;

  const bg = ctx.createRadialGradient(W / 2, 0, 50, W / 2, H / 2, W);
  bg.addColorStop(0, '#22573F');
  bg.addColorStop(1, '#0F2A1F');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const gold = ctx.createLinearGradient(0, 0, W, H);
  gold.addColorStop(0, '#F0D998');
  gold.addColorStop(0.5, '#CFA64A');
  gold.addColorStop(1, '#8A6A1E');
  ctx.strokeStyle = gold;
  ctx.lineWidth = 10;
  ctx.strokeRect(36, 36, W - 72, H - 72);
  ctx.lineWidth = 2;
  ctx.strokeRect(58, 58, W - 116, H - 116);

  try {
    const crest = await loadImage('/logo.svg');
    ctx.drawImage(crest, W / 2 - 80, 90, 160, 160);
  } catch {
    /* crest optional */
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = gold;
  ctx.font = '700 64px "Playfair Display", Georgia, serif';
  ctx.fillText(labels.heading, W / 2, 330);

  ctx.fillStyle = '#F8F4E8';
  ctx.font = '400 28px "Inter Variable", system-ui, sans-serif';
  ctx.fillText(labels.presented, W / 2, 390);

  ctx.fillStyle = gold;
  ctx.font = '700 58px "Playfair Display", Georgia, serif';
  ctx.fillText(d.restaurantName, W / 2, 465, W - 240);

  ctx.fillStyle = '#F8F4E8';
  ctx.font = '400 26px "Inter Variable", system-ui, sans-serif';
  const monthLabel = new Date(`${d.month}-01T00:00:00`).toLocaleDateString(intl, { month: 'long', year: 'numeric' });
  ctx.fillText(`${labels.body} · ${titleCase(d.city)} · ${monthLabel}`, W / 2, 520, W - 240);

  const stats = [
    [fmtNumber(d.meals, intl), labels.meals],
    [fmtNumber(d.kgSaved, intl), labels.kg],
    [fmtNumber(d.co2Avoided, intl), labels.co2],
    [fmtNumber(d.ngos, intl), labels.ngos],
  ];
  const colW = (W - 240) / stats.length;
  stats.forEach(([value, label], i) => {
    const x = 120 + colW * i + colW / 2;
    ctx.fillStyle = '#7A1F3D';
    ctx.beginPath();
    ctx.roundRect(x - colW / 2 + 16, 580, colW - 32, 190, 22);
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#F8F4E8';
    ctx.font = '700 64px "Playfair Display", Georgia, serif';
    ctx.fillText(value, x, 680, colW - 50);
    ctx.font = '500 24px "Inter Variable", system-ui, sans-serif';
    ctx.fillText(label, x, 730, colW - 50);
  });

  ctx.fillStyle = gold;
  ctx.font = '600 30px "Playfair Display", Georgia, serif';
  ctx.fillText(`♛ ${labels.partner}`, W / 2, 850);
  ctx.fillStyle = 'rgba(248,244,232,0.7)';
  ctx.font = '400 20px "Inter Variable", system-ui, sans-serif';
  ctx.fillText(labels.footer, W / 2, 900, W - 240);
}

function Certificate() {
  const { t, intl } = useI18n();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const { data, error, loading, reload } = useQuery<CertData>(`/api/restaurant/certificate?month=${month}`);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    const canvas = canvasRef.current;
    void drawCertificate(
      canvas,
      data,
      {
        heading: t('premium.certHeading'),
        presented: t('premium.certPresented'),
        body: t('premium.certBody'),
        meals: t('impact.meals'),
        kg: t('impact.kg'),
        co2: t('impact.co2'),
        ngos: t('impact.ngosServed'),
        partner: t('premium.badge'),
        footer: `SurplusServe · ${t('impact.subtitle')}`,
      },
      intl,
    ).then(() => setUrl(canvas.toDataURL('image/png')));
  }, [data, t, intl]);

  async function share() {
    if (!canvasRef.current) return;
    const blob = await new Promise<Blob | null>((r) => canvasRef.current!.toBlob(r, 'image/png'));
    if (!blob) return;
    const file = new File([blob], `surplusserve-impact-${month}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: t('premium.certHeading') }).catch(() => undefined);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-serif text-2xl font-bold text-verd">{t('premium.certificate')}</h2>
        <Field label={t('premium.month')}>{(id) => <input id={id} type="month" className="input" value={month} max={new Date().toISOString().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} />}</Field>
      </div>
      <div className="mt-4">
        {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : null}
        <canvas ref={canvasRef} className={`w-full rounded-xl border border-gold/50 ${loading || error ? 'hidden' : ''}`} aria-label={t('premium.certificate')} role="img" />
        {data && data.meals === 0 && <p className="mt-2 text-sm text-ink/60">{t('premium.noData')}</p>}
      </div>
      {url && !loading && (
        <div className="mt-4 flex flex-wrap gap-2">
          <a className="btn btn-primary" href={url} download={`surplusserve-impact-${month}.png`}>
            ⬇ {t('premium.downloadCert')}
          </a>
          {'share' in navigator && (
            <Button variant="outline" onClick={share}>
              {t('common.share')}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function AnalyticsPanel() {
  const { t, intl } = useI18n();
  const { data, error, loading, reload } = useQuery<Analytics>('/api/restaurant/analytics');
  if (loading) return <Loading dark />;
  if (error || !data) return <ErrorState dark message={error} onRetry={reload} />;
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold text-gold">{t('premium.analytics')}</h2>
      <div className="grid grid-cols-2 gap-4">
        <StatCard dark icon="🎯" label={t('premium.rescueRate')} value={`${data.rescueRate}%`} />
        <StatCard dark icon="⚡" label={t('premium.avgClaim')} value={t('premium.minutes', { n: fmtNumber(data.avgMinutesToClaim, intl) })} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="mb-3 font-serif text-lg font-bold text-verd">{t('premium.monthly')}</h3>
          {data.monthly.length ? <Bars label={t('premium.monthly')} rows={data.monthly.map((m) => ({ key: m.month, label: m.month, value: m.meals }))} /> : <p className="text-sm text-ink/60">{t('premium.noData')}</p>}
        </Card>
        <Card>
          <h3 className="mb-3 font-serif text-lg font-bold text-verd">{t('premium.topNgos')}</h3>
          {data.topNgos.length ? <Bars label={t('premium.topNgos')} rows={data.topNgos.map((n) => ({ key: n.name, label: n.name, value: n.meals }))} /> : <p className="text-sm text-ink/60">{t('premium.noData')}</p>}
        </Card>
        <Card>
          <h3 className="mb-3 font-serif text-lg font-bold text-verd">{t('premium.foodSplit')}</h3>
          {data.foodTypes.length ? (
            <Bars label={t('premium.foodSplit')} rows={data.foodTypes.map((f) => ({ key: f.type, label: t(`food.${f.type}` as MessageKey), value: f.meals }))} />
          ) : (
            <p className="text-sm text-ink/60">{t('premium.noData')}</p>
          )}
          <h3 className="mt-5 mb-3 font-serif text-lg font-bold text-verd">{t('admin.listingStatus')}</h3>
          <Bars label={t('admin.listingStatus')} rows={Object.entries(data.outcomes).map(([k, v]) => ({ key: k, label: t(`listing.${k}` as MessageKey), value: v }))} />
        </Card>
      </div>
    </section>
  );
}

function RequestForm() {
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/restaurant/premium-request', { message });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <h2 className="font-serif text-2xl font-bold text-verd">{t('premium.requestTitle')}</h2>
      <p className="mt-1 text-sm text-ink/70">{t('premium.requestBody')}</p>
      {sent ? (
        <Alert tone="success" className="mt-4">
          ✓ {t('premium.requested')}
        </Alert>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field label={t('premium.message')} optional>
            {(id) => <textarea id={id} className="input min-h-24" maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />}
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" loading={busy}>
            {t('premium.request')}
          </Button>
        </form>
      )}
    </Card>
  );
}

export default function Premium() {
  const { t } = useI18n();
  const { restaurant } = useAuth();
  useDocumentTitle(t('premium.title'));
  const features = ['premium.f1', 'premium.f2', 'premium.f3'] as const;

  return (
    <Container>
      <PageHeader eyebrow={t('nav.premium')} title={restaurant?.premium ? t('premium.active') : t('premium.title')} subtitle={t('premium.subtitle')} actions={restaurant?.premium && <PartnerBadge />} />
      {restaurant?.premium ? (
        <div className="space-y-8">
          <Certificate />
          <AnalyticsPanel />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card-dark p-7">
            <p className="font-serif text-2xl font-bold">
              <span className="gold-text">♛ {t('premium.badge')}</span>
            </p>
            <ul className="mt-5 space-y-3">
              {features.map((f) => (
                <li key={f} className="flex gap-3 text-ivory/90">
                  <span className="text-gold" aria-hidden>
                    ✦
                  </span>
                  {t(f)}
                </li>
              ))}
            </ul>
          </div>
          {restaurant ? <RequestForm /> : <Alert tone="warning">{t('status.incompleteBody')}</Alert>}
        </div>
      )}
    </Container>
  );
}

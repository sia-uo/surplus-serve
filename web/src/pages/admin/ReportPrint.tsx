import { useLocation } from 'react-router-dom';
import { CO2_PER_KG_FOOD, KG_PER_MEAL } from '../../../../shared/constants';
import type { SponsorReport } from '../../../../shared/types';
import { Crest } from '../../components/Logo';
import { Button, ErrorState, Loading } from '../../components/ui';
import { useI18n } from '../../i18n';
import { fmtDate } from '../../lib/format';
import { useDocumentTitle, useQuery } from '../../lib/hooks';
import { ReportBody } from './Reports';

/** Standalone printable sponsor report (opens in a new tab; use the browser's Print / Save as PDF). */
export default function ReportPrint() {
  const { t, intl } = useI18n();
  const { search } = useLocation();
  const { data, error, loading, reload } = useQuery<SponsorReport>(`/api/admin/report${search}`);
  useDocumentTitle(t('admin.reportTitle'));

  if (loading) return <Loading />;
  if (error || !data) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="min-h-dvh bg-white text-ink print:bg-white">
      <div className="mx-auto max-w-5xl p-6 sm:p-10">
        <div className="no-print mb-6 flex justify-end">
          <Button onClick={() => window.print()}>🖨 {t('common.print')}</Button>
        </div>
        <header className="flex items-center gap-5 border-b-4 border-double border-gold pb-6">
          <Crest className="size-20" />
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-gold-dark uppercase">SurplusServe</p>
            <h1 className="font-serif text-3xl font-bold text-navy">{t('admin.reportTitle')}</h1>
            <p className="text-ink/70">
              {data.city} · {fmtDate(data.from, intl)} – {fmtDate(data.to, intl)}
            </p>
          </div>
        </header>
        {data.sponsors.length > 0 && (
          <section className="my-6 rounded-2xl border border-gold/50 bg-ivory p-5 text-center">
            <p className="font-serif text-lg text-navy">{t('city.supportedBy', { city: data.city })}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-6">
              {data.sponsors.map((s) =>
                s.logoUrl ? <img key={s.id} src={s.logoUrl} alt={s.name} className="max-h-12" /> : <strong key={s.id} className="font-serif text-xl text-navy">{s.name}</strong>,
              )}
            </div>
          </section>
        )}
        <div className="mt-6">
          <ReportBody report={data} />
        </div>
        <footer className="mt-10 border-t border-ink/15 pt-4 text-xs text-ink/60">
          <p>{t('impact.methodology', { kg: KG_PER_MEAL, co2: CO2_PER_KG_FOOD })}</p>
          <p className="mt-1">
            Generated {new Date().toLocaleString(intl)} · {t('footer.disclaimerShort')}
          </p>
        </footer>
      </div>
    </div>
  );
}

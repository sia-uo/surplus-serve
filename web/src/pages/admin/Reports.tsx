import { useState } from 'react';
import type { SponsorReport } from '../../../../shared/types';
import { Alert, Button, Card, ErrorState, Field, Loading, StatCard } from '../../components/ui';
import { useI18n } from '../../i18n';
import { qs } from '../../lib/api';
import { fmtNumber, todayIso } from '../../lib/format';
import { useQuery } from '../../lib/hooks';
import { AdminTitle } from './AdminShell';

export function ReportBody({ report }: { report: SponsorReport }) {
  const { t, intl } = useI18n();
  const n = (v: number) => fmtNumber(v, intl);
  const max = Math.max(1, ...report.daily.map((d) => d.meals));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label={t('stats.meals')} value={n(report.meals)} />
        <StatCard label={t('stats.kg')} value={n(report.kgSaved)} />
        <StatCard label={t('stats.co2')} value={n(report.co2Avoided)} />
        <StatCard label={t('stats.pickups')} value={n(report.pickups)} />
        <StatCard label={t('stats.restaurants')} value={n(report.restaurants)} />
        <StatCard label={t('admin.ngos')} value={n(report.ngos)} />
      </div>
      {report.daily.length > 0 && (
        <Card>
          <h3 className="mb-3 font-serif text-lg font-bold text-navy">{t('admin.daily')}</h3>
          <div className="flex h-40 items-end gap-0.5" role="img" aria-label={t('admin.daily')}>
            {report.daily.map((d) => (
              <div key={d.date} title={`${d.date}: ${d.meals}`} className="min-w-1 flex-1 rounded-t bg-gradient-to-t from-gold-dark to-gold" style={{ height: `${Math.max(2, (d.meals / max) * 100)}%` }} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-ink/60">
            <span>{report.daily[0].date}</span>
            <span>{report.daily[report.daily.length - 1].date}</span>
          </div>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {(
          [
            [t('admin.byRestaurant'), report.byRestaurant],
            [t('admin.byNgo'), report.byNgo],
          ] as const
        ).map(([title, rows]) => (
          <Card key={title}>
            <h3 className="mb-3 font-serif text-lg font-bold text-navy">{title}</h3>
            <table className="w-full text-left text-sm text-ink">
              <thead className="text-xs text-ink/60 uppercase">
                <tr>
                  <th className="py-1">{t('profile.title')}</th>
                  <th className="text-right">{t('stats.meals')}</th>
                  <th className="text-right">{t('stats.pickups')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {rows.map((r) => (
                  <tr key={r.name}>
                    <td className="py-1.5">{r.name}</td>
                    <td className="text-right tabular-nums">{n(r.meals)}</td>
                    <td className="text-right tabular-nums">{n(r.pickups)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
      <p className="text-xs text-ink/60">🔐 {t('admin.verifiedNote')}</p>
    </div>
  );
}

export default function AdminReports() {
  const { t } = useI18n();
  const [form, setForm] = useState({ city: 'Vadodara', from: todayIso(-30), to: todayIso() });
  const [submitted, setSubmitted] = useState<typeof form | null>(null);
  const query = submitted ? qs(submitted) : '';
  const { data, error, loading, reload } = useQuery<SponsorReport>(submitted ? `/api/admin/report${query}` : null);

  return (
    <div>
      <AdminTitle>{t('admin.reportTitle')}</AdminTitle>
      <Card className="mb-6">
        <form
          className="grid gap-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted({ ...form });
          }}
        >
          <Field label={t('admin.city')} hint={t('admin.reportCityHint')}>
            {(id) => <input id={id} className="input" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />}
          </Field>
          <Field label={t('admin.from')}>{(id) => <input id={id} className="input" type="date" required value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />}</Field>
          <Field label={t('admin.to')}>{(id) => <input id={id} className="input" type="date" required value={form.to} min={form.from} onChange={(e) => setForm({ ...form, to: e.target.value })} />}</Field>
          <Button type="submit" className="sm:mb-[1.35rem]">
            {t('admin.generate')}
          </Button>
        </form>
      </Card>
      {!submitted ? null : loading ? (
        <Loading dark />
      ) : error ? (
        <ErrorState dark message={error} onRetry={reload} />
      ) : data ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-2xl font-bold text-gold">
              {data.city} · {data.from} → {data.to}
            </h2>
            <div className="flex gap-2">
              <a className="btn btn-gold" href={`/api/admin/report${qs({ ...submitted, format: 'csv' })}`} download>
                ⬇ {t('admin.csv')}
              </a>
              <a className="btn btn-gold-solid" href={`/admin/reports/print${query}`} target="_blank" rel="noreferrer">
                🖨 {t('admin.printable')}
              </a>
            </div>
          </div>
          {data.pickups === 0 && (
            <Alert tone="warning" className="mb-4">
              {t('admin.noAudit')}
            </Alert>
          )}
          <ReportBody report={data} />
        </>
      ) : null}
    </div>
  );
}

import { Link } from 'react-router-dom';
import type { ImpactStats } from '../../../../shared/types';
import { Card, ErrorState, Loading, StatCard } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { fmtNumber } from '../../lib/format';
import { useQuery } from '../../lib/hooks';
import { AdminTitle } from './AdminShell';

interface Overview {
  stats: ImpactStats;
  pending: { restaurants: number; ngos: number };
  cities: { city: string; label: string; meals: number; pickups: number; restaurants: number; ngos: number; kgSaved: number; co2Avoided: number }[];
  listings: Record<string, number>;
  users: Record<string, number>;
}

export default function AdminOverview() {
  const { t, intl } = useI18n();
  const { data, error, loading, reload } = useQuery<Overview>('/api/admin/overview');
  if (loading) return <Loading dark />;
  if (error || !data) return <ErrorState dark message={error} onRetry={reload} />;
  const n = (v: number) => fmtNumber(v, intl);

  return (
    <div className="space-y-8">
      <AdminTitle>{t('admin.overview')}</AdminTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/admin/verifications?type=restaurant" className="card flex items-center justify-between p-5 transition hover:shadow-xl">
          <span className="font-semibold text-verd">{t('admin.pendingRestaurants')}</span>
          <span className={`font-serif text-3xl font-bold ${data.pending.restaurants ? 'text-vine' : 'text-ink/40'}`}>{data.pending.restaurants}</span>
        </Link>
        <Link to="/admin/verifications?type=ngo" className="card flex items-center justify-between p-5 transition hover:shadow-xl">
          <span className="font-semibold text-verd">{t('admin.pendingNgos')}</span>
          <span className={`font-serif text-3xl font-bold ${data.pending.ngos ? 'text-vine' : 'text-ink/40'}`}>{data.pending.ngos}</span>
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard dark label={t('stats.meals')} value={n(data.stats.meals)} />
        <StatCard dark label={t('stats.kg')} value={n(data.stats.kgSaved)} />
        <StatCard dark label={t('stats.co2')} value={n(data.stats.co2Avoided)} />
        <StatCard dark label={t('stats.pickups')} value={n(data.stats.pickups)} />
        <StatCard dark label={t('stats.restaurants')} value={n(data.stats.restaurants)} />
        <StatCard dark label={t('stats.ngos')} value={n(data.stats.ngos)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-serif text-xl font-bold text-verd">{t('admin.listingStatus')}</h2>
          <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            {['active', 'claimed', 'completed', 'expired', 'cancelled'].map((s) => (
              <li key={s} className="rounded-xl bg-ivory-200 px-3 py-2">
                <span className="block text-ink/60">{t(`listing.${s}` as MessageKey)}</span>
                <span className="font-serif text-xl font-bold text-verd">{n(data.listings[s] ?? 0)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-serif text-xl font-bold text-verd">{t('admin.usersByRole')}</h2>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {Object.entries(data.users).map(([role, count]) => (
              <li key={role} className="rounded-xl bg-ivory-200 px-3 py-2">
                <span className="block text-ink/60 capitalize">{role}</span>
                <span className="font-serif text-xl font-bold text-verd">{n(count)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card className="overflow-x-auto">
        <h2 className="mb-3 font-serif text-xl font-bold text-verd">{t('admin.perCity')}</h2>
        {data.cities.length === 0 ? (
          <p className="text-sm text-ink/60">{t('admin.noAudit')}</p>
        ) : (
          <table className="w-full min-w-[560px] text-left text-sm text-ink">
            <thead className="border-b border-ink/15 text-xs text-ink/60 uppercase">
              <tr>
                <th className="py-2">{t('admin.city')}</th>
                <th>{t('stats.meals')}</th>
                <th>{t('stats.kg')}</th>
                <th>{t('stats.pickups')}</th>
                <th>{t('stats.restaurants')}</th>
                <th>{t('stats.ngos')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {data.cities.map((c) => (
                <tr key={c.city}>
                  <td className="py-2 font-semibold">
                    <Link className="underline" to={`/impact/${encodeURIComponent(c.city)}`}>
                      {c.label}
                    </Link>
                  </td>
                  <td>{n(c.meals)}</td>
                  <td>{n(c.kgSaved)}</td>
                  <td>{n(c.pickups)}</td>
                  <td>{n(c.restaurants)}</td>
                  <td>{n(c.ngos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

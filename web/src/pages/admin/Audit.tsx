import { useState } from 'react';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Loading, LoadMore } from '../../components/ui';
import { useI18n } from '../../i18n';
import { api } from '../../lib/api';
import { fmtDateTime, titleCase } from '../../lib/format';
import { usePaged } from '../../lib/hooks';
import { AdminTitle } from './AdminShell';

interface AuditRow {
  seq: number;
  claimId: string;
  restaurantName: string;
  ngoName: string;
  city: string;
  foodTitle: string;
  servings: number;
  otpVerified: boolean;
  verifiedAt: number;
  hash: string;
}

export default function AdminAudit() {
  const { t, intl } = useI18n();
  const list = usePaged<AuditRow>('/api/admin/audit');
  const [check, setCheck] = useState<{ ok: boolean; checked: number; brokenAtSeq: number | null } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  async function verify() {
    setChecking(true);
    setCheckError(null);
    try {
      setCheck(await api.get('/api/admin/audit/verify?limit=500'));
    } catch (e) {
      setCheckError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div>
      <AdminTitle actions={<Button variant="leaf" loading={checking} onClick={verify}>🔗 {t('admin.verifyChain')}</Button>}>{t('admin.audit')}</AdminTitle>
      <p className="mb-4 max-w-3xl text-sm text-ivory/75">{t('admin.auditIntro')}</p>
      {check && (
        <Alert tone={check.ok ? 'success' : 'error'} className="mb-4">
          {check.ok ? t('admin.chainOk', { n: check.checked }) : t('admin.chainBroken', { seq: check.brokenAtSeq ?? '?' })}
        </Alert>
      )}
      {checkError && (
        <Alert tone="error" className="mb-4">
          {checkError}
        </Alert>
      )}
      {list.error ? (
        <ErrorState dark message={list.error} onRetry={list.reload} />
      ) : list.loading && !list.items.length ? (
        <Loading dark />
      ) : list.items.length === 0 ? (
        <EmptyState dark icon="📜" title={t('admin.noAudit')} />
      ) : (
        <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full min-w-[820px] text-left text-sm text-ink">
            <thead className="border-b border-ink/15 bg-ivory-200 text-xs text-ink/60 uppercase">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4">{t('admin.when')}</th>
                <th className="px-4">{t('onboarding.restaurant')}</th>
                <th className="px-4">{t('onboarding.ngo')}</th>
                <th className="px-4">{t('newListing.foodTitle')}</th>
                <th className="px-4">{t('common.servings')}</th>
                <th className="px-4">OTP</th>
                <th className="px-4">Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {list.items.map((r) => (
                <tr key={r.seq}>
                  <td className="px-4 py-2.5 font-mono text-xs">{r.seq}</td>
                  <td className="px-4 text-xs whitespace-nowrap">{fmtDateTime(r.verifiedAt, intl)}</td>
                  <td className="px-4">
                    {r.restaurantName}
                    <span className="block text-xs text-ink/50">{titleCase(r.city)}</span>
                  </td>
                  <td className="px-4">{r.ngoName}</td>
                  <td className="px-4">{r.foodTitle}</td>
                  <td className="px-4 font-semibold">{r.servings}</td>
                  <td className="px-4">{r.otpVerified && <Badge tone="green">✓</Badge>}</td>
                  <td className="px-4 font-mono text-xs text-ink/60" title={r.hash}>
                    {r.hash.slice(0, 10)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 pb-4">
            <LoadMore hasMore={list.hasMore} loading={list.loading} onClick={list.loadMore} />
          </div>
        </Card>
      )}
    </div>
  );
}

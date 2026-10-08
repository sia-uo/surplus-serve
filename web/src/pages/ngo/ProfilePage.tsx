import { VerificationBanner } from '../../components/Guards';
import { Container } from '../../components/Layout';
import { NgoProfileForm } from '../../components/ProfileForms';
import { Badge, Card, PageHeader } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { useAuth } from '../../lib/auth';
import { useDocumentTitle } from '../../lib/hooks';

export default function NgoProfilePage() {
  const { t } = useI18n();
  const { ngo } = useAuth();
  useDocumentTitle(t('profile.title'));
  return (
    <Container className="max-w-3xl">
      <PageHeader eyebrow={t('nav.profile')} title={t('profile.title')} />
      <VerificationBanner />
      {ngo && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge tone={ngo.verification === 'approved' ? 'green' : ngo.verification === 'rejected' ? 'red' : 'gold'}>{t(`verification.${ngo.verification}` as MessageKey)}</Badge>
          <Badge tone="navy">
            🛡 {t('profile.scoreReliability')}: {ngo.reliabilityScore}
          </Badge>
          <Badge tone="outline">
            🍛 {ngo.mealsReceived} · ✓ {ngo.completedCount} · ✗ {ngo.noShowCount}
          </Badge>
        </div>
      )}
      <Card>
        <NgoProfileForm initial={ngo} />
      </Card>
    </Container>
  );
}

import { VerificationBanner } from '../../components/Guards';
import { Container } from '../../components/Layout';
import { PartnerBadge } from '../../components/ListingCard';
import { RestaurantProfileForm } from '../../components/ProfileForms';
import { Badge, Card, PageHeader } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { useAuth } from '../../lib/auth';
import { useDocumentTitle } from '../../lib/hooks';

export default function RestaurantProfilePage() {
  const { t } = useI18n();
  const { restaurant } = useAuth();
  useDocumentTitle(t('profile.title'));
  return (
    <Container className="max-w-3xl">
      <PageHeader eyebrow={t('nav.profile')} title={t('profile.title')} />
      <VerificationBanner />
      {restaurant && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Badge tone={restaurant.verification === 'approved' ? 'green' : restaurant.verification === 'rejected' ? 'red' : 'gold'}>
            {t(`verification.${restaurant.verification}` as MessageKey)}
          </Badge>
          <Badge tone="verd">
            ★ {t('profile.scoreQuality')}: {restaurant.qualityScore}
          </Badge>
          {restaurant.premium && <PartnerBadge />}
        </div>
      )}
      <Card>
        <RestaurantProfileForm initial={restaurant} />
      </Card>
    </Container>
  );
}

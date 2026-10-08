import { Container } from '../components/Layout';
import { Crest } from '../components/Logo';
import { LinkButton } from '../components/ui';
import { useI18n } from '../i18n';
import { useDocumentTitle } from '../lib/hooks';

export default function NotFound() {
  const { t } = useI18n();
  useDocumentTitle(t('notFound.title'));
  return (
    <Container className="max-w-lg py-20 text-center">
      <Crest className="mx-auto size-24 opacity-90" />
      <h1 className="gold-text mt-6 text-4xl font-bold">404 · {t('notFound.title')}</h1>
      <p className="mt-3 text-ivory/75">{t('notFound.body')}</p>
      <LinkButton to="/" className="mt-8">
        {t('notFound.home')}
      </LinkButton>
    </Container>
  );
}

import { NavLink, Outlet } from 'react-router-dom';
import { Container } from '../../components/Layout';
import { cx } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { useDocumentTitle } from '../../lib/hooks';

const LINKS: { to: string; key: MessageKey; end?: boolean }[] = [
  { to: '/admin', key: 'admin.overview', end: true },
  { to: '/admin/verifications', key: 'admin.verifications' },
  { to: '/admin/users', key: 'admin.users' },
  { to: '/admin/listings', key: 'admin.listings' },
  { to: '/admin/claims', key: 'admin.claims' },
  { to: '/admin/sponsors', key: 'admin.sponsors' },
  { to: '/admin/reports', key: 'admin.reports' },
  { to: '/admin/audit', key: 'admin.audit' },
  { to: '/admin/messages', key: 'admin.messages' },
];

export default function AdminShell() {
  const { t } = useI18n();
  useDocumentTitle(t('admin.title'));
  return (
    <Container>
      <p className="heading-eyebrow mb-3">{t('admin.title')}</p>
      <nav className="-mx-1 mb-8 flex gap-1 overflow-x-auto border-b border-gold/25 px-1 pb-3" aria-label="Admin">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) => cx('chip shrink-0', isActive ? 'border-gold bg-gold text-verd' : 'border-gold/30 text-ivory hover:border-gold')}
          >
            {t(l.key)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </Container>
  );
}

export function AdminTitle({ children, actions }: { children: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="gold-text font-serif text-3xl font-bold">{children}</h1>
      {actions}
    </div>
  );
}

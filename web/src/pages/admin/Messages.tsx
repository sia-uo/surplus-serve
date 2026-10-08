import { Badge, Button, Card, EmptyState, ErrorState, LoadMore, SkeletonCards } from '../../components/ui';
import { useI18n, type MessageKey } from '../../i18n';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { usePaged } from '../../lib/hooks';
import { AdminTitle } from './AdminShell';

interface Message {
  id: string;
  kind: 'sponsor' | 'premium';
  name: string;
  email: string;
  organisation: string | null;
  city: string | null;
  phone: string | null;
  message: string;
  handled: boolean;
  createdAt: number;
}

export default function AdminMessages() {
  const { t, intl } = useI18n();
  const list = usePaged<Message>('/api/admin/messages');

  async function markHandled(m: Message) {
    await api.post(`/api/admin/messages/${m.id}/handled`).catch(() => undefined);
    list.setItems((items) => items.map((x) => (x.id === m.id ? { ...x, handled: true } : x)));
  }

  return (
    <div>
      <AdminTitle>{t('admin.messages')}</AdminTitle>
      {list.error ? (
        <ErrorState dark message={list.error} onRetry={list.reload} />
      ) : list.loading && !list.items.length ? (
        <SkeletonCards n={2} />
      ) : list.items.length === 0 ? (
        <EmptyState dark icon="✉️" title={t('admin.noMessages')} />
      ) : (
        <>
          <div className="space-y-3">
            {list.items.map((m) => (
              <Card key={m.id} className={m.handled ? 'opacity-70' : ''}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-verd">
                      {m.name} {m.organisation && <span className="font-normal text-ink/70">· {m.organisation}</span>}
                    </p>
                    <p className="text-sm text-ink/70">
                      <a className="underline" href={`mailto:${m.email}`}>
                        {m.email}
                      </a>
                      {m.phone && ` · ${m.phone}`}
                      {m.city && ` · ${m.city}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={m.kind === 'sponsor' ? 'gold' : 'verd'}>{t(`admin.kind.${m.kind}` as MessageKey)}</Badge>
                    <span className="text-xs text-ink/60">{fmtDateTime(m.createdAt, intl)}</span>
                  </div>
                </div>
                <p className="mt-3 text-sm whitespace-pre-wrap text-ink">{m.message}</p>
                <div className="mt-3">
                  {m.handled ? (
                    <Badge tone="green">✓ {t('admin.handled')}</Badge>
                  ) : (
                    <Button variant="outline" className="min-h-9 py-1" onClick={() => markHandled(m)}>
                      {t('admin.markHandled')}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
          <LoadMore dark hasMore={list.hasMore} loading={list.loading} onClick={list.loadMore} />
        </>
      )}
    </div>
  );
}

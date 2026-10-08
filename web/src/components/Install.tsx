import { useState } from 'react';
import { useI18n } from '../i18n';
import { useInstall } from '../lib/pwa';
import { cx, Modal } from './ui';

export function InstallButton({ className, variant = 'leaf' }: { className?: string; variant?: 'leaf' | 'leaf-solid' }) {
  const { t } = useI18n();
  const { mode, install } = useInstall();
  const [iosOpen, setIosOpen] = useState(false);
  if (!mode) return null;
  return (
    <>
      <button className={cx('btn', `btn-${variant}`, className)} onClick={() => (mode === 'prompt' ? install() : setIosOpen(true))}>
        <span aria-hidden>⬇</span> {t('install.button')}
      </button>
      <IosInstructions open={iosOpen} onClose={() => setIosOpen(false)} />
    </>
  );
}

export function IosInstructions({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={t('install.iosTitle')}>
      <ol className="space-y-4 text-ink">
        <li className="flex gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-verd font-bold text-leaf">1</span>
          <span className="pt-1">
            {t('install.iosStep1')}{' '}
            <svg aria-hidden viewBox="0 0 24 24" className="inline size-5 align-text-bottom text-[#007AFF]" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v12M7 8l5-5 5 5M5 12v8h14v-8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </li>
        <li className="flex gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-verd font-bold text-leaf">2</span>
          <span className="pt-1">{t('install.iosStep2')} ➕</span>
        </li>
        <li className="flex gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-verd font-bold text-leaf">3</span>
          <span className="pt-1">{t('install.iosStep3')}</span>
        </li>
      </ol>
    </Modal>
  );
}

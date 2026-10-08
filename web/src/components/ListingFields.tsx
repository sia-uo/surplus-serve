import { ALLERGENS, FOOD_TYPES, SAFETY_CHECKLIST, type Allergen, type FoodType } from '../../../shared/constants';
import { useI18n, type MessageKey } from '../i18n';
import { Checkbox, cx } from './ui';

export function FoodTypePicker({ value, onChange }: { value: FoodType; onChange: (v: FoodType) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {FOOD_TYPES.map((f) => (
        <button
          type="button"
          key={f}
          role="radio"
          aria-checked={value === f}
          onClick={() => onChange(f)}
          className={cx('chip', value === f ? 'border-navy bg-navy text-gold' : 'border-ink/20 bg-white text-ink hover:border-gold-dark')}
        >
          {f === 'veg' ? '🟢' : f === 'nonveg' ? '🔺' : '✳️'} {t(`food.${f}` as MessageKey)}
        </button>
      ))}
    </div>
  );
}

export function AllergenPicker({ value, onChange }: { value: Allergen[]; onChange: (v: Allergen[]) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-2">
      {ALLERGENS.map((a) => {
        const on = value.includes(a);
        return (
          <button
            type="button"
            key={a}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== a) : [...value, a])}
            className={cx('chip text-sm', on ? 'border-crimson bg-crimson text-white' : 'border-ink/20 bg-white text-ink hover:border-crimson/60')}
          >
            {on ? '⚠ ' : ''}
            {t(`allergen.${a}` as MessageKey)}
          </button>
        );
      })}
    </div>
  );
}

export type ChecklistState = Record<(typeof SAFETY_CHECKLIST)[number], boolean>;
export const emptyChecklist = (): ChecklistState => Object.fromEntries(SAFETY_CHECKLIST.map((k) => [k, false])) as ChecklistState;
export const checklistComplete = (c: ChecklistState) => SAFETY_CHECKLIST.every((k) => c[k]);

export function SafetyChecklist({ value, onChange }: { value: ChecklistState; onChange: (v: ChecklistState) => void }) {
  const { t } = useI18n();
  const done = SAFETY_CHECKLIST.filter((k) => value[k]).length;
  return (
    <fieldset className={cx('rounded-2xl border-2 p-4', checklistComplete(value) ? 'border-emerald-700/40 bg-emerald-50/60' : 'border-crimson/40 bg-crimson/5')}>
      <legend className="px-2 font-serif text-lg font-bold text-navy">
        🛡️ {t('checklist.title')}{' '}
        <span className="font-sans text-sm font-medium text-ink/60">
          ({done}/{SAFETY_CHECKLIST.length})
        </span>
      </legend>
      <p className="mb-2 px-2 text-sm text-ink/70">{t('checklist.intro')}</p>
      {SAFETY_CHECKLIST.map((k) => (
        <Checkbox key={k} checked={value[k]} onChange={(v) => onChange({ ...value, [k]: v })}>
          {t(`checklist.${k}` as MessageKey)}
        </Checkbox>
      ))}
    </fieldset>
  );
}

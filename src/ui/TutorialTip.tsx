import { t } from '../i18n';

interface TutorialTipProps {
  step: number;
  onSkip: () => void;
}

export function TutorialTip({ step, onSkip }: TutorialTipProps) {
  if (step > 5) {
    return null;
  }

  return (
    <div className="tutorial-tip" role="status">
      <span>{t(`tutorial.step${step}`)}</span>
      <button onClick={onSkip}>
        {step === 5 ? t('tutorial.done') : t('tutorial.skip')}
      </button>
    </div>
  );
}

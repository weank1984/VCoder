import { HelpIcon, VoyahIcon } from '../Icon';
import { postMessage } from '../../utils/vscode';
import { useI18n } from '../../i18n/I18nProvider';
import './index.scss';

const prefixClass = 'vc-chat-welcome';

export function Welcome() {
  const { t } = useI18n();

  return (
    <div className={prefixClass}>
      <VoyahIcon className="vc-logo" style={{ fontSize: 80 }} aria-hidden="true" />

      <h1 className={`${prefixClass}-title`}>{t('Chat.WelcomeTitle')}</h1>

      <p className={`${prefixClass}-note`}>
        <span>{t('Chat.WelcomeNote')}</span>
        <button
          type="button"
          className={`${prefixClass}-doc-link`}
          title={t('Common.OpenSettings')}
          onClick={() => postMessage({ type: 'executeCommand', command: 'vcoder.openSettings' })}
        >
          <HelpIcon />
        </button>
      </p>
    </div>
  );
}

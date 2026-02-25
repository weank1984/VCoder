import React, { useEffect } from 'react';
import { BugIcon, SparkleIcon, DocSearchIcon, WrenchIcon, ChatIcon, HelpIcon } from '../Icon';
import { Logo } from '../Logo';
import { postMessage } from '../../bridge';
import { useI18n } from '../../i18n/I18nProvider';
import { useStore } from '../../store/useStore';
import { sanitizeSessionTitle } from '../../utils/sanitizeTitle';
import './index.scss';

const prefixClass = 'vc-chat-welcome';

function formatUpdatedAt(updatedAt: string | undefined, locale: string): string {
  if (!updatedAt) return '';
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

interface PromptSuggestion {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  prompt: string;
}

const PROMPT_SUGGESTIONS_EN: PromptSuggestion[] = [
  {
    icon: <BugIcon />,
    iconColor: 'var(--vc-suggestion-color-debug)',
    title: 'Debug my code',
    prompt: 'Help me find and fix the bug in my code',
  },
  {
    icon: <SparkleIcon />,
    iconColor: 'var(--vc-suggestion-color-feature)',
    title: 'Write a feature',
    prompt: 'Help me implement a new feature',
  },
  {
    icon: <DocSearchIcon />,
    iconColor: 'var(--vc-suggestion-color-explain)',
    title: 'Explain this code',
    prompt: 'Explain how this code works and what it does',
  },
  {
    icon: <WrenchIcon />,
    iconColor: 'var(--vc-suggestion-color-refactor)',
    title: 'Refactor code',
    prompt: 'Help me refactor this code to be cleaner and more maintainable',
  },
];

const PROMPT_SUGGESTIONS_ZH: PromptSuggestion[] = [
  {
    icon: <BugIcon />,
    iconColor: 'var(--vc-suggestion-color-debug)',
    title: '调试代码',
    prompt: '帮我找到并修复代码中的 bug',
  },
  {
    icon: <SparkleIcon />,
    iconColor: 'var(--vc-suggestion-color-feature)',
    title: '开发新功能',
    prompt: '帮我实现一个新功能',
  },
  {
    icon: <DocSearchIcon />,
    iconColor: 'var(--vc-suggestion-color-explain)',
    title: '解释代码',
    prompt: '解释这段代码的工作原理和功能',
  },
  {
    icon: <WrenchIcon />,
    iconColor: 'var(--vc-suggestion-color-refactor)',
    title: '重构代码',
    prompt: '帮我重构这段代码，使其更简洁易维护',
  },
];

export function Welcome() {
  const { t, language } = useI18n();
  const { historySessions } = useStore();

  useEffect(() => {
    postMessage({ type: 'listHistory' });
  }, []);

  const sorted = [...historySessions].sort((a, b) => {
    const at = new Date(a.updatedAt).getTime();
    const bt = new Date(b.updatedAt).getTime();
    if (Number.isNaN(at) && Number.isNaN(bt)) return 0;
    if (Number.isNaN(at)) return 1;
    if (Number.isNaN(bt)) return -1;
    return bt - at;
  });

  const items = sorted.slice(0, 4);
  const suggestions = language === 'zh-CN' ? PROMPT_SUGGESTIONS_ZH : PROMPT_SUGGESTIONS_EN;

  const handleSuggestionClick = (prompt: string) => {
    window.dispatchEvent(new CustomEvent('vcoder:fillInput', { detail: { content: prompt } }));
  };

  return (
    <div className={prefixClass}>
      <div className={`${prefixClass}-hero`}>
        <Logo size={32} aria-hidden="true" />
        <h1 className={`${prefixClass}-title`}>{t('Chat.WelcomeTitle')}</h1>
        <p className={`${prefixClass}-subtitle`}>
          {t('Chat.WelcomeNote')}
          <button
            type="button"
            className={`${prefixClass}-doc-link`}
            title={t('Common.OpenSettings')}
            aria-label={t('Common.OpenSettings')}
            onClick={() => postMessage({ type: 'executeCommand', command: 'vcoder.openSettings' })}
          >
            <HelpIcon />
          </button>
        </p>
      </div>

      {/* Example prompt suggestions */}
      <div className={`${prefixClass}-suggestions`}>
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            type="button"
            className={`${prefixClass}-suggestion-card`}
            onClick={() => handleSuggestionClick(suggestion.prompt)}
          >
            <span
              className={`${prefixClass}-suggestion-icon`}
              style={{ '--icon-color': suggestion.iconColor } as React.CSSProperties}
            >
              {suggestion.icon}
            </span>
            <span className={`${prefixClass}-suggestion-title`}>{suggestion.title}</span>
          </button>
        ))}
      </div>

      {/* Recent conversations */}
      {items.length > 0 && (
        <div className={`${prefixClass}-recents`}>
          <div className={`${prefixClass}-recents-header`}>
            <div className={`${prefixClass}-recents-title`}>{t('Chat.RecentConversations')}</div>
          </div>

          <div className={`${prefixClass}-recents-list`}>
            {items.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`${prefixClass}-recents-item`}
                onClick={() => postMessage({ type: 'loadHistory', sessionId: s.id })}
                title={sanitizeSessionTitle(s.title, t('Common.UntitledSession'))}
              >
                <span className={`${prefixClass}-recents-item-icon`}><ChatIcon /></span>
                <span className={`${prefixClass}-recents-item-title`}>{sanitizeSessionTitle(s.title, t('Common.UntitledSession'))}</span>
                <span className={`${prefixClass}-recents-item-time`}>
                  {formatUpdatedAt(s.updatedAt, language === 'zh-CN' ? 'zh-CN' : 'en-US')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

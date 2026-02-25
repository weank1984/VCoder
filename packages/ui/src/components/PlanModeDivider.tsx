/**
 * PlanModeDivider - 计划模式切换的内联系统事件行
 * 在对话流中以分割线 + 居中徽章的形式标注模式切换时机
 */

import { useI18n } from '../i18n/I18nProvider';
import { ListCheckIcon } from './Icon';
import './PlanModeDivider.scss';

interface PlanModeDividerProps {
    type: 'plan_mode_enter' | 'plan_mode_exit';
}

export function PlanModeDivider({ type }: PlanModeDividerProps) {
    const { t } = useI18n();
    const isEnter = type === 'plan_mode_enter';

    return (
        <div className={`plan-mode-divider ${isEnter ? 'plan-mode-divider--enter' : 'plan-mode-divider--exit'}`}>
            <div className="plan-mode-divider__line" />
            <div className="plan-mode-divider__badge">
                <span className="plan-mode-divider__icon"><ListCheckIcon /></span>
                <span className="plan-mode-divider__label">
                    {isEnter ? t('Common.PlanModeEntered') : t('Common.PlanModeExited')}
                </span>
                <span className="plan-mode-divider__hint">
                    {isEnter ? t('Common.PlanModeEnteredHint') : t('Common.PlanModeExitedHint')}
                </span>
            </div>
            <div className="plan-mode-divider__line" />
        </div>
    );
}

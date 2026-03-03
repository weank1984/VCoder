import type { HunkSeparator as HunkSeparatorType } from './diffUtils';
import { useI18n } from '../../i18n/I18nProvider';

interface HunkSeparatorProps {
    hunk: HunkSeparatorType;
    showLineNumbers?: boolean;
}

export function HunkSeparator({ hunk, showLineNumbers = true }: HunkSeparatorProps) {
    const { t } = useI18n();
    const { oldStart, oldCount, newStart, newCount, context } = hunk;

    // Calculate hidden lines (approximate from hunk gap)
    const hiddenLines = Math.max(0, oldStart - 1);

    return (
        <div className={`hunk-separator ${showLineNumbers ? 'hunk-separator--with-nums' : 'hunk-separator--no-nums'}`}>
            <span className="hunk-separator__range">
                @@ -{oldStart},{oldCount} +{newStart},{newCount} @@
            </span>
            {context && (
                <span className="hunk-separator__context">{context}</span>
            )}
            {hiddenLines > 0 && (
                <span className="hunk-separator__hidden">
                    {t('Agent.HunkCollapsed', [hiddenLines])}
                </span>
            )}
        </div>
    );
}

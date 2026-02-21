import { DiffViewerFull } from './DiffViewerFull';
import { DiffViewerCompact } from './DiffViewerCompact';

interface DiffViewerProps {
    filePath: string;
    diff: string;
    onAccept?: () => void;
    onReject?: () => void;
    actionsDisabled?: boolean;
    defaultCollapsed?: boolean;
    onViewFile?: (path: string) => void;
    variant?: 'full' | 'compact';
}

export function DiffViewer({
    variant = 'full',
    ...props
}: DiffViewerProps) {
    if (variant === 'compact') {
        return (
            <DiffViewerCompact
                filePath={props.filePath}
                diff={props.diff}
                defaultCollapsed={props.defaultCollapsed}
            />
        );
    }

    return (
        <DiffViewerFull
            filePath={props.filePath}
            diff={props.diff}
            onAccept={props.onAccept}
            onReject={props.onReject}
            actionsDisabled={props.actionsDisabled}
            defaultCollapsed={props.defaultCollapsed}
            onViewFile={props.onViewFile}
        />
    );
}

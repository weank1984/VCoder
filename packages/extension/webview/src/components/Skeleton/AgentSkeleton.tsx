/**
 * Agent Initialization Loading Skeleton
 * Shows placeholder while agent is initializing
 */

import './Skeleton.scss';

export function AgentSkeleton() {
    return (
        <div className="agent-skeleton">
            <div className="skeleton skeleton--rect agent-skeleton__logo" />
            <div className="skeleton skeleton--text agent-skeleton__title" />
            <div className="skeleton skeleton--text agent-skeleton__subtitle" />
        </div>
    );
}

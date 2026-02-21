/**
 * Session List Loading Skeleton
 * Shows placeholder while session list is loading
 */

import './Skeleton.scss';

interface SessionSkeletonProps {
    count?: number;
}

export function SessionSkeleton({ count = 5 }: SessionSkeletonProps) {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="session-skeleton">
                    <div className="skeleton skeleton--text session-skeleton__title" />
                    <div className="skeleton skeleton--text session-skeleton__subtitle" />
                </div>
            ))}
        </>
    );
}

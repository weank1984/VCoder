/**
 * Message Loading Skeleton
 * Shows placeholder while messages are loading
 */

import './Skeleton.scss';

interface MessageSkeletonProps {
    count?: number;
}

export function MessageSkeleton({ count = 3 }: MessageSkeletonProps) {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="message-skeleton">
                    <div className="message-skeleton__avatar">
                        <div className="skeleton skeleton--avatar" />
                    </div>
                    <div className="message-skeleton__content">
                        <div className="skeleton skeleton--text message-skeleton__line" />
                        <div className="skeleton skeleton--text message-skeleton__line" />
                        <div className="skeleton skeleton--text message-skeleton__line" />
                    </div>
                </div>
            ))}
        </>
    );
}

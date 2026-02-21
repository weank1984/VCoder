import React, { useRef, useState, useEffect } from 'react';
import classNames from 'classnames';
import './ResponsiveContainer.scss';

export type ResponsiveSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface ResponsiveContainerProps {
    children: React.ReactNode;
    size?: ResponsiveSize;
    className?: string;
    onSizeChange?: (size: ResponsiveSize) => void;
    type?: 'sidebar' | 'main' | 'modal' | 'popover' | 'custom';
    minSize?: ResponsiveSize;
    maxSize?: ResponsiveSize;
}

const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
    children,
    size,
    className,
    onSizeChange,
    type = 'custom',
    minSize = 'xs',
    maxSize = '2xl'
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [currentSize, setCurrentSize] = useState<ResponsiveSize>(size || 'md');

    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        
        const getSizeFromWidth = (width: number): ResponsiveSize => {
            if (width < 240) return 'xs';
            if (width < 320) return 'sm';
            if (width < 480) return 'md';
            if (width < 640) return 'lg';
            if (width < 800) return 'xl';
            return '2xl';
        };

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const newWidth = entry.contentRect.width;
                const newSize = getSizeFromWidth(newWidth);
                const validSize = validateSize(newSize, minSize, maxSize);
                
                if (validSize !== currentSize) {
                    setCurrentSize(validSize);
                    onSizeChange?.(validSize);
                }
            }
        });

        observer.observe(container);

        const initialWidth = container.getBoundingClientRect().width;
        const initialSize = validateSize(getSizeFromWidth(initialWidth), minSize, maxSize);
        setCurrentSize(initialSize);
        onSizeChange?.(initialSize);

        return () => {
            observer.disconnect();
        };
    }, [currentSize, minSize, maxSize, onSizeChange]);

    const validateSize = (
        newSize: ResponsiveSize, 
        min: ResponsiveSize, 
        max: ResponsiveSize
    ): ResponsiveSize => {
        const sizeOrder: ResponsiveSize[] = ['xs', 'sm', 'md', 'lg', 'xl', '2xl'];
        const minIndex = sizeOrder.indexOf(min);
        const maxIndex = sizeOrder.indexOf(max);
        const newIndex = sizeOrder.indexOf(newSize);

        if (newIndex < minIndex) return min;
        if (newIndex > maxIndex) return max;
        return newSize;
    };

    const containerClasses = classNames(
        'vc-responsive-container',
        `vc-responsive-container--${currentSize}`,
        `vc-responsive-container--type-${type}`,
        {
            [`vc-responsive-container---${size}`]: size,
        },
        className
    );

    return (
        <div 
            ref={containerRef}
            className={containerClasses}
            data-size={currentSize}
            data-type={type}
        >
            {children}
        </div>
    );
};

export default ResponsiveContainer;

export const useContainerQuery = (
    containerRef: React.RefObject<HTMLElement>,
    deps: React.DependencyList = []
) => {
    const [size, setSize] = useState<ResponsiveSize>('md');

    useEffect(() => {
        if (!containerRef.current) return;

        const element = containerRef.current;
        
        const getSizeFromWidth = (width: number): ResponsiveSize => {
            if (width < 240) return 'xs';
            if (width < 320) return 'sm';
            if (width < 480) return 'md';
            if (width < 640) return 'lg';
            if (width < 800) return 'xl';
            return '2xl';
        };

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const newWidth = entry.contentRect.width;
                const newSize = getSizeFromWidth(newWidth);
                setSize(newSize);
            }
        });

        observer.observe(element);

        const initialWidth = element.getBoundingClientRect().width;
        setSize(getSizeFromWidth(initialWidth));

        return () => {
            observer.disconnect();
        };
    }, deps);

    return size;
};
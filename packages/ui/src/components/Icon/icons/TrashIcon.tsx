import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const TrashIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-trash', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor">
                <path d="M911.9 198l-8-8H675.2c-8.7-35.4-29.1-67.4-57.5-90.6C587.8 75.3 550.3 62 512 62s-75.9 13.3-105.7 37.4c-28.5 23.1-48.9 55.2-57.5 90.6h-229l-8 8v64l8 8h263.4c10.6 0 21-3.9 28.6-11.2 7.9-7.6 12.2-17.8 12.2-28.7 0-23.5 9.1-45.6 25.8-62.2 16.6-16.7 38.7-25.8 62.2-25.8s45.6 9.2 62.2 25.8c16.6 16.7 25.8 38.8 25.8 62.2 0 10.9 4.3 21.1 12.2 28.7 7.6 7.4 18 11.2 28.6 11.2h263.1c4.4 0 8-3.6 8-8v-64zM792 370c-4.4 0-8 3.6-8 8v460.5c-0.2 24.1-19.9 43.5-44 43.5H283.9c-24.1 0-43.8-19.4-44-43.6V378c0-4.4-3.6-8-8-8h-64c-4.4 0-8 3.6-8 8v459.7c0 69.7 41.5 124.3 94.5 124.3h515.1c53 0 94.5-54.6 94.5-124.3V378c0-4.4-3.6-8-8-8h-64z"></path>
                <path d="M424 822h-56c-4.4 0-8-3.6-8-8V430c0-4.4 3.6-8 8-8h56c4.4 0 8 3.6 8 8v384c0 4.4-3.6 8-8 8zM664 822h-56c-4.4 0-8-3.6-8-8V430c0-4.4 3.6-8 8-8h56c4.4 0 8 3.6 8 8v384c0 4.4-3.6 8-8 8z"></path>
            </svg>
        </IconBase>
    );
};

export default TrashIcon;

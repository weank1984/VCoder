import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const DislikeIcon: React.FC<IconProps> = (props) => {
    const { className, ...restProps } = props;
    const mergedCls = classNames('vc-icon-dislike', className);

    return (
        <IconBase className={mergedCls} {...restProps}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5486" width="1em" height="1em" fill='currentColor'>
                <path d="M256 192l0 384c0 35.2-28.8 64-64 64L128 640c-35.2 0-64-28.8-64-64L64 192c0-35.2 28.8-64 64-64l64 0C227.2 128 256 156.8 256 192zM192 576 192 192 128 192l0 384L192 576z" p-id="5487"></path>
                <path d="M860.8 176 960 518.4c9.6 28.8 3.2 60.8-16 83.2-19.2 25.6-44.8 38.4-76.8 38.4l-182.4 0c25.6 32 44.8 67.2 57.6 108.8 12.8 35.2 6.4 70.4-12.8 99.2C710.4 876.8 675.2 896 640 896c-48 0-89.6-28.8-105.6-73.6-19.2-54.4-67.2-131.2-195.2-185.6C326.4 633.6 320 620.8 320 608L320 160c0-19.2 12.8-32 32-32l448 0C828.8 128 854.4 147.2 860.8 176zM800 192l0-32L800 192 800 192zM384 588.8c134.4 64 188.8 150.4 211.2 214.4 6.4 19.2 25.6 32 44.8 32 16 0 28.8-6.4 38.4-19.2 9.6-12.8 9.6-28.8 6.4-41.6-19.2-57.6-51.2-102.4-96-137.6-9.6-9.6-16-22.4-9.6-35.2 3.2-12.8 16-22.4 28.8-22.4l259.2 0c9.6 0 19.2-3.2 25.6-12.8 6.4-9.6 6.4-19.2 6.4-28.8L800 192 384 192 384 588.8z" p-id="5488"></path>
            </svg>
        </IconBase>
    );
};

export default DislikeIcon;
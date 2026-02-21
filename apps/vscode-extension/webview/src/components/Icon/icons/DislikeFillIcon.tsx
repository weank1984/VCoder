import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const DislikeFillIcon: React.FC<IconProps> = (props) => {
    const { className, ...restProps } = props;
    const mergedCls = classNames('vc-icon-dislike-fill', className);

    return (
        <IconBase className={mergedCls} {...restProps}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5649" width="1em" height="1em" fill="currentColor">
                <path d="M256 192v384c0 35.2-28.8 64-64 64H128c-35.2 0-64-28.8-64-64V192c0-35.2 28.8-64 64-64h64c35.2 0 64 28.8 64 64zM860.8 176L960 518.4c9.6 28.8 3.2 60.8-16 83.2-19.2 25.6-44.8 38.4-76.8 38.4h-182.4c25.6 32 44.8 67.2 57.6 108.8 12.8 35.2 6.4 70.4-12.8 99.2-19.2 28.8-54.4 48-89.6 48-48 0-89.6-28.8-105.6-73.6-19.2-54.4-67.2-131.2-195.2-185.6-12.8-3.2-19.2-16-19.2-28.8V160c0-19.2 12.8-32 32-32h448c28.8 0 54.4 19.2 60.8 48z" p-id="5650"></path>
            </svg>
        </IconBase>
    );
};

export default DislikeFillIcon;
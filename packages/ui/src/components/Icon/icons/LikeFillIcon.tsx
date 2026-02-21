import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const LikeFillIcon: React.FC<IconProps> = (props) => {
    const { className, ...restProps } = props;
    const mergedCls = classNames('vc-icon-like-fill', className);

    return (
        <IconBase className={mergedCls} {...restProps}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5324" width="1em" height="1em" fill="currentColor">
                <path d="M188.8 896h-64c-35.2 0-64-28.8-64-64V448c0-35.2 28.8-64 64-64h64c35.2 0 64 28.8 64 64v384c0 35.2-25.6 64-64 64zM796.8 896h-448c-19.2 0-32-12.8-32-32V416c0-12.8 6.4-25.6 19.2-28.8 128-54.4 176-131.2 195.2-185.6 16-44.8 60.8-73.6 105.6-73.6 35.2 0 70.4 19.2 92.8 48 22.4 28.8 25.6 67.2 12.8 99.2-12.8 41.6-35.2 76.8-57.6 108.8h182.4c32 0 57.6 12.8 76.8 38.4 19.2 25.6 25.6 54.4 16 83.2l-99.2 342.4c-9.6 28.8-35.2 48-64 48z" p-id="5325"></path>
            </svg>
        </IconBase>
    );
};

export default LikeFillIcon;
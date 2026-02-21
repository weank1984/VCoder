import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const AloneBottomIcon: React.FC<IconProps> = (props) => {
    const { className, ...restProps } = props;
    const mergedCls = classNames('vc-icon-alone-bottom', className);

    return (
        <IconBase className={mergedCls} {...restProps}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="14796" width="1em" height="1em" fill='currentColor'>
                <path d="M300.8 346.026667l211.2 211.2 211.2-211.2 60.373333 60.373333L512 677.973333 240.426667 406.4l60.373333-60.373333z" p-id="14797"></path>
            </svg>
        </IconBase>
    );
};

export default AloneBottomIcon;
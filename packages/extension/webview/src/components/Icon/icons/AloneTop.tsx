import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const AloneTopIcon: React.FC<IconProps> = (props) => {
    const { className, ...restProps } = props;
    const mergedCls = classNames('vc-icon-alone-top', className);

    return (
        <IconBase className={mergedCls} {...restProps}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="14634" width="1em" height="1em" fill='currentColor'>
                <path d="M240.426667 617.6L512 346.026667l271.573333 271.573333-60.373333 60.373333-211.2-211.2-211.2 211.2-60.373333-60.373333z" p-id="14635"></path>
            </svg>
        </IconBase>
    );
};

export default AloneTopIcon;
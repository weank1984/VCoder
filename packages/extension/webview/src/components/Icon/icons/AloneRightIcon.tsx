import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const AloneRightIcon: React.FC<IconProps> = (props) => {
    const { className, ...restProps } = props;
    const mergedCls = classNames('vc-icon-alone-right', className);

    return (
        <IconBase className={mergedCls} {...restProps}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="14958"  width="1em" height="1em" fill='currentColor'>
                <path d="M406.4 240.426667L677.973333 512 406.4 783.573333l-60.373333-60.373333 211.2-211.2-211.2-211.2 60.373333-60.373333z" p-id="14959"></path>
            </svg>
        </IconBase>
    );
};

export default AloneRightIcon;
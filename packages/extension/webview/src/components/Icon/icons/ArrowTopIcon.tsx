import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const ArrowTopIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-arrow-top', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="14634" width="1em" height="1em" fill='currentColor'>
                <path d="M240.426667 399.573333l60.373333 60.373334 168.533333-168.533334V896h85.333334V291.413333l168.533333 168.533334 60.373333-60.373334L512 128 240.426667 399.573333z" p-id="14635"></path>
            </svg>
        </IconBase>
    );
};

export default ArrowTopIcon;
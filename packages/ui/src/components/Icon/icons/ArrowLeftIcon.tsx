import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const ArrowLeftIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-arrow-left', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="15120" width="1em" height="1em" fill='currentColor'>
                <path d="M399.573333 783.573333l60.373334-60.373333-168.533334-168.533333H896v-85.333334H291.413333l168.533334-168.533333-60.373334-60.373333L128 512l271.573333 271.573333z" p-id="15121"></path>
            </svg>
        </IconBase>
    );
};

export default ArrowLeftIcon;
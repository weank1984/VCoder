import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const ArrowRightIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-arrow-right', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="14958" width="1em" height="1em" fill='currentColor'>
                <path d="M624.426667 240.426667l-60.373334 60.373333 168.533334 168.533333H128v85.333334h604.586667l-168.533334 168.533333 60.373334 60.373333L896 512 624.426667 240.426667z" p-id="14959"></path>
            </svg>
        </IconBase>
    );
};

export default ArrowRightIcon;
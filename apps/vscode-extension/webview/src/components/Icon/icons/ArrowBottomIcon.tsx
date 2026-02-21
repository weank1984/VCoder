import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const ArrowBottomIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-arrow-bottom', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="14796" width="1em" height="1em" fill='currentColor'>
                <path d="M783.573333 624.426667l-60.373333-60.373334-168.533333 168.533334V128h-85.333334v604.586667l-168.533333-168.533334-60.373333 60.373334L512 896l271.573333-271.573333z" p-id="14797"></path>
            </svg>
        </IconBase>
    );
};

export default ArrowBottomIcon;
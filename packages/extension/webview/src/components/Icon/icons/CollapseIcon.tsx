import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const CollapseIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-collapse', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="7270" width="1em" height="1em" fill="currentColor">
                <path d="M512 342.016l256 256-59.989333 59.989333-196.010667-196.010667-196.010667 196.010667-59.989333-59.989333z" p-id="7271"></path>
            </svg>
        </IconBase>
    );
};

export default CollapseIcon;
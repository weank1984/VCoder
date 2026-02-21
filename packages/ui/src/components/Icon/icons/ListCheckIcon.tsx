import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const ListCheckIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-list-check', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 24 24" version="1.1" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 18H3" />
                <path d="m15 18 2 2 4-4" />
                <path d="M16 12H3" />
                <path d="M16 6H3" />
            </svg>
        </IconBase>
    );
};

export default ListCheckIcon;

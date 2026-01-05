import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const NotebookIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-notebook', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 24 24" version="1.1" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 6h4" />
                <path d="M2 10h4" />
                <path d="M2 14h4" />
                <path d="M2 18h4" />
                <rect width="16" height="20" x="4" y="2" rx="2" />
                <path d="M16 2v20" />
            </svg>
        </IconBase>
    );
};

export default NotebookIcon;

import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const ExpandIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-expand', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6916" width="1em" height="1em" fill="currentColor">
                <path d="M707.626667 366.293333L512 561.92l-195.626667-195.626667L256 426.666667l256 256 256-256z" p-id="6917"></path>
            </svg>
        </IconBase>
    );
};

export default ExpandIcon;
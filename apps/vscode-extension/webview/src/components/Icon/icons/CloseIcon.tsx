import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const CloseIcon: React.FC<IconProps> = (props) => {
    const { className, style, ...restProps } = props;
    const mergedCls = classNames('vc-icon-close', className);

    return (
        <IconBase className={mergedCls} style={style} {...restProps}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9628" width="1em" height="1em" fill="currentColor">
                <path d="M579.88 512l190-190A48 48 0 0 0 702 254l-190 190-190-190a48 48 0 0 0-68 68l190 190-190 190a48 48 0 1 0 68 68l190-190 190 190a48 48 0 0 0 68-68z" p-id="9629"></path>
            </svg>
        </IconBase>
    );
};

export default CloseIcon;
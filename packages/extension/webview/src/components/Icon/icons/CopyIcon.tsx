
import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const CopyIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-copy', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="7861" width="1em" height="1em" fill='currentColor'>
                <path d="M253.8 895l65 65h513l65-65V419.6L664.3 190.5H318.9l-65 65V895z m578 0h-513V255.5h321.5L831.8 447v448zM537.6 64l65 61.6H188.8v707.9l-61.6-65V125.6L188.8 64h348.8z" p-id="7862"></path>
            </svg>
        </IconBase>
    );
};

export default CopyIcon;
import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../../IconBase';

const VueIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;

    const mergedCls = classNames('vc-icon-vue', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g id="vue">
                    <g id="Group">
                        <path id="Vector" d="M8 6.43898L6.34444 3.83333H3.8138L8 10.7917L12.1895 3.83333H9.65556L8 6.43898Z" fill="#3965BD" />
                        <path id="Vector_2" d="M8 12.1667L13 3.83333H11.3333L8 9.24999L4.66667 3.83333H3L8 12.1667Z" fill="#2ECC71" />
                    </g>
                </g>
            </svg>
        </IconBase>
    );
};

export default VueIcon;

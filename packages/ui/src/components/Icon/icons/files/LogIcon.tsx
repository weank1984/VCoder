import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../../IconBase';

const LogIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    
    const mergedCls = classNames('vc-icon-log', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em">
                <path d="M13.921 16.802H7.198v-1.92h6.723m2.881-1.922H7.198v-1.92h9.604m0-1.922H7.198v-1.92h9.604m1.921-3.842H5.277c-1.066 0-1.92.855-1.92 1.92v13.447a1.92 1.92 0 0 0 1.92 1.92h13.446a1.92 1.92 0 0 0 1.921-1.92V5.277a1.92 1.92 0 0 0-1.92-1.921z" fill="#afb42b"/>
            </svg>
        </IconBase>
    );
};

export default LogIcon;

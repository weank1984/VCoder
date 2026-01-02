import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const LogOutIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-log-out', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5117" width="1em" height="1em" fill="currentColor">
                <path d="M213.333333 938.666667a42.666667 42.666667 0 0 1-42.666666-42.666667V128a42.666667 42.666667 0 0 1 42.666666-42.666667h597.333334a42.666667 42.666667 0 0 1 42.666666 42.666667v128h-85.333333V170.666667H256v682.666666h512v-85.333333h85.333333v128a42.666667 42.666667 0 0 1-42.666666 42.666667H213.333333z m554.666667-256v-128h-298.666667v-85.333334h298.666667V341.333333l213.333333 170.666667-213.333333 170.666667z" p-id="5118"></path>
            </svg>
        </IconBase>
    );
};

export default LogOutIcon;
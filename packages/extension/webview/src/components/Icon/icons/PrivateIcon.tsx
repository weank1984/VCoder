import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const PrivateIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-private', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="7207" width="1em" height="1em" fill='currentColor'>
                <path d="M256 426.67V256C256 114.62 370.62 0 512 0s256 114.62 256 256h-85.33c0-94.26-76.41-170.67-170.67-170.67S341.33 161.74 341.33 256v170.67h512c47.13 0 85.33 38.21 85.33 85.33v426.67c0 47.13-38.21 85.33-85.33 85.33H170.67c-47.13 0-85.33-38.21-85.33-85.33V512c0-47.13 38.21-85.33 85.33-85.33H256zM512 768c47.12 1.07 86.17-36.27 87.24-83.38 1.07-47.12-36.27-86.17-83.38-87.24-1.27-0.03-2.54-0.03-3.81 0-47.12 1.04-84.47 40.08-83.43 87.2 1 45.63 37.75 82.39 83.38 83.42z m170.67-512H768v170.67h-85.33V256z" p-id="7208"></path>
            </svg>
        </IconBase>
    );
};

export default PrivateIcon;
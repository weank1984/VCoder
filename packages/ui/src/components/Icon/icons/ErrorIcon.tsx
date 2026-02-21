import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const ErrorIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-error', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="14730" width="1em" height="1em">
                <path d="M469.333333 640h85.333334v85.333333h-85.333334z m0-341.333333h85.333334v256h-85.333334z m42.453334-213.333334C276.053333 85.333333 85.333333 276.266667 85.333333 512s190.72 426.666667 426.453334 426.666667S938.666667 747.733333 938.666667 512 747.52 85.333333 511.786667 85.333333zM512 853.333333c-188.586667 0-341.333333-152.746667-341.333333-341.333333S323.413333 170.666667 512 170.666667s341.333333 152.746667 341.333333 341.333333-152.746667 341.333333-341.333333 341.333333z" p-id="14731" fill="#f8543f"></path>
            </svg>
        </IconBase>
    );
};

export default ErrorIcon;
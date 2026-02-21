import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const AcceptedIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-accepted', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="11971" width="1em" height="1em">
                <path d="M766.293333 371.712l-286.592 286.634667a32 32 0 0 1-45.269333 0L298.666667 522.581333a64 64 0 0 1 90.496 0l67.882666 67.84 218.752-218.709333a64 64 0 0 1 90.496 0z" fill="#26BD4B" p-id="11972"></path><path d="M512 874.666667a362.666667 362.666667 0 1 1 0-725.333334 362.666667 362.666667 0 0 1 0 725.333334z m0 64c235.648 0 426.666667-191.018667 426.666667-426.666667S747.648 85.333333 512 85.333333 85.333333 276.352 85.333333 512s191.018667 426.666667 426.666667 426.666667z" fill="#26BD4B" p-id="11973"></path>
            </svg>
        </IconBase>
    );
};

export default AcceptedIcon;
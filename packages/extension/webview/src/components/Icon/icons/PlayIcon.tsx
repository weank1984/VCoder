import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const PlayIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-play', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2996" width="1em" height="1em" fill='currentColor'>
                <path d="M512 74.667C276.355 74.667 74.667 276.355 74.667 512s201.689 437.333 437.333 437.333S949.333 747.645 949.333 512s-201.689-437.333-437.333-437.333S74.667 276.355 74.667 512z m0 64c-216.981 0-393.333 176.352-393.333 393.333S295.019 928 512 928s393.333-176.352 393.333-393.333S728.981 295.019 512 295.019 118.69 0 215.36-96.006 215.36-214.69S630.69 181.687 512 181.687z m56.464-109.12l-169.285 169.285a32 32 0 1 0 45.257 45.256L613.254 477.501a32 32 0 1 0-45.257-45.256L345.694 310.081a32 32 0 0 0-45.257-45.256L568.464 427.547l-169.285 169.285a32 32 0 1 0-45.257-45.256zM642.82 427.648l-217.081 217.081a32 32 0 1 0 45.255 45.255l217.081-217.081a32 32 0 1 0-45.255-45.255z" p-id="2997"></path>
            </svg>
        </IconBase>
    );
};

export default PlayIcon;
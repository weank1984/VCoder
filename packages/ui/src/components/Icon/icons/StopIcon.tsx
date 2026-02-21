import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const StopIcon: React.FC<IconProps> = (props) => {
    const {className, style} = props;
    
    const mergedCls = classNames('vc-icon-stop', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8267" width="1em" height="1em" fill="currentColor">
                <path d="M512 0a512 512 0 1 0 0 1024A512 512 0 0 0 512 0z m0 928a416 416 0 1 1 0-832 416 416 0 0 1 0 832zM320 320h384v384H320z" p-id="8268"></path>
            </svg>
        </IconBase>
    );
};

export default StopIcon;
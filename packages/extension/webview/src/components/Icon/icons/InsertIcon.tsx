import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const InsertIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-insert', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8838" width="1em" height="1em" fill='currentColor'>
                <path d="M385.466 64l-64.977 61.557v256.489l64.977 64.977h512.977L960 382.046V125.557L898.443 64H385.466z m512.977 318.046H385.466V125.557h512.977v256.489zM385.466 576.977l-64.977 61.557v256.489L385.466 960h512.977L960 895.023V638.534l-61.557-61.557H385.466z m512.977 318.046H385.466V638.534h512.977v256.489zM108.458 364.947L255.511 512 108.458 659.053 64 614.595 166.595 512 64 409.405l44.458-44.458z" p-id="8839"></path>
            </svg>
        </IconBase>
    );
};

export default InsertIcon;
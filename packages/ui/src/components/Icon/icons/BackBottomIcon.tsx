import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const BackBottomIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-back-btoom', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9278" width="1em" height="1em" fill="currentColor">
                <path d="M170.688 853.248h682.624v-85.312H170.688v85.312zM512 700.288l295.04-295.04-60.352-60.352-192 192V128H469.312v408.96l-192-192-60.288 60.352L512 700.288z" p-id="9279"></path>
            </svg>
        </IconBase>
    );
};

export default BackBottomIcon;
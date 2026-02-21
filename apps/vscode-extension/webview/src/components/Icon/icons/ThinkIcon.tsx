import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const ThinkIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-think', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor">
                <path d="M9 21h6v-1H9v1zm3-20C7.49 1 4 4.49 4 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h8c.55 0 1-.45 1-1v-2.26C18.81 13.47 20 11.38 20 9c0-4.51-3.49-8-8-8zm3 12.85L15 14v2H9v-2l-.01-.15C7.26 12.81 6 11.04 6 9c0-3.31 2.69-6 6-6s6 2.69 6 6c0 2.04-1.26 3.81-3 4.85z" />
            </svg>
        </IconBase>
    );
};

export default ThinkIcon;

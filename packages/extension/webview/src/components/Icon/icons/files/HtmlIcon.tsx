import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../../IconBase';

const HtmlIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    
    const mergedCls = classNames('vc-icon-html', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em">
                <path d="m12 17.56 4.07-1.13.55-6.1H9.38L9.2 8.3h7.6l.2-1.99H7l.56 6.01h6.89l-.23 2.58-2.22.6-2.22-.6-.14-1.66h-2l.29 3.19L12 17.56M4.07 3h15.86L18.5 19.2 12 21l-6.5-1.8L4.07 3z" fill="#e44d26"/>
            </svg>
        </IconBase>
    );
};

export default HtmlIcon;

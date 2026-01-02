import React from 'react';
import classnames from 'classnames'
import './index.scss';

export interface IconProps extends React.HTMLAttributes<HTMLElement> {
    className?: string;
    style?: React.CSSProperties;
};

interface IconBaseProps extends IconProps {
    children: React.ReactNode 
}

const prefixClass = 'vc-icon';

const IconBase: React.FC<IconBaseProps> = (props) => {
    const {className, style, children, ...restProps} = props;

    const mergedCls = classnames(prefixClass, className);

    return (
        <span className={mergedCls} style={style} {...restProps}>
            {children}
        </span>
    );
};

export default IconBase;

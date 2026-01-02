import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const InfoIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-info', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg  viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="4494" width="1em" height="1em" fill="currentColor">
                <path d="M512.001 928.997c230.524 0 418.076-187.552 418.075-418.077 0-230.527-187.552-418.077-418.075-418.077s-418.077 187.55-418.077 418.077c0 230.525 187.552 418.077 418.077 418.077zM512 301.88c28.86 0 52.26 23.399 52.26 52.263 0 28.858-23.399 52.257-52.26 52.257s-52.26-23.399-52.26-52.257c0-28.863 23.399-52.263 52.26-52.263zM459.74 510.922c0-28.86 23.399-52.26 52.26-52.26s52.26 23.399 52.26 52.26l0 156.775c0 28.86-23.399 52.26-52.26 52.26s-52.26-23.399-52.26-52.26l0-156.775z" p-id="4495"></path>
            </svg>
        </IconBase>
    );
};

export default InfoIcon;
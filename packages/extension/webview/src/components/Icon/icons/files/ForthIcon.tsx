import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../../IconBase';

const ForthIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    
    const mergedCls = classNames('vc-icon-forth', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 67.733 67.733" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em">
                <path d="M10.321 12.006c-.21 0-.38.173-.38.39v12.63c0 .215.17.389.38.389h16.925c.21 0 .38-.174.38-.39v-12.63c0-.215-.17-.389-.38-.389zm30.167 0c-.21 0-.38.173-.38.39v12.63c0 .215.17.389.38.389h16.925c.21 0 .38-.174.38-.39v-12.63c0-.215-.17-.389-.38-.389zM10.321 34.328c-.21 0-.38.173-.38.39v12.63c0 .215.17.389.38.389h16.925c.21 0 .38-.174.38-.39v-12.63c0-.215-.17-.389-.38-.389zm30.167 0c-.21 0-.38.173-.38.39v12.63c0 .215.17.389.38.389h4.053v4.351H40.51a.374.374 0 0 0-.375.375v2.89c0 .207.167.374.375.374h8.303a.373.373 0 0 0 .374-.374v-4.135h3.798a.374.374 0 0 0 .374-.375v-3.106h4.054c.21 0 .38-.174.38-.39v-12.63c0-.215-.17-.389-.38-.389z" fill="#ef5350"/>
            </svg>
        </IconBase>
    );
};

export default ForthIcon;

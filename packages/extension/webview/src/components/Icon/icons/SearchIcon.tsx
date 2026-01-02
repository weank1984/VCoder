import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const SearchIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-search', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="4462" width="1em" height="1em" fill="currentColor">
                <path d="M1012.7872 958.5152l-296.448-296.448a404.48 404.48 0 1 0-54.272 54.272l296.448 296.448a38.4 38.4 0 0 0 54.272-54.272zM404.48 732.16a327.68 327.68 0 1 1 327.68-327.68 327.68 327.68 0 0 1-327.68 327.68z" p-id="4463"></path>
            </svg>
        </IconBase>
    );
};

export default SearchIcon;
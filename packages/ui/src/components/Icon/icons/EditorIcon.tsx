import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const EditorIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-editor', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="18351" width="1em" height="1em" fill='currentColor'>
                <path d="M486.4 537.6c14.336 14.336 36.864 14.336 50.688 0l342.528-342.528c14.336-14.336 14.336-36.864 0-51.2s-36.864-14.336-51.2 0L486.4 486.4c-14.336 14.336-14.336 36.864 0 51.2" p-id="18352"></path><path d="M869.376 476.16c-19.456 0-38.912 15.872-38.912 35.84v318.464H193.536V193.024H512c19.456 0 36.352-22.016 36.352-41.984s-15.872-36.352-36.352-36.352H187.392c-39.936 0-72.192 32.256-72.192 72.192v649.728c0 39.936 32.256 72.192 72.192 72.192h649.728c39.936 0 72.192-32.256 72.192-72.192V512c0-19.456-13.312-35.328-36.352-36.352-2.048 0.512-3.584 0.512-3.584 0.512z" p-id="18353"></path>
            </svg>
        </IconBase>
    );
};

export default EditorIcon;
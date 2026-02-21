import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const EditIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-edit', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5199" width="1em" height="1em" fill='currentColor'>
                <path d="M853.333333 874.666667H170.666667c-23.466667 0-42.666667-19.2-42.666667-42.666667s19.2-42.666667 42.666667-42.666667h682.666666c23.466667 0 42.666667 19.2 42.666667 42.666667s-19.2 42.666667-42.666667 42.666667zM192 746.666667c-12.8 0-23.466667-4.266667-32-14.933334-10.666667-8.533333-12.8-23.466667-10.666667-36.266666l38.4-157.866667c2.133333-8.533333 6.4-14.933333 10.666667-21.333333L614.4 100.266667c17.066667-17.066667 42.666667-17.066667 59.733333 0l121.6 121.6c17.066667 17.066667 17.066667 42.666667 0 59.733333L379.733333 716.8c-6.4 6.4-17.066667 12.8-25.6 12.8l-157.866666 17.066667H192z m157.866667-57.6z m-83.2-121.6l-21.333334 87.466666 83.2-8.533333L704 251.733333 644.266667 192 266.666667 567.466667z" p-id="5200"></path>
            </svg>
        </IconBase>
    );
};

export default EditIcon;
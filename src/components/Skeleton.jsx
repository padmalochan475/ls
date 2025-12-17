import React from 'react';

const Skeleton = ({ width, height, borderRadius = '8px', style, className }) => {
    return (
        <div
            className={`skeleton-loader ${className || ''}`}
            style={{
                width: width || '100%',
                height: height || '20px',
                borderRadius: borderRadius,
                ...style
            }}
        />
    );
};

export default Skeleton;

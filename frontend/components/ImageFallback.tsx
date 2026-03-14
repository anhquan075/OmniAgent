import React from 'react';

/**
 * Fallback Image component for Vite migration
 * Replaces next/image with standard img tag
 */
const Image = ({ src, alt, width, height, className, priority, ...props }: any) => {
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      {...props}
    />
  );
};

export default Image;

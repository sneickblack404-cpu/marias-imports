import React from 'react';

export default function NubiaLogo({ size = 'md', className = '', isDark = false, showText = true }) {
  const isSm = size === 'sm';
  const isLg = size === 'lg';

  const imgDimension = isSm ? 'h-9 w-9' : isLg ? 'h-28 w-28' : 'h-11 w-11';
  const logoSrc = '/logo-marias-imports.png';

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      <img
        src={logoSrc}
        alt="Maria's Imports"
        className={`${imgDimension} rounded-full object-contain shadow-xs transition-all duration-200 hover:scale-105 shrink-0`}
      />
      {!isLg && showText && (
        <div className="flex flex-col">
          <span className="font-bold text-sm tracking-wide text-app-text font-serif">
            Maria's Imports
          </span>
          <span className="text-[10px] text-app-muted tracking-wider uppercase font-medium">
            Gestão Comercial
          </span>
        </div>
      )}
    </div>
  );
}

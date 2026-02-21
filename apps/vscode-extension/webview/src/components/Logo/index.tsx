import { useEffect, useMemo, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';
import VoyahLogo from '../../assets/images/VoyahLogo.svg';
import VoyahLogoLight from '../../assets/images/VoyahLogoLight.svg';
import './index.scss';

type ThemeMode = 'light' | 'dark';

function detectTheme(): ThemeMode {
  const body = document.body;
  if (body.classList.contains('vscode-light') || body.classList.contains('vscode-high-contrast-light')) {
    return 'light';
  }
  return 'dark';
}

export function Logo(props: { size?: number } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height'>) {
  const { size = 96, className, alt = 'VCoder Logo', ...rest } = props;
  const [theme, setTheme] = useState<ThemeMode>(() => detectTheme());

  useEffect(() => {
    const body = document.body;
    const observer = new MutationObserver(() => setTheme(detectTheme()));
    observer.observe(body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const src = useMemo(() => (theme === 'light' ? VoyahLogo : VoyahLogoLight), [theme]);

  return (
    <img
      className={['vc-logo', className].filter(Boolean).join(' ')}
      src={src}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      {...rest}
    />
  );
}

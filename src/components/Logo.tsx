// CONSISTO logo.
// Shows the user-uploaded logo from /public/logo/logo1.(png|svg|webp|jpg|jpeg) when present,
// otherwise falls back to the built-in vector mark (so the UI never shows a broken image).
import { useEffect, useId, useState } from 'react';
import { cn } from '../lib/utils';

const CANDIDATES = [
  'logo/logo1.png',
  'logo/logo1.svg',
  'logo/logo1.webp',
  'logo/logo1.jpg',
  'logo/logo1.jpeg',
  'logo/LOGO1.png',
  'logo/LOGO1.PNG',
  'logo/LOGO1.jpg',
];

let resolved: string | null | undefined; // undefined = not probed yet, null = no file found
let probing: Promise<string | null> | null = null;

function tryLoad(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

export function probeLogo(): Promise<string | null> {
  if (resolved !== undefined) return Promise.resolve(resolved);
  if (!probing) {
    probing = (async () => {
      for (const c of CANDIDATES) {
        const url = new URL(c, document.baseURI).href;
        if (await tryLoad(url)) {
          resolved = url;
          return url;
        }
      }
      resolved = null;
      return null;
    })();
  }
  return probing;
}

export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null | undefined>(resolved);
  useEffect(() => {
    let alive = true;
    if (resolved === undefined) void probeLogo().then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, []);
  if (src) {
    return (
      <img
        src={src}
        width={size}
        height={size}
        alt="Consisto logo"
        draggable={false}
        className={cn('shrink-0 rounded-[24%] object-contain', className)}
        style={{ width: size, height: size }}
        onError={() => setSrc(null)}
      />
    );
  }
  return <LogoMark size={size} className={className} />;
}

/** Built-in vector version of the CONSISTO mark (C + check + orbit + spark). */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (s: string) => `${s}${raw}`;
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={cn('shrink-0', className)} role="img" aria-label="Consisto logo">
      <defs>
        <linearGradient id={id('bg')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1c1036" />
          <stop offset="1" stopColor="#07040f" />
        </linearGradient>
        <linearGradient id={id('bd')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset=".5" stopColor="#c084fc" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
        <linearGradient id={id('c')} x1=".25" y1="0" x2=".55" y2="1">
          <stop offset="0" stopColor="#f5ecff" />
          <stop offset=".55" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
        <linearGradient id={id('o')} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset=".65" stopColor="#e879f9" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
        <radialGradient id={id('g')} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#8b5cf6" stopOpacity=".5" />
          <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill={`url(#${id('bg')})`} />
      <rect x="9" y="9" width="494" height="494" rx="104" fill="none" stroke={`url(#${id('bd')})`} strokeWidth="8" />
      <circle cx="250" cy="268" r="190" fill={`url(#${id('g')})`} />
      <path d="M364.9 171.6A150 150 0 1 0 364.9 364.4L323.5 329.7A96 96 0 1 1 323.5 206.3Z" fill={`url(#${id('c')})`} />
      <path d="M208 268l32 32 56-62" stroke="#f5f3ff" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <ellipse cx="256" cy="292" rx="205" ry="56" transform="rotate(-22 256 292)" fill="none" stroke={`url(#${id('o')})`} strokeWidth="11" />
      <path d="M408 112Q412 140 440 144Q412 148 408 176Q404 148 376 144Q404 140 408 112Z" fill="#fff" />
    </svg>
  );
}

import { siBySlug, customSvgToDataUrl } from '../lib/icons';

interface Props {
  value: string | null | undefined;
  size?: number;
  className?: string;
}

export default function IconRenderer({ value, size = 20, className = '' }: Props) {
  if (!value) {
    return <span className={className} style={{ fontSize: size, lineHeight: 1 }}>📁</span>;
  }

  if (value.startsWith('svg:')) {
    return (
      <span className={className} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <img
          src={customSvgToDataUrl(value)}
          width={size}
          height={size}
          alt=""
          style={{ objectFit: 'contain', width: size, height: size }}
        />
      </span>
    );
  }

  if (value.startsWith('si:')) {
    const icon = siBySlug.get(value.slice(3));
    if (!icon) return <span className={className}>?</span>;
    return (
      <span className={className} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <svg
          role="img"
          aria-label={icon.title}
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill={`#${icon.hex}`}
        >
          <path d={icon.path} />
        </svg>
      </span>
    );
  }

  return (
    <span className={className} style={{ fontSize: size, lineHeight: 1 }}>
      {value}
    </span>
  );
}

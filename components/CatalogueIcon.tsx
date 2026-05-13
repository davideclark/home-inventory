import React, { useMemo } from 'react';
import { Text } from 'react-native';
import { Svg, Path } from 'react-native-svg';
import { SvgXml } from 'react-native-svg';
import * as allSi from 'simple-icons';
import type { SimpleIcon } from 'simple-icons';

// Build slug → icon map once at module load
const siBySlug = new Map<string, SimpleIcon>();
for (const v of Object.values(allSi)) {
  if (typeof v === 'object' && v !== null && 'slug' in v && 'path' in v && 'hex' in v) {
    siBySlug.set((v as SimpleIcon).slug, v as SimpleIcon);
  }
}

type Props = {
  value: string | null | undefined;
  size?: number;
};

export default function CatalogueIcon({ value, size = 20 }: Props) {
  const content = useMemo(() => {
    if (!value) return null;

    if (value.startsWith('si:')) {
      const icon = siBySlug.get(value.slice(3));
      if (!icon) return null;
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={`#${icon.hex}`}>
          <Path d={icon.path} />
        </Svg>
      );
    }

    if (value.startsWith('svg:')) {
      const xml = atob(value.slice(4));
      return <SvgXml xml={xml} width={size} height={size} />;
    }

    // Emoji
    return <Text style={{ fontSize: size * 0.85, lineHeight: size }}>{value}</Text>;
  }, [value, size]);

  return content;
}

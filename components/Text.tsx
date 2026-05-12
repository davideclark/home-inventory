import { Text as RNText, TextInput as RNTextInput, TextProps, TextInputProps, StyleSheet } from 'react-native';

const WEIGHT_MAP: Record<string, string> = {
  '400':    'Manrope_400Regular',
  'normal': 'Manrope_400Regular',
  '500':    'Manrope_500Medium',
  '600':    'Manrope_600SemiBold',
  '700':    'Manrope_700Bold',
  'bold':   'Manrope_700Bold',
};

function fontForStyle(style: TextProps['style']): string {
  const flat = StyleSheet.flatten(style);
  return WEIGHT_MAP[String(flat?.fontWeight ?? '400')] ?? 'Manrope_400Regular';
}

export function Text({ style, ...props }: TextProps) {
  return <RNText style={[{ fontFamily: fontForStyle(style) }, style]} {...props} />;
}

export function TextInput({ style, ...props }: TextInputProps) {
  return <RNTextInput style={[{ fontFamily: 'Manrope_400Regular' }, style]} {...props} />;
}

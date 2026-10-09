import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, space, TOUCH } from '@/lib/theme';

export function Screen({ children, scroll = true, style }: { children: ReactNode; scroll?: boolean; style?: ViewStyle }) {
  return (
    <SafeAreaView style={[styles.screen, style]} edges={['bottom', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.scroll, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function H1({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return (
    <Text accessibilityRole="header" style={[styles.h1, style]} maxFontSizeMultiplier={1.6}>
      {children}
    </Text>
  );
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: TextStyle }) {
  return <Text style={[styles.body, muted && { color: colors.inkMuted }, style]}>{children}</Text>;
}

type Variant = 'primary' | 'emergency' | 'outline' | 'safe' | 'ghost' | 'whatsapp';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  accessibilityHint,
  testID,
  large,
}: {
  title: string;
  onPress?: PressableProps['onPress'];
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityHint?: string;
  testID?: string;
  large?: boolean;
}) {
  const bg = { primary: colors.primary, emergency: colors.emergency, outline: colors.surface, safe: colors.safe, ghost: 'transparent', whatsapp: colors.whatsapp }[variant];
  const fg = variant === 'outline' || variant === 'ghost' ? colors.ink : '#fff';
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        large && { minHeight: 64 },
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'outline' && { borderWidth: 1.5, borderColor: colors.line },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={22} color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }, large && { fontSize: 18 }]} maxFontSizeMultiplier={1.4}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Field({ label, error, hint, ...props }: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={{ gap: space(1.5) }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.inkMuted}
        style={[styles.input, props.multiline && { minHeight: 110, textAlignVertical: 'top' }, error ? { borderColor: colors.emergency } : null]}
        {...props}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Card({ children, style, tone }: { children: ReactNode; style?: ViewStyle; tone?: 'danger' | 'safe' | 'caution' }) {
  const toneStyle = tone === 'danger' ? { borderColor: colors.emergency, backgroundColor: colors.emergencySoft } : tone === 'safe' ? { borderColor: colors.safe, backgroundColor: colors.safeSoft } : tone === 'caution' ? { borderColor: colors.caution, backgroundColor: colors.cautionSoft } : null;
  return <View style={[styles.card, toneStyle, style]}>{children}</View>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Body muted>{label}</Body>
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={40} color={colors.emergency} />
      <Body style={{ textAlign: 'center' }}>{message}</Body>
      {onRetry ? <Button title="Try again" variant="outline" onPress={onRetry} /> : null}
    </View>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.center}>
      <Ionicons name="file-tray-outline" size={36} color={colors.inkMuted} />
      <Text style={styles.label}>{title}</Text>
      {body ? <Body muted style={{ textAlign: 'center' }}>{body}</Body> : null}
    </View>
  );
}

export function InlineError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {message}
    </Text>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: space(5), gap: space(4) },
  h1: { fontSize: 26, fontWeight: '800', color: colors.ink },
  body: { fontSize: 16, lineHeight: 23, color: colors.ink },
  label: { fontSize: 15, fontWeight: '700', color: colors.ink },
  hint: { fontSize: 13, color: colors.inkMuted },
  error: { fontSize: 14, fontWeight: '600', color: colors.emergency },
  input: {
    minHeight: TOUCH,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space(4),
    fontSize: 17,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  button: {
    minHeight: TOUCH + 4,
    borderRadius: radius.md,
    paddingHorizontal: space(5),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
  },
  buttonText: { fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space(4), gap: space(2), borderWidth: 1, borderColor: colors.line },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space(3), padding: space(8) },
});

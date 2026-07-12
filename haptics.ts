import * as Haptics from 'expo-haptics';

// Fire-and-forget wrappers — haptics must never block or throw into UI code.
// No-ops on devices without haptic hardware (and in the iOS Simulator).

export function hapticLight(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function hapticMedium(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function hapticSuccess(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function hapticError(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}

export function hapticSelect(): void {
  Haptics.selectionAsync().catch(() => {});
}

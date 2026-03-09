import React, { useEffect } from "react";
import {
  View,
  StyleSheet,
  type ViewStyle,
  type StyleProp,
  type DimensionValue,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from "react-native-reanimated";

import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";

interface SkeletonLoaderProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonLoader({
  width = "100%",
  height = 20,
  borderRadius = BorderRadius.xs,
  style,
}: SkeletonLoaderProps) {
  const { theme } = useTheme();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1200 }), -1, false);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.7, 0.3]),
  }));

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          backgroundColor: theme.backgroundSecondary,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function ProductCardSkeleton() {
  const { theme } = useTheme();

  return (
    <View
      style={[styles.productCard, { backgroundColor: theme.backgroundDefault }]}
    >
      <SkeletonLoader height={150} borderRadius={0} />
      <View style={styles.productContent}>
        <SkeletonLoader
          width={60}
          height={10}
          style={{ marginBottom: Spacing.sm }}
        />
        <SkeletonLoader
          width="80%"
          height={16}
          style={{ marginBottom: Spacing.sm }}
        />
        <SkeletonLoader width={50} height={20} />
      </View>
    </View>
  );
}

export function TutorialStepSkeleton() {
  const { theme } = useTheme();

  return (
    <View
      style={[styles.stepCard, { backgroundColor: theme.backgroundDefault }]}
    >
      <SkeletonLoader width={28} height={28} borderRadius={14} />
      <View style={styles.stepContent}>
        <SkeletonLoader
          width="90%"
          height={14}
          style={{ marginBottom: Spacing.xs }}
        />
        <SkeletonLoader width="60%" height={14} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {},
  productCard: {
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  productContent: {
    padding: Spacing.md,
  },
  stepCard: {
    flexDirection: "row",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    gap: Spacing.md,
    alignItems: "flex-start",
  },
  stepContent: {
    flex: 1,
  },
});

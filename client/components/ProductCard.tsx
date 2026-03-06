import React from "react";
import { View, StyleSheet, Pressable, Image } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import type { DetectedProduct } from "@shared/schema";

interface ProductCardProps {
  product: DetectedProduct;
  onPress?: () => void;
  compact?: boolean;
  testID?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ProductCard({ product, onPress, compact = false, testID }: ProductCardProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.98, { damping: 15 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  const displayName = product.matchedProductName || product.aiDetectedName;
  const displayBrand = product.matchedProductBrand || "";
  const displayImage = product.matchedProductImage;
  const displayPrice = product.matchedProductPrice;

  if (compact) {
    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        testID={testID}
        style={[
          styles.compactCard,
          { backgroundColor: theme.backgroundDefault },
          animatedStyle,
        ]}
      >
        {displayImage ? (
          <Image source={{ uri: displayImage }} style={styles.compactImage} />
        ) : (
          <View style={[styles.compactImagePlaceholder, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather name="package" size={20} color={theme.textSecondary} />
          </View>
        )}
        <View style={styles.compactContent}>
          <ThemedText type="small" numberOfLines={2} style={styles.compactName}>
            {displayName}
          </ThemedText>
          {displayBrand ? (
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              {displayBrand}
            </ThemedText>
          ) : null}
        </View>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      testID={testID}
      style={[
        styles.card,
        { backgroundColor: theme.backgroundDefault },
        animatedStyle,
      ]}
    >
      {displayImage ? (
        <Image source={{ uri: displayImage }} style={styles.image} />
      ) : (
        <View style={[styles.imagePlaceholder, { backgroundColor: theme.backgroundSecondary }]}>
          <Feather name="package" size={32} color={theme.textSecondary} />
        </View>
      )}
      <View style={styles.content}>
        {displayBrand ? (
          <ThemedText type="caption" style={{ color: theme.textSecondary, marginBottom: Spacing.xs }}>
            {displayBrand.toUpperCase()}
          </ThemedText>
        ) : null}
        <ThemedText type="body" numberOfLines={2} style={styles.name}>
          {displayName}
        </ThemedText>
        <View style={styles.footer}>
          {displayPrice ? (
            <ThemedText type="h3" style={{ color: theme.primary }}>
              ${displayPrice}
            </ThemedText>
          ) : null}
          {product.recommendedShade ? (
            <View style={[styles.shadeBadge, { backgroundColor: theme.primary + "20" }]}>
              <ThemedText type="caption" style={{ color: theme.primary }}>
                {product.recommendedShade}
              </ThemedText>
            </View>
          ) : null}
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    aspectRatio: 1,
    resizeMode: "cover",
  },
  imagePlaceholder: {
    width: "100%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: Spacing.md,
  },
  name: {
    fontWeight: "500",
    marginBottom: Spacing.sm,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shadeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  compactCard: {
    flexDirection: "row",
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    gap: Spacing.md,
  },
  compactImage: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.xs,
    resizeMode: "cover",
  },
  compactImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  compactContent: {
    flex: 1,
    justifyContent: "center",
  },
  compactName: {
    fontWeight: "500",
    marginBottom: Spacing.xs,
  },
});

import React, { useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  Pressable,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { apiRequest } from "@/lib/query-client";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { DetectedProduct, ProductColor } from "@shared/schema";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ProductDetailRouteProp = RouteProp<RootStackParamList, "ProductDetail">;

export default function ProductDetailScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ProductDetailRouteProp>();
  const { theme } = useTheme();
  const { product } = route.params;

  const displayName = product.matchedProductName || product.aiDetectedName;
  const displayBrand = product.matchedProductBrand || "";
  const displayImage = product.matchedProductImage;
  const displayPrice = product.matchedProductPrice;
  const colors = product.matchedProductColors || [];

  const handleAddToList = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert("Added!", "Product added to your shopping list.");
  }, []);

  const handleNavigateToSelfie = useCallback(() => {
    navigation.navigate("SelfieCapture");
  }, [navigation]);

  const submitFeedback = useCallback(
    async (feedbackType: string) => {
      await apiRequest("POST", "/api/feedback", {
        videoAnalysisId: product.videoAnalysisId,
        detectedProductId: product.id,
        feedbackType,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Thanks", "Your feedback has been recorded.");
    },
    [product.id, product.videoAnalysisId],
  );

  const handleReportIssue = useCallback(() => {
    Alert.alert("Report Issue", "What is wrong with this result?", [
      {
        text: "Wrong Product",
        onPress: () => {
          void submitFeedback("wrong_product");
        },
      },
      {
        text: "Wrong Shade",
        onPress: () => {
          void submitFeedback("wrong_shade");
        },
      },
      {
        text: "Cancel",
        style: "cancel",
      },
    ]);
  }, [submitFeedback]);

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing["5xl"],
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(0).duration(400)}>
          {displayImage ? (
            <Image source={{ uri: displayImage }} style={styles.heroImage} />
          ) : (
            <View
              style={[
                styles.heroImagePlaceholder,
                { backgroundColor: theme.backgroundSecondary },
              ]}
            >
              <Feather name="package" size={64} color={theme.textSecondary} />
            </View>
          )}
        </Animated.View>

        <View style={styles.content}>
          <Animated.View entering={FadeInDown.delay(100).duration(400)}>
            {displayBrand ? (
              <ThemedText
                type="caption"
                style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}
              >
                {displayBrand.toUpperCase()}
              </ThemedText>
            ) : null}
            <ThemedText type="h1" style={styles.productName}>
              {displayName}
            </ThemedText>
            {displayPrice ? (
              <View
                style={[
                  styles.priceBadge,
                  { backgroundColor: theme.primary + "15" },
                ]}
              >
                <ThemedText type="h2" style={{ color: theme.primary }}>
                  ${displayPrice}
                </ThemedText>
              </View>
            ) : null}
          </Animated.View>

          {product.recommendedShade ? (
            <Animated.View entering={FadeInDown.delay(200).duration(400)}>
              <View
                style={[
                  styles.section,
                  { backgroundColor: theme.backgroundDefault },
                ]}
              >
                <View style={styles.sectionHeader}>
                  <Feather
                    name="check-circle"
                    size={20}
                    color={theme.success}
                  />
                  <ThemedText type="h3">Recommended Shade</ThemedText>
                </View>
                <View style={styles.shadeContainer}>
                  <View
                    style={[
                      styles.shadeSwatch,
                      { backgroundColor: theme.primary },
                    ]}
                  />
                  <ThemedText type="body" style={styles.shadeName}>
                    {product.recommendedShade}
                  </ThemedText>
                </View>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Based on your skin tone profile
                </ThemedText>
              </View>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.delay(200).duration(400)}>
              <Pressable
                onPress={handleNavigateToSelfie}
                style={[
                  styles.section,
                  { backgroundColor: theme.backgroundDefault },
                ]}
              >
                <View style={styles.sectionHeader}>
                  <Feather name="camera" size={20} color={theme.primary} />
                  <ThemedText type="h3">Get Shade Match</ThemedText>
                </View>
                <ThemedText type="body" style={{ color: theme.textSecondary }}>
                  Upload a selfie to get your perfect shade recommendation
                </ThemedText>
                <View style={styles.uploadPrompt}>
                  <ThemedText type="link">Add Selfie</ThemedText>
                  <Feather name="chevron-right" size={16} color={theme.link} />
                </View>
              </Pressable>
            </Animated.View>
          )}

          {colors.length > 0 ? (
            <Animated.View entering={FadeInDown.delay(300).duration(400)}>
              <View
                style={[
                  styles.section,
                  { backgroundColor: theme.backgroundDefault },
                ]}
              >
                <ThemedText type="h3" style={{ marginBottom: Spacing.lg }}>
                  Available Shades
                </ThemedText>
                <View style={styles.colorsGrid}>
                  {colors.slice(0, 12).map((color, index) => (
                    <View key={index} style={styles.colorItem}>
                      <View
                        style={[
                          styles.colorSwatch,
                          {
                            backgroundColor:
                              color.hex_value || theme.backgroundTertiary,
                          },
                        ]}
                      />
                      <ThemedText
                        type="caption"
                        numberOfLines={1}
                        style={styles.colorName}
                      >
                        {color.colour_name}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </View>
            </Animated.View>
          ) : null}

          {product.aiDetectedDescription ? (
            <Animated.View entering={FadeInDown.delay(400).duration(400)}>
              <View
                style={[
                  styles.section,
                  { backgroundColor: theme.backgroundDefault },
                ]}
              >
                <ThemedText type="h3" style={{ marginBottom: Spacing.md }}>
                  Description
                </ThemedText>
                <ThemedText
                  type="body"
                  style={{ color: theme.textSecondary, lineHeight: 24 }}
                >
                  {product.aiDetectedDescription}
                </ThemedText>
              </View>
            </Animated.View>
          ) : null}
        </View>
      </ScrollView>

      <Animated.View
        entering={FadeInDown.delay(500).duration(400)}
        style={[
          styles.bottomBar,
          {
            paddingBottom: insets.bottom + Spacing.lg,
            backgroundColor: theme.backgroundRoot,
          },
        ]}
      >
        <View style={styles.bottomActions}>
          <Pressable
            onPress={handleReportIssue}
            style={[
              styles.reportButton,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <Feather name="flag" size={16} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Report Issue
            </ThemedText>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Button onPress={handleAddToList} testID="button-add-to-list">
              Add to Shopping List
            </Button>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  heroImage: {
    width: "100%",
    aspectRatio: 1,
    resizeMode: "cover",
  },
  heroImagePlaceholder: {
    width: "100%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing["2xl"],
  },
  productName: {
    marginBottom: Spacing.md,
  },
  priceBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing["2xl"],
  },
  section: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  shadeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  shadeSwatch: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.xs,
  },
  shadeName: {
    fontWeight: "600",
    fontSize: 18,
  },
  uploadPrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  colorsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  colorItem: {
    alignItems: "center",
    width: 60,
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginBottom: Spacing.xs,
  },
  colorName: {
    textAlign: "center",
    width: "100%",
  },
  bottomBar: {
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.1)",
  },
  bottomActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  reportButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
});

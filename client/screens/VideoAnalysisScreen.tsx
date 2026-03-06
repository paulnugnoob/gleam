import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Dimensions,
  Pressable,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { ProductCard } from "@/components/ProductCard";
import { TutorialStep } from "@/components/TutorialStep";
import { ProductCardSkeleton, TutorialStepSkeleton, SkeletonLoader } from "@/components/SkeletonLoader";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { VideoAnalysis, DetectedProduct, TutorialStep as TutorialStepType } from "@shared/schema";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type VideoAnalysisRouteProp = RouteProp<RootStackParamList, "VideoAnalysis">;

const { width } = Dimensions.get("window");
const PRODUCT_CARD_WIDTH = (width - Spacing.lg * 2 - Spacing.md) / 2;

interface AnalysisResult {
  analysis: VideoAnalysis;
  products: DetectedProduct[];
  tutorialSteps: TutorialStepType[];
}

export default function VideoAnalysisScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<VideoAnalysisRouteProp>();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const { videoUrl, analysisId } = route.params;

  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  const existingAnalysisQuery = useQuery<AnalysisResult>({
    queryKey: ["/api/video-analyses", analysisId],
    enabled: !!analysisId,
  });

  const analyzeMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest("POST", "/api/analyze-video", { videoUrl: url });
      return res.json() as Promise<AnalysisResult>;
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/video-analyses"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (error) => {
      Alert.alert("Analysis Failed", "Could not analyze the video. Please try again.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const saveLookMutation = useMutation({
    mutationFn: async () => {
      if (!analysisResult?.analysis.id) return;
      const res = await apiRequest("POST", "/api/saved-looks", {
        videoAnalysisId: analysisResult.analysis.id,
        title: analysisResult.analysis.title || "My Look",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saved-looks"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Added to Lookbook", "This look is now in your collection. You can find it on your home screen.");
      navigation.goBack();
    },
  });

  useEffect(() => {
    if (existingAnalysisQuery.data) {
      setAnalysisResult(existingAnalysisQuery.data);
    }
  }, [existingAnalysisQuery.data]);

  useEffect(() => {
    if (!analysisId && videoUrl) {
      analyzeMutation.mutate(videoUrl);
    }
  }, [videoUrl, analysisId]);

  const handleProductPress = useCallback((product: DetectedProduct) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("ProductDetail", { product });
  }, [navigation]);

  const handleSaveLook = useCallback(() => {
    saveLookMutation.mutate();
  }, [saveLookMutation]);

  const isLoading = analyzeMutation.isPending || (!!analysisId && existingAnalysisQuery.isLoading);
  const products = analysisResult?.products || [];
  const tutorialSteps = analysisResult?.tutorialSteps || analysisResult?.analysis?.tutorialSteps || [];

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: insets.bottom + Spacing["5xl"],
          paddingHorizontal: Spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.delay(0).duration(400)}>
          <View style={[styles.videoPreview, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather name="play-circle" size={48} color={theme.textSecondary} />
            <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md, textAlign: "center" }}>
              {isLoading ? "Finding your products..." : "Ready to save"}
            </ThemedText>
            {isLoading ? (
              <ThemedText type="small" style={{ color: theme.textTertiary, marginTop: Spacing.sm, textAlign: "center" }}>
                This may take a moment
              </ThemedText>
            ) : null}
          </View>
        </Animated.View>

        {isLoading ? (
          <>
            <View style={styles.loadingSection}>
              <SkeletonLoader width={180} height={24} style={{ marginBottom: Spacing.lg }} />
              <View style={styles.productsGrid}>
                <ProductCardSkeleton />
                <ProductCardSkeleton />
              </View>
            </View>
            <View style={styles.loadingSection}>
              <SkeletonLoader width={160} height={24} style={{ marginBottom: Spacing.lg }} />
              <TutorialStepSkeleton />
              <View style={{ height: Spacing.md }} />
              <TutorialStepSkeleton />
            </View>
          </>
        ) : (
          <>
            <Animated.View entering={FadeIn.delay(100).duration(400)}>
              <View style={styles.sectionHeader}>
                <ThemedText type="h2">Products Found</ThemedText>
                <View style={[styles.countBadge, { backgroundColor: theme.primary }]}>
                  <ThemedText type="caption" style={{ color: "#FFFFFF" }}>
                    {products.length}
                  </ThemedText>
                </View>
              </View>

              {products.length > 0 ? (
                <View style={styles.productsGrid}>
                  {products.map((product, index) => (
                    <Animated.View
                      key={product.id}
                      entering={FadeInDown.delay(index * 100).duration(400)}
                      style={{ width: PRODUCT_CARD_WIDTH }}
                    >
                      <ProductCard
                        product={product}
                        onPress={() => handleProductPress(product)}
                        testID={`product-card-${product.id}`}
                      />
                    </Animated.View>
                  ))}
                </View>
              ) : (
                <View style={[styles.emptyProducts, { backgroundColor: theme.backgroundSecondary }]}>
                  <Feather name="package" size={32} color={theme.textSecondary} />
                  <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
                    No products found
                  </ThemedText>
                </View>
              )}
            </Animated.View>

            <Animated.View entering={FadeIn.delay(200).duration(400)}>
              <View style={styles.sectionHeader}>
                <ThemedText type="h2">The Routine</ThemedText>
              </View>

              {tutorialSteps.length > 0 ? (
                <View style={styles.stepsContainer}>
                  {tutorialSteps.map((step, index) => (
                    <Animated.View
                      key={index}
                      entering={FadeInDown.delay(index * 80).duration(400)}
                    >
                      <TutorialStep step={step} testID={`tutorial-step-${index}`} />
                    </Animated.View>
                  ))}
                </View>
              ) : (
                <View style={[styles.emptyProducts, { backgroundColor: theme.backgroundSecondary }]}>
                  <Feather name="list" size={32} color={theme.textSecondary} />
                  <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
                    No steps found
                  </ThemedText>
                </View>
              )}
            </Animated.View>
          </>
        )}
      </ScrollView>

      {!isLoading ? (
        <Animated.View
          entering={FadeIn.delay(300).duration(400)}
          style={[styles.floatingButtons, { bottom: insets.bottom + Spacing.lg }]}
        >
          {analysisResult?.analysis.id ? (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate("DebugAnalysis", { analysisId: analysisResult.analysis.id });
              }}
              style={[styles.debugButton, { backgroundColor: theme.backgroundSecondary }]}
              testID="button-debug-analysis"
            >
              <Feather name="code" size={20} color={theme.primary} />
            </Pressable>
          ) : null}
          {products.length > 0 ? (
            <View style={{ flex: 1 }}>
              <Button
                onPress={handleSaveLook}
                loading={saveLookMutation.isPending}
                testID="button-save-look"
              >
                Save to Lookbook
              </Button>
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  videoPreview: {
    aspectRatio: 16 / 9,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing["2xl"],
  },
  loadingSection: {
    marginBottom: Spacing["2xl"],
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  countBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    minWidth: 24,
    alignItems: "center",
  },
  productsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginBottom: Spacing["2xl"],
  },
  emptyProducts: {
    padding: Spacing["3xl"],
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  stepsContainer: {
    gap: Spacing.md,
  },
  floatingButtons: {
    position: "absolute",
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  debugButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});

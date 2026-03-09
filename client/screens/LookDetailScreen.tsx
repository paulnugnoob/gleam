import React, { useCallback, useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  Pressable,
  Image,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  runOnJS,
  Extrapolation,
  FadeIn,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { BlurView } from "expo-blur";
import { useVideoPlayer, VideoView, VideoPlayer } from "expo-video";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type {
  VideoAnalysis,
  DetectedProduct,
  TutorialStep as TutorialStepType,
} from "@shared/schema";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type LookDetailRouteProp = RouteProp<RootStackParamList, "LookDetail">;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const DEPTH_FULL = 0;
const DEPTH_PEEK = 1;
const DEPTH_EXPANDED = 2;

const PEEK_HEIGHT = 180;
const PINNED_VIDEO_HEIGHT = 220;

interface AnalysisResult {
  analysis: VideoAnalysis;
  products: DetectedProduct[];
}

type TabType = "routine" | "products";

function StepRow({
  step,
  index,
  isActive,
  onPress,
  products,
  onProductPress,
}: {
  step: TutorialStepType;
  index: number;
  isActive: boolean;
  onPress: () => void;
  products: DetectedProduct[];
  onProductPress: (product: DetectedProduct) => void;
}) {
  const { theme } = useTheme();

  const stepProducts = products.filter(
    (p) =>
      p.matchedProductName &&
      step.productUsed &&
      (step.productUsed
        .toLowerCase()
        .includes(p.matchedProductName?.toLowerCase() || "") ||
        p.aiDetectedName
          ?.toLowerCase()
          .includes(step.productUsed.toLowerCase())),
  );

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.stepRow,
        isActive && { backgroundColor: theme.primary + "08" },
      ]}
      testID={`step-row-${index}`}
    >
      <View
        style={[
          styles.stepDot,
          {
            backgroundColor: isActive ? theme.primary : theme.border,
            transform: [{ scale: isActive ? 1.2 : 1 }],
          },
        ]}
      />
      <View style={styles.stepBody}>
        <ThemedText
          type="body"
          style={{
            color: isActive ? theme.text : theme.textSecondary,
            fontWeight: isActive ? "500" : "400",
            lineHeight: 22,
          }}
        >
          {step.instruction}
        </ThemedText>
        {stepProducts.length > 0 ? (
          <View style={styles.inlineProducts}>
            {stepProducts.slice(0, 2).map((product) => (
              <Pressable
                key={product.id}
                onPress={() => onProductPress(product)}
                style={[
                  styles.productChip,
                  { backgroundColor: theme.backgroundSecondary },
                ]}
              >
                {product.matchedProductImage ? (
                  <Image
                    source={{ uri: product.matchedProductImage }}
                    style={styles.productChipImage}
                  />
                ) : null}
                <ThemedText
                  type="small"
                  style={{ color: theme.textSecondary }}
                  numberOfLines={1}
                >
                  {product.matchedProductName || product.aiDetectedName}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        ) : step.productUsed ? (
          <ThemedText
            type="small"
            style={{ color: theme.textTertiary, marginTop: 4 }}
          >
            {step.productUsed}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

function ProductsTab({
  products,
  onProductPress,
}: {
  products: DetectedProduct[];
  onProductPress: (product: DetectedProduct) => void;
}) {
  const { theme } = useTheme();
  const matchedProducts = products.filter((p) => p.matchedProductName);

  if (matchedProducts.length === 0) {
    return (
      <View style={styles.productsEmpty}>
        <ThemedText type="body" style={{ color: theme.textTertiary }}>
          No shoppable products found
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.productsGrid}>
      {matchedProducts.map((product) => (
        <Pressable
          key={product.id}
          onPress={() => onProductPress(product)}
          style={[
            styles.productCard,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        >
          {product.matchedProductImage ? (
            <Image
              source={{ uri: product.matchedProductImage }}
              style={styles.productImage}
            />
          ) : (
            <View
              style={[
                styles.productImagePlaceholder,
                { backgroundColor: theme.backgroundDefault },
              ]}
            >
              <Feather name="package" size={20} color={theme.textTertiary} />
            </View>
          )}
          <View style={styles.productInfo}>
            <ThemedText
              type="small"
              style={{ color: theme.text }}
              numberOfLines={2}
            >
              {product.matchedProductName}
            </ThemedText>
            {product.matchedProductBrand ? (
              <ThemedText
                type="small"
                style={{ color: theme.textTertiary, marginTop: 2 }}
              >
                {product.matchedProductBrand}
              </ThemedText>
            ) : null}
            {product.matchedProductPrice ? (
              <ThemedText
                type="body"
                style={{
                  color: theme.primary,
                  fontWeight: "600",
                  marginTop: 4,
                }}
              >
                ${product.matchedProductPrice}
              </ThemedText>
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function LoadingState({ thumbnailUrl }: { thumbnailUrl?: string | null }) {
  const { theme } = useTheme();

  return (
    <View style={styles.loadingContainer}>
      {thumbnailUrl ? (
        <Image
          source={{ uri: thumbnailUrl }}
          style={styles.loadingBackground}
          blurRadius={Platform.OS === "ios" ? 25 : 15}
        />
      ) : (
        <View
          style={[
            styles.loadingBackground,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        />
      )}
      <BlurView intensity={80} style={styles.loadingOverlay} tint="dark">
        <Animated.View
          entering={FadeIn.delay(300).duration(800)}
          style={styles.loadingContent}
        >
          <View style={styles.loadingPulse}>
            <Feather name="layers" size={28} color="rgba(255,255,255,0.9)" />
          </View>
        </Animated.View>
      </BlurView>
    </View>
  );
}

export default function LookDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<LookDetailRouteProp>();
  const { theme } = useTheme();
  const { analysisId, title } = route.params;

  const [depth, setDepth] = useState(DEPTH_FULL);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<TabType>("routine");
  const [isPlaying, setIsPlaying] = useState(false);

  const depthValue = useSharedValue(DEPTH_FULL);
  const gestureStartY = useSharedValue(0);

  const { data: analysisData, isLoading } = useQuery<AnalysisResult>({
    queryKey: ["/api/video-analyses", analysisId],
    enabled: !!analysisId,
  });

  const analysis = analysisData?.analysis;
  const products = analysisData?.products || [];
  const tutorialSteps = analysis?.tutorialSteps || [];
  const matchedProductsCount = products.filter(
    (p) => p.matchedProductName,
  ).length;

  const videoSource = analysis?.videoUrl || "";
  const player = useVideoPlayer(videoSource, (p: VideoPlayer) => {
    p.loop = false;
    p.muted = false;
  });

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    if (!player) return;

    const interval = setInterval(() => {
      if (player.playing && tutorialSteps.length > 0) {
        const currentTime = player.currentTime;
        let foundIndex = 0;

        for (let i = tutorialSteps.length - 1; i >= 0; i--) {
          const step = tutorialSteps[i];
          if (step.timestamp) {
            const stepTime = parseTimestamp(step.timestamp);
            if (currentTime >= stepTime) {
              foundIndex = i;
              break;
            }
          }
        }

        if (foundIndex !== activeStepIndex) {
          setActiveStepIndex(foundIndex);
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [player, tutorialSteps, activeStepIndex]);

  const updateDepth = useCallback(
    (newDepth: number) => {
      const clampedDepth = Math.max(
        DEPTH_FULL,
        Math.min(DEPTH_EXPANDED, newDepth),
      );
      if (clampedDepth !== depth) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setDepth(clampedDepth);
        depthValue.value = withSpring(clampedDepth, {
          damping: 25,
          stiffness: 180,
        });
      }
    },
    [depth, depthValue],
  );

  const handleStepPress = useCallback(
    (step: TutorialStepType, index: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setActiveStepIndex(index);
      if (step.timestamp && player) {
        const seconds = parseTimestamp(step.timestamp);
        player.currentTime = seconds;
        if (!player.playing) {
          player.play();
          setIsPlaying(true);
        }
      }
    },
    [player],
  );

  const handleProductPress = useCallback(
    (product: DetectedProduct) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      navigation.navigate("ProductDetail", { product });
    },
    [navigation],
  );

  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const togglePlayPause = useCallback(() => {
    if (player) {
      if (player.playing) {
        player.pause();
        setIsPlaying(false);
      } else {
        player.play();
        setIsPlaying(true);
      }
    }
  }, [player]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      gestureStartY.value = depthValue.value;
    })
    .onUpdate((event) => {
      const dragProgress = -event.translationY / 200;
      const newDepth = gestureStartY.value + dragProgress;
      depthValue.value = Math.max(0, Math.min(2, newDepth));
    })
    .onEnd((event) => {
      const velocity = -event.velocityY;
      const currentDepth = depthValue.value;

      let targetDepth: number;
      if (velocity > 500) {
        targetDepth = Math.min(DEPTH_EXPANDED, Math.ceil(currentDepth));
      } else if (velocity < -500) {
        targetDepth = Math.max(DEPTH_FULL, Math.floor(currentDepth));
      } else {
        targetDepth = Math.round(currentDepth);
      }

      runOnJS(updateDepth)(targetDepth);
    });

  const videoContainerStyle = useAnimatedStyle(() => {
    const height = interpolate(
      depthValue.value,
      [DEPTH_FULL, DEPTH_PEEK, DEPTH_EXPANDED],
      [SCREEN_HEIGHT, SCREEN_HEIGHT - PEEK_HEIGHT, PINNED_VIDEO_HEIGHT],
      Extrapolation.CLAMP,
    );

    return { height };
  });

  const routineContainerStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      depthValue.value,
      [DEPTH_FULL, DEPTH_PEEK, DEPTH_EXPANDED],
      [SCREEN_HEIGHT, SCREEN_HEIGHT - PEEK_HEIGHT, PINNED_VIDEO_HEIGHT],
      Extrapolation.CLAMP,
    );

    const opacity = interpolate(
      depthValue.value,
      [DEPTH_FULL, DEPTH_PEEK * 0.5, DEPTH_PEEK],
      [0, 0, 1],
      Extrapolation.CLAMP,
    );

    return {
      transform: [{ translateY }],
      opacity,
    };
  });

  const fullscreenControlsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      depthValue.value,
      [0, 0.3],
      [1, 0],
      Extrapolation.CLAMP,
    ),
    pointerEvents: depthValue.value < 0.3 ? "auto" : "none",
  }));

  const peekIndicatorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      depthValue.value,
      [0, 0.2, 0.5],
      [1, 1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  if (isLoading) {
    return <LoadingState thumbnailUrl={analysis?.thumbnailUrl} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <GestureDetector gesture={panGesture}>
        <View style={styles.gestureContainer}>
          <Animated.View style={[styles.videoContainer, videoContainerStyle]}>
            {videoSource ? (
              <Pressable
                onPress={togglePlayPause}
                style={styles.videoTouchable}
              >
                <VideoView
                  player={player}
                  style={styles.video}
                  contentFit="cover"
                  nativeControls={false}
                />
              </Pressable>
            ) : analysis?.thumbnailUrl ? (
              <Image
                source={{ uri: analysis.thumbnailUrl }}
                style={styles.video}
              />
            ) : (
              <View
                style={[
                  styles.video,
                  { backgroundColor: theme.backgroundSecondary },
                ]}
              />
            )}

            <Animated.View
              style={[styles.fullscreenControls, fullscreenControlsStyle]}
            >
              <Pressable
                onPress={handleClose}
                style={[styles.closeHandle, { top: insets.top + Spacing.md }]}
                hitSlop={16}
              >
                <Feather
                  name="chevron-down"
                  size={28}
                  color="rgba(255,255,255,0.9)"
                />
              </Pressable>

              <Pressable onPress={togglePlayPause} style={styles.centerPlay}>
                <View style={styles.playCircle}>
                  <Feather
                    name={isPlaying ? "pause" : "play"}
                    size={28}
                    color="#FFF"
                    style={!isPlaying ? { marginLeft: 3 } : undefined}
                  />
                </View>
              </Pressable>
            </Animated.View>

            <Animated.View style={[styles.peekIndicator, peekIndicatorStyle]}>
              <View style={styles.peekHandle} />
              <ThemedText type="small" style={styles.peekHint}>
                {tutorialSteps.length} steps
              </ThemedText>
            </Animated.View>
          </Animated.View>

          <Animated.View
            style={[
              styles.routineContainer,
              routineContainerStyle,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <View style={styles.routineHandle}>
              <View
                style={[styles.handleBar, { backgroundColor: theme.border }]}
              />
            </View>

            <View style={styles.tabRow}>
              <Pressable
                onPress={() => setActiveTab("routine")}
                style={styles.tabButton}
              >
                <ThemedText
                  type="body"
                  style={{
                    color:
                      activeTab === "routine" ? theme.text : theme.textTertiary,
                    fontWeight: activeTab === "routine" ? "600" : "400",
                  }}
                >
                  Routine
                </ThemedText>
                {activeTab === "routine" ? (
                  <View
                    style={[
                      styles.tabIndicator,
                      { backgroundColor: theme.primary },
                    ]}
                  />
                ) : null}
              </Pressable>
              {matchedProductsCount > 0 ? (
                <Pressable
                  onPress={() => setActiveTab("products")}
                  style={styles.tabButton}
                >
                  <ThemedText
                    type="body"
                    style={{
                      color:
                        activeTab === "products"
                          ? theme.text
                          : theme.textTertiary,
                      fontWeight: activeTab === "products" ? "600" : "400",
                    }}
                  >
                    Products
                  </ThemedText>
                  <ThemedText
                    type="small"
                    style={{ color: theme.textTertiary, marginLeft: 4 }}
                  >
                    {matchedProductsCount}
                  </ThemedText>
                  {activeTab === "products" ? (
                    <View
                      style={[
                        styles.tabIndicator,
                        { backgroundColor: theme.primary },
                      ]}
                    />
                  ) : null}
                </Pressable>
              ) : null}
            </View>

            <ScrollView
              contentContainerStyle={[
                styles.routineContent,
                { paddingBottom: insets.bottom + Spacing["2xl"] },
              ]}
              showsVerticalScrollIndicator={false}
            >
              {activeTab === "routine" ? (
                tutorialSteps.length > 0 ? (
                  tutorialSteps.map((step, index) => (
                    <StepRow
                      key={index}
                      step={step}
                      index={index}
                      isActive={index === activeStepIndex}
                      onPress={() => handleStepPress(step, index)}
                      products={products}
                      onProductPress={handleProductPress}
                    />
                  ))
                ) : (
                  <View style={styles.emptyState}>
                    <ThemedText
                      type="body"
                      style={{ color: theme.textTertiary }}
                    >
                      No steps found
                    </ThemedText>
                  </View>
                )
              ) : (
                <ProductsTab
                  products={products}
                  onProductPress={handleProductPress}
                />
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(":").map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gestureContainer: {
    flex: 1,
  },
  videoContainer: {
    width: "100%",
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
  },
  videoTouchable: {
    flex: 1,
  },
  video: {
    width: "100%",
    height: "100%",
  },
  fullscreenControls: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  closeHandle: {
    position: "absolute",
    left: Spacing.lg,
  },
  centerPlay: {
    alignItems: "center",
    justifyContent: "center",
  },
  playCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  peekIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingBottom: Spacing.xl,
  },
  peekHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.5)",
    marginBottom: Spacing.sm,
  },
  peekHint: {
    color: "rgba(255,255,255,0.8)",
  },
  routineContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
  },
  routineHandle: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    position: "relative",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
  },
  routineContent: {
    paddingTop: Spacing.md,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 7,
  },
  stepBody: {
    flex: 1,
  },
  inlineProducts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  productChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.full,
    gap: 6,
    maxWidth: "100%",
  },
  productChipImage: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  productsEmpty: {
    padding: Spacing["3xl"],
    alignItems: "center",
  },
  productsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  productCard: {
    width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.md) / 2,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  productImage: {
    width: "100%",
    aspectRatio: 1,
  },
  productImagePlaceholder: {
    width: "100%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  productInfo: {
    padding: Spacing.md,
  },
  emptyState: {
    padding: Spacing["3xl"],
    alignItems: "center",
  },
  loadingContainer: {
    flex: 1,
  },
  loadingBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContent: {
    alignItems: "center",
  },
  loadingPulse: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
});

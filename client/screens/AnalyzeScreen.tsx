import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  Alert,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { VideoAnalysis } from "@shared/schema";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface RecentItemProps {
  item: VideoAnalysis;
  index: number;
  onPress: (analysis: VideoAnalysis) => void;
}

function RecentItem({ item, index, onPress }: RecentItemProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View entering={FadeInDown.delay(index * 100).duration(400)}>
      <AnimatedPressable
        onPress={() => onPress(item)}
        onPressIn={() => { scale.value = withSpring(0.98); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        style={[
          styles.recentCard,
          { backgroundColor: theme.backgroundDefault },
          animatedStyle,
        ]}
        testID={`analysis-card-${item.id}`}
      >
        {item.thumbnailUrl ? (
          <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
        ) : (
          <View style={[styles.thumbnailPlaceholder, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather name="video" size={24} color={theme.textSecondary} />
          </View>
        )}
        <View style={styles.recentContent}>
          <ThemedText type="body" numberOfLines={2} style={styles.recentTitle}>
            {item.title || "Untitled Video"}
          </ThemedText>
          <View style={styles.recentMeta}>
            <View style={[styles.platformBadge, { backgroundColor: theme.primary + "15" }]}>
              <ThemedText type="caption" style={{ color: theme.primary }}>
                {item.platform || "Video"}
              </ThemedText>
            </View>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {item.status === "completed" ? "Analyzed" : item.status}
            </ThemedText>
          </View>
        </View>
        <Feather name="chevron-right" size={20} color={theme.textTertiary} />
      </AnimatedPressable>
    </Animated.View>
  );
}

export default function AnalyzeScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const [videoUrl, setVideoUrl] = useState("");

  const { data: recentAnalyses = [], isLoading } = useQuery<VideoAnalysis[]>({
    queryKey: ["/api/video-analyses"],
  });

  const handleShareVideo = useCallback(() => {
    if (!videoUrl.trim()) {
      Alert.alert("Enter a URL", "Please paste a video URL from TikTok, YouTube, or Instagram");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("VideoAnalysis", { videoUrl: videoUrl.trim() });
    setVideoUrl("");
  }, [videoUrl, navigation]);

  const handleAnalysisPress = useCallback((analysis: VideoAnalysis) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("VideoAnalysis", { videoUrl: analysis.videoUrl, analysisId: analysis.id });
  }, [navigation]);

  const renderRecentItem = useCallback(({ item, index }: { item: VideoAnalysis; index: number }) => (
    <RecentItem item={item} index={index} onPress={handleAnalysisPress} />
  ), [handleAnalysisPress]);

  const ListHeader = () => (
    <View style={styles.header}>
      <Animated.View entering={FadeInDown.delay(0).duration(500)}>
        <View style={styles.heroSection}>
          <ThemedText type="display" style={styles.heroTitle}>
            Discover Beauty
          </ThemedText>
          <ThemedText type="body" style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
            Paste a video URL to identify products and get your personalized shopping list
          </ThemedText>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(100).duration(500)}>
        <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault }]}>
          <Feather name="link" size={20} color={theme.textTertiary} style={styles.inputIcon} />
          <TextInput
            value={videoUrl}
            onChangeText={setVideoUrl}
            placeholder="Paste TikTok, YouTube, or Instagram URL"
            placeholderTextColor={theme.textTertiary}
            style={[styles.input, { color: theme.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            testID="input-video-url"
          />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).duration(500)}>
        <Button
          onPress={handleShareVideo}
          style={styles.analyzeButton}
          testID="button-analyze"
        >
          Analyze Video
        </Button>
      </Animated.View>

      {recentAnalyses.length > 0 ? (
        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
          <ThemedText type="h3" style={styles.sectionTitle}>
            Recent Analyses
          </ThemedText>
        </Animated.View>
      ) : null}
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
        flexGrow: 1,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      data={recentAnalyses}
      keyExtractor={(item) => item.id.toString()}
      renderItem={renderRecentItem}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={
        <EmptyState
          image={require("../../assets/images/empty-analyze.png")}
          title="No videos analyzed yet"
          subtitle="Paste a video URL above to get started identifying beauty products"
        />
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: Spacing.lg,
  },
  heroSection: {
    marginBottom: Spacing["2xl"],
  },
  heroTitle: {
    marginBottom: Spacing.md,
  },
  heroSubtitle: {
    lineHeight: 24,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    height: 56,
    marginBottom: Spacing.lg,
  },
  inputIcon: {
    marginRight: Spacing.md,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  analyzeButton: {
    marginBottom: Spacing["3xl"],
  },
  sectionTitle: {
    marginBottom: Spacing.lg,
  },
  recentCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  thumbnail: {
    width: 70,
    height: 70,
    borderRadius: BorderRadius.xs,
  },
  thumbnailPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  recentContent: {
    flex: 1,
  },
  recentTitle: {
    fontWeight: "500",
    marginBottom: Spacing.sm,
  },
  recentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  platformBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
});

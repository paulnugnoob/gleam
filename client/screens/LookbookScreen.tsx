import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
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
  FadeIn,
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
import type { VideoAnalysis, SavedLook } from "@shared/schema";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - Spacing.lg * 2 - Spacing.md) / 2;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface LookWithAnalysis extends SavedLook {
  videoAnalysis?: VideoAnalysis;
  productCount?: number;
}

interface LookCardProps {
  item: LookWithAnalysis;
  index: number;
  onPress: (look: LookWithAnalysis) => void;
}

function LookCard({ item, index, onPress }: LookCardProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(400)}>
      <AnimatedPressable
        onPress={() => onPress(item)}
        onPressIn={() => {
          scale.value = withSpring(0.96);
        }}
        onPressOut={() => {
          scale.value = withSpring(1);
        }}
        style={[
          styles.lookCard,
          { backgroundColor: theme.backgroundDefault },
          animatedStyle,
        ]}
        testID={`look-card-${item.id}`}
      >
        {item.videoAnalysis?.thumbnailUrl ? (
          <Image
            source={{ uri: item.videoAnalysis.thumbnailUrl }}
            style={styles.lookThumbnail}
          />
        ) : (
          <View
            style={[
              styles.lookThumbnailPlaceholder,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <Feather name="image" size={28} color={theme.textSecondary} />
          </View>
        )}
        <View style={styles.lookContent}>
          <ThemedText type="body" numberOfLines={2} style={styles.lookTitle}>
            {item.title}
          </ThemedText>
          <View style={styles.lookMeta}>
            <Feather name="package" size={12} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {item.productCount || 0} products
            </ThemedText>
          </View>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

export default function LookbookScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const [showAddModal, setShowAddModal] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");

  const { data: savedLooks = [], isLoading } = useQuery<LookWithAnalysis[]>({
    queryKey: ["/api/saved-looks"],
  });

  const handleLookPress = useCallback(
    (look: LookWithAnalysis) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (look.videoAnalysisId) {
        navigation.navigate("LookDetail", {
          lookId: look.id,
          analysisId: look.videoAnalysisId,
          title: look.title,
        });
      }
    },
    [navigation],
  );

  const handleAddLook = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowAddModal(true);
  }, []);

  const handleSubmitUrl = useCallback(() => {
    if (!videoUrl.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowAddModal(false);
    navigation.navigate("VideoAnalysis", { videoUrl: videoUrl.trim() });
    setVideoUrl("");
  }, [videoUrl, navigation]);

  const renderLookCard = useCallback(
    ({ item, index }: { item: LookWithAnalysis; index: number }) => (
      <LookCard item={item} index={index} onPress={handleLookPress} />
    ),
    [handleLookPress],
  );

  const ListHeader = () => (
    <View style={styles.header}>
      <Animated.View entering={FadeInDown.delay(0).duration(500)}>
        <ThemedText type="display" style={styles.welcomeText}>
          Your Beauty{"\n"}Rituals
        </ThemedText>
        <ThemedText
          type="body"
          style={[styles.subtitle, { color: theme.textSecondary }]}
        >
          A collection of looks to recreate and love
        </ThemedText>
      </Animated.View>
    </View>
  );

  return (
    <>
      <FlatList
        style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: tabBarHeight + Spacing["5xl"],
          paddingHorizontal: Spacing.lg,
          flexGrow: 1,
        }}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        data={savedLooks}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderLookCard}
        numColumns={2}
        columnWrapperStyle={savedLooks.length > 0 ? styles.row : undefined}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          <Animated.View entering={FadeIn.delay(200).duration(400)}>
            <EmptyState
              image={require("../../assets/images/empty-analyze.png")}
              title="Start your collection"
              subtitle="Add your first look from a beauty tutorial and build your personal lookbook"
            />
          </Animated.View>
        }
        showsVerticalScrollIndicator={false}
      />

      <Animated.View
        entering={FadeIn.delay(400).duration(400)}
        style={[
          styles.floatingButton,
          {
            bottom: tabBarHeight + Spacing.lg,
            backgroundColor: theme.primary,
          },
        ]}
      >
        <Pressable
          onPress={handleAddLook}
          style={styles.addButtonInner}
          testID="button-add-look"
        >
          <Feather name="plus" size={24} color="#FFFFFF" />
        </Pressable>
      </Animated.View>

      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowAddModal(false)}
          />
          <Animated.View
            entering={FadeInDown.duration(300)}
            style={[
              styles.modalContent,
              { backgroundColor: theme.backgroundDefault },
            ]}
          >
            <ThemedText type="h2" style={styles.modalTitle}>
              Add a New Look
            </ThemedText>
            <ThemedText
              type="body"
              style={[styles.modalSubtitle, { color: theme.textSecondary }]}
            >
              Paste a link from TikTok, Instagram, or YouTube
            </ThemedText>

            <View
              style={[
                styles.inputContainer,
                { backgroundColor: theme.backgroundSecondary },
              ]}
            >
              <Feather
                name="link"
                size={20}
                color={theme.textTertiary}
                style={styles.inputIcon}
              />
              <TextInput
                value={videoUrl}
                onChangeText={setVideoUrl}
                placeholder="Paste video link here..."
                placeholderTextColor={theme.textTertiary}
                style={[styles.input, { color: theme.text }]}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                autoFocus
                testID="input-video-url"
              />
            </View>

            <View style={styles.modalButtons}>
              <Button
                variant="secondary"
                onPress={() => setShowAddModal(false)}
                style={styles.modalButton}
              >
                Cancel
              </Button>
              <Button
                onPress={handleSubmitUrl}
                style={styles.modalButton}
                disabled={!videoUrl.trim()}
                testID="button-submit-url"
              >
                Add to Lookbook
              </Button>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: Spacing["2xl"],
  },
  welcomeText: {
    marginBottom: Spacing.md,
  },
  subtitle: {
    lineHeight: 24,
  },
  row: {
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  lookCard: {
    width: CARD_WIDTH,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  lookThumbnail: {
    width: "100%",
    aspectRatio: 3 / 4,
  },
  lookThumbnailPlaceholder: {
    width: "100%",
    aspectRatio: 3 / 4,
    alignItems: "center",
    justifyContent: "center",
  },
  lookContent: {
    padding: Spacing.md,
  },
  lookTitle: {
    fontWeight: "500",
    marginBottom: Spacing.sm,
  },
  lookMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  floatingButton: {
    position: "absolute",
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  addButtonInner: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    borderRadius: BorderRadius.md,
    padding: Spacing["2xl"],
  },
  modalTitle: {
    marginBottom: Spacing.sm,
  },
  modalSubtitle: {
    marginBottom: Spacing.xl,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.lg,
    height: 56,
    marginBottom: Spacing.xl,
  },
  inputIcon: {
    marginRight: Spacing.md,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  modalButtons: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  modalButton: {
    flex: 1,
  },
});

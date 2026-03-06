import React, { useCallback } from "react";
import { View, StyleSheet, FlatList, Image, Pressable, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { EmptyState } from "@/components/EmptyState";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { SavedLook, VideoAnalysis } from "@shared/schema";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width } = Dimensions.get("window");
const CARD_WIDTH = (width - Spacing.lg * 2 - Spacing.md) / 2;

interface LookWithAnalysis extends SavedLook {
  videoAnalysis?: VideoAnalysis;
  productCount?: number;
}

export default function MyLooksScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();

  const { data: savedLooks = [], isLoading } = useQuery<LookWithAnalysis[]>({
    queryKey: ["/api/saved-looks"],
  });

  const handleLookPress = useCallback((look: LookWithAnalysis) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("ShoppingList", {
      look: {
        id: look.id,
        title: look.title,
        videoAnalysisId: look.videoAnalysisId,
      },
    });
  }, [navigation]);

  const renderLookCard = useCallback(({ item, index }: { item: LookWithAnalysis; index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(400)}>
      <Pressable
        onPress={() => handleLookPress(item)}
        style={({ pressed }) => [
          styles.lookCard,
          { backgroundColor: theme.backgroundDefault, opacity: pressed ? 0.8 : 1 },
        ]}
        testID={`look-card-${item.id}`}
      >
        {item.videoAnalysis?.thumbnailUrl ? (
          <Image
            source={{ uri: item.videoAnalysis.thumbnailUrl }}
            style={styles.lookThumbnail}
          />
        ) : (
          <View style={[styles.lookThumbnailPlaceholder, { backgroundColor: theme.backgroundSecondary }]}>
            <Feather name="image" size={28} color={theme.textSecondary} />
          </View>
        )}
        <View style={styles.lookContent}>
          <ThemedText type="body" numberOfLines={2} style={styles.lookTitle}>
            {item.title}
          </ThemedText>
          <View style={styles.lookMeta}>
            <Feather name="shopping-bag" size={12} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {item.productCount || 0} products
            </ThemedText>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  ), [theme, handleLookPress]);

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
      data={savedLooks}
      keyExtractor={(item) => item.id.toString()}
      renderItem={renderLookCard}
      numColumns={2}
      columnWrapperStyle={styles.row}
      ListEmptyComponent={
        <EmptyState
          image={require("../../assets/images/empty-looks.png")}
          title="No saved looks yet"
          subtitle="Analyze a video and save it to build your beauty collection"
        />
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  lookCard: {
    width: CARD_WIDTH,
    borderRadius: BorderRadius.sm,
    overflow: "hidden",
  },
  lookThumbnail: {
    width: "100%",
    aspectRatio: 1,
    resizeMode: "cover",
  },
  lookThumbnailPlaceholder: {
    width: "100%",
    aspectRatio: 1,
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
});

import React, { useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { ProductCard } from "@/components/ProductCard";
import { EmptyState } from "@/components/EmptyState";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { DetectedProduct, VideoAnalysis } from "@shared/schema";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ShoppingListRouteProp = RouteProp<RootStackParamList, "ShoppingList">;

interface ShoppingListData {
  videoAnalysis: VideoAnalysis;
  products: DetectedProduct[];
  totalPrice: string;
}

export default function ShoppingListScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ShoppingListRouteProp>();
  const { theme } = useTheme();
  const { look } = route.params;

  const { data } = useQuery<ShoppingListData>({
    queryKey: ["/api/saved-looks", look.id, "products"],
  });

  const products = data?.products || [];
  const totalPrice = data?.totalPrice || "0.00";
  const videoAnalysis = data?.videoAnalysis;

  const handleProductPress = useCallback((product: DetectedProduct) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("ProductDetail", { product });
  }, [navigation]);

  const renderProduct = useCallback(({ item, index }: { item: DetectedProduct; index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(400)}>
      <ProductCard
        product={item}
        onPress={() => handleProductPress(item)}
        compact
        testID={`shopping-product-${item.id}`}
      />
    </Animated.View>
  ), [handleProductPress]);

  const ListHeader = () => (
    <View style={styles.header}>
      {videoAnalysis?.thumbnailUrl ? (
        <Animated.View entering={FadeInDown.delay(0).duration(400)}>
          <Pressable style={styles.videoPreview}>
            <Image
              source={{ uri: videoAnalysis.thumbnailUrl }}
              style={styles.videoThumbnail}
            />
            <View style={[styles.playButton, { backgroundColor: theme.primary }]}>
              <Feather name="play" size={20} color="#FFFFFF" />
            </View>
          </Pressable>
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.delay(100).duration(400)}>
        <ThemedText type="h1" style={styles.title}>
          {look.title}
        </ThemedText>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).duration(400)}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <ThemedText type="h2" style={{ color: theme.primary }}>
              {products.length}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Products
            </ThemedText>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={styles.summaryItem}>
            <ThemedText type="h2" style={{ color: theme.primary }}>
              ${totalPrice}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Estimated Total
            </ThemedText>
          </View>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(400)}>
        <ThemedText type="h3" style={styles.sectionTitle}>
          Products
        </ThemedText>
      </Animated.View>
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: insets.bottom + Spacing.xl,
        paddingHorizontal: Spacing.lg,
        flexGrow: 1,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      data={products}
      keyExtractor={(item) => item.id.toString()}
      renderItem={renderProduct}
      ListHeaderComponent={ListHeader}
      ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
      ListEmptyComponent={
        <EmptyState
          image={require("../../assets/images/empty-looks.png")}
          title="No products yet"
          subtitle="Products will appear here once you add them from an analyzed video"
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
  videoPreview: {
    position: "relative",
    marginBottom: Spacing["2xl"],
  },
  videoThumbnail: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: BorderRadius.sm,
    resizeMode: "cover",
  },
  playButton: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -20 }, { translateY: -20 }],
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginBottom: Spacing.lg,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  divider: {
    width: 1,
    height: 40,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
});

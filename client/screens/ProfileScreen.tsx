import React, { useCallback, useState } from "react";
import {
  View,
  StyleSheet,
  Image,
  Pressable,
  Switch,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type { UserProfile } from "@shared/schema";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { theme, isDark } = useTheme();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/user-profile"],
  });

  const handleAddSelfie = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("SelfieCapture");
  }, [navigation]);

  const selfieUrls = profile?.selfieUrls || [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeInDown.delay(0).duration(400)}>
        <View style={styles.avatarSection}>
          <Image
            source={
              profile?.avatarUrl
                ? { uri: profile.avatarUrl }
                : require("../../assets/images/avatar-preset.png")
            }
            style={styles.avatar}
          />
          <ThemedText type="h2" style={styles.displayName}>
            {profile?.displayName || "Beauty Enthusiast"}
          </ThemedText>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(100).duration(400)}>
        <View style={[styles.section, { backgroundColor: theme.backgroundDefault }]}>
          <View style={styles.sectionHeader}>
            <ThemedText type="h3">Skin Tone Profile</ThemedText>
            {profile?.skinToneData ? (
              <View style={[styles.skinToneBadge, { backgroundColor: profile.skinToneData.hexColor }]}>
                <ThemedText type="caption" style={{ color: "#FFFFFF" }}>
                  {profile.skinToneData.undertone}
                </ThemedText>
              </View>
            ) : null}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selfiesContainer}
          >
            {selfieUrls.map((url, index) => (
              <Image
                key={index}
                source={{ uri: url }}
                style={styles.selfieThumb}
              />
            ))}
            <Pressable
              onPress={handleAddSelfie}
              style={[styles.addSelfieButton, { borderColor: theme.primary }]}
              testID="button-add-selfie"
            >
              <Feather name="plus" size={24} color={theme.primary} />
            </Pressable>
          </ScrollView>

          {!profile?.skinToneData ? (
            <View style={styles.noSkinTone}>
              <ThemedText type="body" style={{ color: theme.textSecondary, textAlign: "center" }}>
                Add a selfie to get personalized shade recommendations
              </ThemedText>
              <Button
                onPress={handleAddSelfie}
                variant="outline"
                style={styles.addSelfieMainButton}
              >
                Add Selfie
              </Button>
            </View>
          ) : null}
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).duration(400)}>
        <View style={[styles.section, { backgroundColor: theme.backgroundDefault }]}>
          <ThemedText type="h3" style={styles.sectionTitle}>
            About
          </ThemedText>

          <View style={styles.aboutRow}>
            <Feather name="info" size={18} color={theme.textSecondary} />
            <ThemedText type="body" style={{ color: theme.textSecondary }}>
              Version 1.0.0
            </ThemedText>
          </View>

          <Pressable style={styles.aboutRow}>
            <Feather name="file-text" size={18} color={theme.textSecondary} />
            <ThemedText type="body" style={{ flex: 1 }}>
              Privacy Policy
            </ThemedText>
            <Feather name="chevron-right" size={18} color={theme.textTertiary} />
          </Pressable>

          <Pressable style={styles.aboutRow}>
            <Feather name="file" size={18} color={theme.textSecondary} />
            <ThemedText type="body" style={{ flex: 1 }}>
              Terms of Service
            </ThemedText>
            <Feather name="chevron-right" size={18} color={theme.textTertiary} />
          </Pressable>
        </View>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  avatarSection: {
    alignItems: "center",
    marginBottom: Spacing["3xl"],
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: Spacing.lg,
  },
  displayName: {
    textAlign: "center",
  },
  section: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    marginBottom: Spacing.lg,
  },
  skinToneBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  selfiesContainer: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingBottom: Spacing.md,
  },
  selfieThumb: {
    width: 70,
    height: 70,
    borderRadius: BorderRadius.xs,
  },
  addSelfieButton: {
    width: 70,
    height: 70,
    borderRadius: BorderRadius.xs,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  noSkinTone: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },
  addSelfieMainButton: {
    marginTop: Spacing.lg,
  },
  aboutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
});

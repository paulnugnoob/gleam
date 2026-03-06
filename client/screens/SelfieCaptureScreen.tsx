import React, { useState, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { apiRequest } from "@/lib/query-client";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function SelfieCaptureScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const analyzeSkinToneMutation = useMutation({
    mutationFn: async (imageUri: string) => {
      const res = await apiRequest("POST", "/api/analyze-skin-tone", { imageUri });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-profile"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success!", "Your skin tone has been analyzed and saved.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Analysis Failed", "Could not analyze skin tone. Please try again.");
    },
  });

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsAnalyzing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      });
      if (photo?.uri) {
        analyzeSkinToneMutation.mutate(photo.uri);
      }
    } catch (error) {
      setIsAnalyzing(false);
      Alert.alert("Error", "Failed to capture photo");
    }
  }, [analyzeSkinToneMutation]);

  const handlePickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsAnalyzing(true);
      analyzeSkinToneMutation.mutate(result.assets[0].uri);
    }
  }, [analyzeSkinToneMutation]);

  const handleClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  if (!permission) {
    return <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]} />;
  }

  if (!permission.granted) {
    if (permission.status === "denied" && !permission.canAskAgain) {
      return (
        <View style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot }]}>
          <Feather name="camera-off" size={64} color={theme.textSecondary} />
          <ThemedText type="h2" style={styles.permissionTitle}>
            Camera Access Required
          </ThemedText>
          <ThemedText type="body" style={[styles.permissionText, { color: theme.textSecondary }]}>
            Please enable camera access in Settings to take selfies for skin tone analysis.
          </ThemedText>
          {Platform.OS !== "web" ? (
            <Button
              onPress={async () => {
                try {
                  await Linking.openSettings();
                } catch (error) {
                  // Settings not supported
                }
              }}
              style={styles.permissionButton}
            >
              Open Settings
            </Button>
          ) : null}
          <Button variant="secondary" onPress={handleClose} style={styles.permissionButton}>
            Go Back
          </Button>
        </View>
      );
    }

    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <Feather name="camera" size={64} color={theme.primary} />
        <ThemedText type="h2" style={styles.permissionTitle}>
          Enable Camera
        </ThemedText>
        <ThemedText type="body" style={[styles.permissionText, { color: theme.textSecondary }]}>
          We need camera access to take your selfie for accurate skin tone analysis.
        </ThemedText>
        <Button onPress={requestPermission} style={styles.permissionButton}>
          Enable Camera
        </Button>
        <Button variant="secondary" onPress={handleClose} style={styles.permissionButton}>
          Cancel
        </Button>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="front"
      >
        <View style={[styles.overlay, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <Pressable onPress={handleClose} style={styles.closeButton} testID="button-close-camera">
              <Feather name="x" size={24} color="#FFFFFF" />
            </Pressable>
            <ThemedText type="h3" style={styles.headerTitle}>
              Skin Tone Analysis
            </ThemedText>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.guideContainer}>
            <View style={styles.faceGuide} />
            <ThemedText type="body" style={styles.guideText}>
              Position your face in the frame
            </ThemedText>
          </View>

          <View style={[styles.controls, { paddingBottom: insets.bottom + Spacing.xl }]}>
            <Pressable onPress={handlePickImage} style={styles.galleryButton} testID="button-pick-image">
              <Feather name="image" size={24} color="#FFFFFF" />
            </Pressable>

            <Pressable
              onPress={handleCapture}
              style={[styles.captureButton, isAnalyzing && { opacity: 0.5 }]}
              disabled={isAnalyzing}
              testID="button-capture"
            >
              <View style={styles.captureButtonInner} />
            </Pressable>

            <View style={{ width: 44 }} />
          </View>
        </View>

        {isAnalyzing ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.analyzingOverlay}>
            <View style={[styles.analyzingCard, { backgroundColor: theme.backgroundDefault }]}>
              <ThemedText type="h3">Analyzing...</ThemedText>
              <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>
                Detecting your skin tone
              </ThemedText>
            </View>
          </Animated.View>
        ) : null}
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["3xl"],
  },
  permissionTitle: {
    marginTop: Spacing["2xl"],
    textAlign: "center",
  },
  permissionText: {
    textAlign: "center",
    marginTop: Spacing.md,
    marginBottom: Spacing["2xl"],
    lineHeight: 24,
  },
  permissionButton: {
    width: "100%",
    marginTop: Spacing.md,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#FFFFFF",
  },
  guideContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  faceGuide: {
    width: 220,
    height: 280,
    borderRadius: 110,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.6)",
    borderStyle: "dashed",
  },
  guideText: {
    color: "rgba(255,255,255,0.8)",
    marginTop: Spacing.xl,
    textAlign: "center",
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: Spacing["3xl"],
  },
  galleryButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFFFFF",
  },
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  analyzingCard: {
    padding: Spacing["2xl"],
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
});

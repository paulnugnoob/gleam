import React from "react";
import { View, StyleSheet, ScrollView, Image, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useRoute, RouteProp } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { SkeletonLoader } from "@/components/SkeletonLoader";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import type {
  DebugData,
  DetectedProduct,
  ProductEvidence,
  MatchScore,
  TimingReport,
} from "@shared/schema";

type DebugAnalysisRouteProp = RouteProp<RootStackParamList, "DebugAnalysis">;

const { width } = Dimensions.get("window");
const FRAME_SIZE = (width - Spacing.lg * 2 - Spacing.md * 2) / 3;

interface DebugResponse {
  id: number;
  videoUrl: string;
  title: string;
  status: string;
  debugData: DebugData;
  products: DetectedProduct[];
  createdAt: string;
}

export default function DebugAnalysisScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const route = useRoute<DebugAnalysisRouteProp>();
  const { theme } = useTheme();
  const { analysisId } = route.params;

  const { data, isLoading, error } = useQuery<DebugResponse>({
    queryKey: [`/api/video-analyses/${analysisId}/debug`],
  });

  if (isLoading) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      >
        <ScrollView
          contentContainerStyle={{
            paddingTop: headerHeight + Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xl,
            paddingHorizontal: Spacing.lg,
          }}
        >
          <SkeletonLoader
            width={200}
            height={24}
            style={{ marginBottom: Spacing.lg }}
          />
          <SkeletonLoader
            width="100%"
            height={120}
            style={{ marginBottom: Spacing.lg }}
          />
          <SkeletonLoader
            width="100%"
            height={200}
            style={{ marginBottom: Spacing.lg }}
          />
        </ScrollView>
      </View>
    );
  }

  if (error || !data?.debugData) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      >
        <View style={styles.errorContainer}>
          <Feather name="alert-circle" size={48} color={theme.textSecondary} />
          <ThemedText
            type="body"
            style={{ color: theme.textSecondary, marginTop: Spacing.md }}
          >
            No debug data available for this analysis
          </ThemedText>
        </View>
      </View>
    );
  }

  const { debugData } = data;
  const processingSeconds = (debugData.processingTimeMs / 1000).toFixed(1);

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
        <View style={[styles.banner, { backgroundColor: theme.primary }]}>
          <Feather name="code" size={20} color="#FFFFFF" />
          <ThemedText
            type="body"
            style={{ color: "#FFFFFF", marginLeft: Spacing.sm }}
          >
            Debug View - Developer Only
          </ThemedText>
        </View>

        <Card style={styles.section}>
          <ThemedText type="h3" style={styles.sectionTitle}>
            Processing Stats
          </ThemedText>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <ThemedText type="h2">{debugData.frameCount}</ThemedText>
              <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                Frames Extracted
              </ThemedText>
            </View>
            <View style={styles.statItem}>
              <ThemedText type="h2">{processingSeconds}s</ThemedText>
              <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                Processing Time
              </ThemedText>
            </View>
            <View style={styles.statItem}>
              <ThemedText type="h2">{debugData.metadata.duration}s</ThemedText>
              <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                Video Duration
              </ThemedText>
            </View>
          </View>
          {debugData.extractionMode && (
            <View
              style={[
                styles.modeBadge,
                {
                  backgroundColor:
                    debugData.extractionMode === "scene_change"
                      ? theme.success
                      : theme.primary,
                },
              ]}
            >
              <Feather
                name={
                  debugData.extractionMode === "scene_change" ? "film" : "clock"
                }
                size={14}
                color="#FFFFFF"
              />
              <ThemedText
                type="caption"
                style={{ color: "#FFFFFF", marginLeft: Spacing.xs }}
              >
                {debugData.extractionMode === "scene_change"
                  ? "Scene Detection"
                  : "Fixed FPS"}
              </ThemedText>
            </View>
          )}
        </Card>

        {debugData.timingReport && (
          <Card style={styles.section}>
            <ThemedText type="h3" style={styles.sectionTitle}>
              Timing Breakdown
            </ThemedText>
            <ThemedText
              type="caption"
              style={{ color: theme.textSecondary, marginBottom: Spacing.md }}
            >
              Per-stage timing for performance analysis
            </ThemedText>

            <View style={styles.timingGrid}>
              <View style={styles.timingRow}>
                <View style={styles.timingLabel}>
                  <Feather
                    name="download"
                    size={14}
                    color={theme.textSecondary}
                  />
                  <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                    Download
                  </ThemedText>
                </View>
                <ThemedText type="body" style={{ fontWeight: "600" }}>
                  {(debugData.timingReport.summary.download / 1000).toFixed(2)}s
                </ThemedText>
              </View>

              <View style={styles.timingRow}>
                <View style={styles.timingLabel}>
                  <Feather name="image" size={14} color={theme.textSecondary} />
                  <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                    Frame Extraction
                  </ThemedText>
                </View>
                <ThemedText type="body" style={{ fontWeight: "600" }}>
                  {(
                    debugData.timingReport.summary.frameExtraction / 1000
                  ).toFixed(2)}
                  s
                </ThemedText>
              </View>

              <View style={styles.timingRow}>
                <View style={styles.timingLabel}>
                  <Feather name="mic" size={14} color={theme.textSecondary} />
                  <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                    Audio Extraction
                  </ThemedText>
                </View>
                <ThemedText type="body" style={{ fontWeight: "600" }}>
                  {(
                    debugData.timingReport.summary.audioExtraction / 1000
                  ).toFixed(2)}
                  s
                </ThemedText>
              </View>

              <View style={styles.timingRow}>
                <View style={styles.timingLabel}>
                  <Feather name="cpu" size={14} color={theme.textSecondary} />
                  <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                    AI Analysis
                  </ThemedText>
                </View>
                <ThemedText type="body" style={{ fontWeight: "600" }}>
                  {(debugData.timingReport.summary.aiAnalysis / 1000).toFixed(
                    2,
                  )}
                  s
                </ThemedText>
              </View>

              <View style={styles.timingRow}>
                <View style={styles.timingLabel}>
                  <Feather
                    name="search"
                    size={14}
                    color={theme.textSecondary}
                  />
                  <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                    Product Matching
                  </ThemedText>
                </View>
                <ThemedText type="body" style={{ fontWeight: "600" }}>
                  {(
                    debugData.timingReport.summary.productMatching / 1000
                  ).toFixed(2)}
                  s
                </ThemedText>
              </View>

              <View style={styles.timingRow}>
                <View style={styles.timingLabel}>
                  <Feather
                    name="database"
                    size={14}
                    color={theme.textSecondary}
                  />
                  <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                    DB Operations
                  </ThemedText>
                </View>
                <ThemedText type="body" style={{ fontWeight: "600" }}>
                  {(debugData.timingReport.summary.dbOperations / 1000).toFixed(
                    2,
                  )}
                  s
                </ThemedText>
              </View>
            </View>

            {debugData.sceneTimestamps &&
              debugData.sceneTimestamps.length > 0 && (
                <View style={{ marginTop: Spacing.lg }}>
                  <ThemedText
                    type="caption"
                    style={{
                      color: theme.textSecondary,
                      marginBottom: Spacing.sm,
                    }}
                  >
                    Scene Keyframe Timestamps
                  </ThemedText>
                  <View
                    style={[
                      styles.textBlock,
                      { backgroundColor: theme.backgroundSecondary },
                    ]}
                  >
                    <ThemedText
                      type="small"
                      style={{ fontFamily: "monospace" }}
                    >
                      {debugData.sceneTimestamps
                        .map((t) => t.toFixed(1) + "s")
                        .join(", ")}
                    </ThemedText>
                  </View>
                </View>
              )}
          </Card>
        )}

        <Card style={styles.section}>
          <ThemedText type="h3" style={styles.sectionTitle}>
            Video Metadata
          </ThemedText>
          <View style={styles.metadataRow}>
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              Title
            </ThemedText>
            <ThemedText type="body" numberOfLines={2}>
              {debugData.metadata.title}
            </ThemedText>
          </View>
          <View style={styles.metadataRow}>
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              Platform
            </ThemedText>
            <ThemedText type="body">{debugData.metadata.platform}</ThemedText>
          </View>
          <View style={styles.metadataRow}>
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              Creator
            </ThemedText>
            <ThemedText type="body">{debugData.metadata.uploader}</ThemedText>
          </View>
          <View style={styles.metadataRow}>
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              Views
            </ThemedText>
            <ThemedText type="body">
              {debugData.metadata.viewCount.toLocaleString()}
            </ThemedText>
          </View>
          <View style={styles.metadataRow}>
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              Likes
            </ThemedText>
            <ThemedText type="body">
              {debugData.metadata.likeCount.toLocaleString()}
            </ThemedText>
          </View>
          <View style={styles.metadataRow}>
            <ThemedText type="caption" style={{ color: theme.textSecondary }}>
              Description
            </ThemedText>
            <ThemedText
              type="small"
              numberOfLines={10}
              style={{ marginTop: Spacing.xs }}
            >
              {debugData.metadata.description || "No description"}
            </ThemedText>
          </View>
        </Card>

        <Card style={styles.section}>
          <ThemedText type="h3" style={styles.sectionTitle}>
            Extracted Frames ({debugData.frames.length})
          </ThemedText>
          <ThemedText
            type="caption"
            style={{ color: theme.textSecondary, marginBottom: Spacing.md }}
          >
            These frames were sent to Gemini for analysis
          </ThemedText>
          <View style={styles.framesGrid}>
            {debugData.frames.map((frame, index) => (
              <View key={index} style={styles.frameContainer}>
                <Image
                  source={{ uri: frame }}
                  style={[
                    styles.frame,
                    { width: FRAME_SIZE, height: FRAME_SIZE * 0.75 },
                  ]}
                  resizeMode="cover"
                />
                <ThemedText type="caption" style={styles.frameLabel}>
                  Frame {index + 1}
                </ThemedText>
              </View>
            ))}
          </View>
        </Card>

        <Card style={styles.section}>
          <ThemedText type="h3" style={styles.sectionTitle}>
            Audio Transcript
          </ThemedText>
          <View
            style={[
              styles.textBlock,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <ThemedText type="small">
              {debugData.audioTranscript ||
                "No transcript available (audio extraction supported but transcription not yet implemented)"}
            </ThemedText>
          </View>
        </Card>

        <Card style={styles.section}>
          <ThemedText type="h3" style={styles.sectionTitle}>
            AI Prompt Sent
          </ThemedText>
          <ThemedText
            type="caption"
            style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}
          >
            This prompt was sent to Gemini along with the frames above
          </ThemedText>
          <View
            style={[
              styles.textBlock,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <ThemedText type="small" style={{ fontFamily: "monospace" }}>
              {debugData.aiPrompt}
            </ThemedText>
          </View>
        </Card>

        <Card style={styles.section}>
          <ThemedText type="h3" style={styles.sectionTitle}>
            Raw AI Response
          </ThemedText>
          <ThemedText
            type="caption"
            style={{ color: theme.textSecondary, marginBottom: Spacing.sm }}
          >
            Raw JSON response from Gemini
          </ThemedText>
          <View
            style={[
              styles.textBlock,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <ThemedText type="small" style={{ fontFamily: "monospace" }}>
              {debugData.aiResponse}
            </ThemedText>
          </View>
        </Card>

        {data.products && data.products.length > 0 ? (
          <Card style={styles.section}>
            <ThemedText type="h3" style={styles.sectionTitle}>
              Detected Products ({data.products.length})
            </ThemedText>
            <ThemedText
              type="caption"
              style={{ color: theme.textSecondary, marginBottom: Spacing.md }}
            >
              Products with evidence, confidence, and match scores
            </ThemedText>
            {data.products.map((product, index) => (
              <View
                key={product.id}
                style={[
                  styles.productCard,
                  {
                    backgroundColor: theme.backgroundSecondary,
                    borderLeftColor: getConfidenceColor(
                      product.aiConfidence,
                      theme,
                    ),
                  },
                ]}
              >
                <View style={styles.productHeader}>
                  <ThemedText
                    type="body"
                    numberOfLines={1}
                    style={{ flex: 1, fontWeight: "600" }}
                  >
                    {product.aiDetectedName}
                  </ThemedText>
                  {product.aiConfidence ? (
                    <View
                      style={[
                        styles.confidenceBadge,
                        {
                          backgroundColor: getConfidenceColor(
                            product.aiConfidence,
                            theme,
                          ),
                        },
                      ]}
                    >
                      <ThemedText type="caption" style={{ color: "#FFFFFF" }}>
                        {(parseFloat(product.aiConfidence) * 100).toFixed(0)}%
                      </ThemedText>
                    </View>
                  ) : null}
                </View>

                <View style={styles.productMeta}>
                  {product.aiDetectedBrand ? (
                    <ThemedText
                      type="caption"
                      style={{ color: theme.textSecondary }}
                    >
                      Brand: {product.aiDetectedBrand}
                    </ThemedText>
                  ) : null}
                  {product.aiDetectedType ? (
                    <ThemedText
                      type="caption"
                      style={{ color: theme.textSecondary }}
                    >
                      Type: {product.aiDetectedType}
                    </ThemedText>
                  ) : null}
                  {product.aiDetectedColor ? (
                    <ThemedText
                      type="caption"
                      style={{ color: theme.textSecondary }}
                    >
                      Color: {product.aiDetectedColor}
                    </ThemedText>
                  ) : null}
                </View>

                {product.aiEvidence ? (
                  <View style={styles.evidenceSection}>
                    <ThemedText
                      type="caption"
                      style={{ color: theme.primary, marginBottom: Spacing.xs }}
                    >
                      Evidence:
                    </ThemedText>
                    {(product.aiEvidence as ProductEvidence).visual ? (
                      <View style={styles.evidenceRow}>
                        <Feather
                          name="eye"
                          size={12}
                          color={theme.textSecondary}
                        />
                        <ThemedText
                          type="small"
                          style={{
                            color: theme.textSecondary,
                            marginLeft: Spacing.xs,
                            flex: 1,
                          }}
                        >
                          {(product.aiEvidence as ProductEvidence).visual}
                        </ThemedText>
                      </View>
                    ) : null}
                    {(product.aiEvidence as ProductEvidence).audio ? (
                      <View style={styles.evidenceRow}>
                        <Feather
                          name="headphones"
                          size={12}
                          color={theme.textSecondary}
                        />
                        <ThemedText
                          type="small"
                          style={{
                            color: theme.textSecondary,
                            marginLeft: Spacing.xs,
                            flex: 1,
                          }}
                        >
                          {(product.aiEvidence as ProductEvidence).audio}
                        </ThemedText>
                      </View>
                    ) : null}
                    {(product.aiEvidence as ProductEvidence).metadata ? (
                      <View style={styles.evidenceRow}>
                        <Feather
                          name="file-text"
                          size={12}
                          color={theme.textSecondary}
                        />
                        <ThemedText
                          type="small"
                          style={{
                            color: theme.textSecondary,
                            marginLeft: Spacing.xs,
                            flex: 1,
                          }}
                        >
                          {(product.aiEvidence as ProductEvidence).metadata}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.normalizedSection}>
                  <ThemedText
                    type="caption"
                    style={{ color: theme.primary, marginBottom: Spacing.xs }}
                  >
                    Normalized:
                  </ThemedText>
                  <ThemedText
                    type="small"
                    style={{ color: theme.textSecondary }}
                  >
                    Brand: {product.normalizedBrandSlug || "unknown"} |
                    Category: {product.normalizedCategoryKey || "unknown"}
                  </ThemedText>
                  {product.normalizedNameTokens ? (
                    <ThemedText
                      type="small"
                      style={{ color: theme.textSecondary }}
                    >
                      Tokens: [
                      {(product.normalizedNameTokens as string[]).join(", ")}]
                    </ThemedText>
                  ) : null}
                </View>

                {product.matchedProductName ? (
                  <View
                    style={[
                      styles.matchSection,
                      { borderTopColor: theme.border },
                    ]}
                  >
                    <ThemedText
                      type="caption"
                      style={{ color: theme.success, marginBottom: Spacing.xs }}
                    >
                      Matched Product:
                    </ThemedText>
                    <ThemedText type="small" style={{ fontWeight: "600" }}>
                      {product.matchedProductBrand} -{" "}
                      {product.matchedProductName}
                    </ThemedText>
                    {product.matchScore ? (
                      <View style={styles.scoreGrid}>
                        <View style={styles.scoreItem}>
                          <ThemedText
                            type="caption"
                            style={{ color: theme.textSecondary }}
                          >
                            Overall
                          </ThemedText>
                          <ThemedText type="body" style={{ fontWeight: "600" }}>
                            {(
                              (product.matchScore as MatchScore).overall * 100
                            ).toFixed(0)}
                            %
                          </ThemedText>
                        </View>
                        <View style={styles.scoreItem}>
                          <ThemedText
                            type="caption"
                            style={{ color: theme.textSecondary }}
                          >
                            Brand
                          </ThemedText>
                          <ThemedText type="body">
                            {(
                              (product.matchScore as MatchScore).brandMatch *
                              100
                            ).toFixed(0)}
                            %
                          </ThemedText>
                        </View>
                        <View style={styles.scoreItem}>
                          <ThemedText
                            type="caption"
                            style={{ color: theme.textSecondary }}
                          >
                            Type
                          </ThemedText>
                          <ThemedText type="body">
                            {(
                              (product.matchScore as MatchScore).typeMatch * 100
                            ).toFixed(0)}
                            %
                          </ThemedText>
                        </View>
                        <View style={styles.scoreItem}>
                          <ThemedText
                            type="caption"
                            style={{ color: theme.textSecondary }}
                          >
                            Name
                          </ThemedText>
                          <ThemedText type="body">
                            {(
                              (product.matchScore as MatchScore).nameMatch * 100
                            ).toFixed(0)}
                            %
                          </ThemedText>
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View
                    style={[
                      styles.matchSection,
                      { borderTopColor: theme.border },
                    ]}
                  >
                    <ThemedText type="caption" style={{ color: theme.warning }}>
                      No match found in catalog
                    </ThemedText>
                  </View>
                )}
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

function getConfidenceColor(confidence: string | null, theme: any): string {
  if (!confidence) return theme.textSecondary;
  const value = parseFloat(confidence);
  if (value >= 0.8) return theme.success;
  if (value >= 0.5) return theme.warning;
  return theme.error;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing["3xl"],
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.xl,
    padding: Spacing.lg,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statItem: {
    alignItems: "center",
  },
  metadataRow: {
    marginBottom: Spacing.md,
  },
  framesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  frameContainer: {
    alignItems: "center",
  },
  frame: {
    borderRadius: BorderRadius.xs,
  },
  frameLabel: {
    marginTop: Spacing.xs,
    opacity: 0.7,
  },
  textBlock: {
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    maxHeight: 300,
  },
  productCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
  },
  productHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  confidenceBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
    marginLeft: Spacing.sm,
  },
  productMeta: {
    marginBottom: Spacing.sm,
  },
  evidenceSection: {
    marginBottom: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  evidenceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.xs,
  },
  normalizedSection: {
    marginBottom: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  matchSection: {
    borderTopWidth: 1,
    paddingTop: Spacing.sm,
    marginTop: Spacing.sm,
  },
  scoreGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  scoreItem: {
    alignItems: "center",
  },
  modeBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
    marginTop: Spacing.md,
  },
  timingGrid: {
    gap: Spacing.xs,
  },
  timingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  timingLabel: {
    flexDirection: "row",
    alignItems: "center",
  },
});

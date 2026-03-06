import React from "react";
import { View, StyleSheet } from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import type { TutorialStep as TutorialStepType } from "@shared/schema";

interface TutorialStepProps {
  step: TutorialStepType;
  testID?: string;
}

export function TutorialStep({ step, testID }: TutorialStepProps) {
  const { theme } = useTheme();

  return (
    <View
      style={[styles.container, { backgroundColor: theme.backgroundDefault }]}
      testID={testID}
    >
      <View style={[styles.stepNumber, { backgroundColor: theme.primary }]}>
        <ThemedText type="body" style={{ color: "#FFFFFF", fontWeight: "700" }}>
          {step.stepNumber}
        </ThemedText>
      </View>
      <View style={styles.content}>
        <ThemedText type="body" style={styles.instruction}>
          {step.instruction}
        </ThemedText>
        <View style={styles.meta}>
          {step.timestamp ? (
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {step.timestamp}
            </ThemedText>
          ) : null}
          {step.productUsed ? (
            <View style={[styles.productBadge, { backgroundColor: theme.primary + "15" }]}>
              <ThemedText type="caption" style={{ color: theme.primary }}>
                {step.productUsed}
              </ThemedText>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    gap: Spacing.md,
    alignItems: "flex-start",
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
  },
  instruction: {
    marginBottom: Spacing.sm,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  productBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
});

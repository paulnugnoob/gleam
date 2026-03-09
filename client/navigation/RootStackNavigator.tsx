import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import VideoAnalysisScreen from "@/screens/VideoAnalysisScreen";
import LookDetailScreen from "@/screens/LookDetailScreen";
import ProductDetailScreen from "@/screens/ProductDetailScreen";
import ShoppingListScreen from "@/screens/ShoppingListScreen";
import SelfieCaptureScreen from "@/screens/SelfieCaptureScreen";
import DebugAnalysisScreen from "@/screens/DebugAnalysisScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import type { VideoAnalysis, DetectedProduct } from "@shared/schema";

export type RootStackParamList = {
  Main: undefined;
  VideoAnalysis: { videoUrl: string; analysisId?: number };
  LookDetail: { lookId: number; analysisId: number; title: string };
  ProductDetail: { product: DetectedProduct };
  ShoppingList: {
    look: { id: number; title: string; videoAnalysisId: number };
  };
  SelfieCapture: undefined;
  DebugAnalysis: { analysisId: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Main"
        component={MainTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="VideoAnalysis"
        component={VideoAnalysisScreen}
        options={{
          presentation: "modal",
          headerTitle: "Creating Look",
        }}
      />
      <Stack.Screen
        name="LookDetail"
        component={LookDetailScreen}
        options={({ route }) => ({
          headerTitle: route.params.title || "Look",
        })}
      />
      <Stack.Screen
        name="ProductDetail"
        component={ProductDetailScreen}
        options={{
          headerTitle: "Product",
        }}
      />
      <Stack.Screen
        name="ShoppingList"
        component={ShoppingListScreen}
        options={{
          headerTitle: "Shopping List",
        }}
      />
      <Stack.Screen
        name="SelfieCapture"
        component={SelfieCaptureScreen}
        options={{
          presentation: "fullScreenModal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="DebugAnalysis"
        component={DebugAnalysisScreen}
        options={{
          headerTitle: "Debug Analysis",
        }}
      />
    </Stack.Navigator>
  );
}

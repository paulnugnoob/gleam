import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import AnalyzeScreen from "@/screens/AnalyzeScreen";
import { HeaderTitle } from "@/components/HeaderTitle";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type AnalyzeStackParamList = {
  Analyze: undefined;
};

const Stack = createNativeStackNavigator<AnalyzeStackParamList>();

export default function AnalyzeStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Analyze"
        component={AnalyzeScreen}
        options={{
          headerTitle: () => <HeaderTitle title="Gleam" />,
        }}
      />
    </Stack.Navigator>
  );
}

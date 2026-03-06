import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import LookbookScreen from "@/screens/LookbookScreen";
import { HeaderTitle } from "@/components/HeaderTitle";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type LookbookStackParamList = {
  Lookbook: undefined;
};

const Stack = createNativeStackNavigator<LookbookStackParamList>();

export default function LookbookStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Lookbook"
        component={LookbookScreen}
        options={{
          headerTitle: () => <HeaderTitle title="Gleam" />,
        }}
      />
    </Stack.Navigator>
  );
}

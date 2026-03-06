import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MyLooksScreen from "@/screens/MyLooksScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type MyLooksStackParamList = {
  MyLooks: undefined;
};

const Stack = createNativeStackNavigator<MyLooksStackParamList>();

export default function MyLooksStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="MyLooks"
        component={MyLooksScreen}
        options={{
          headerTitle: "My Looks",
        }}
      />
    </Stack.Navigator>
  );
}

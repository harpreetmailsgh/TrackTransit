


import { Tabs } from 'expo-router';
import CustomTabBar from '../../components/CustomTabBar';
import { LoadingProvider, useLoading } from '../../contexts/LoadingContext';



function TabsLayoutInner() {
  const { loading } = useLoading();
  return (
    <Tabs
      tabBar={props => (loading ? null : <CustomTabBar {...props} />)}
      screenOptions={({ route }) => ({
        header: () => null, // Remove header entirely
      })}
    >
      <Tabs.Screen name="index" options={{ tabBarLabel: 'Stops' }} />
      <Tabs.Screen name="search" options={{ tabBarLabel: 'Search' }} />
      <Tabs.Screen name="saved" options={{ tabBarLabel: 'Saved' }} />
    </Tabs>
  );
}

export default function TabsLayout() {
  return (
    <LoadingProvider>
      <TabsLayoutInner />
    </LoadingProvider>
  );
}

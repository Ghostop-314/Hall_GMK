import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const SkeletonItem = () => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 1000, // Speed of the shimmer
        easing: Easing.linear,
        useNativeDriver: true, // Set to false if using non-layout/transform properties
      })
    ).start();
  }, [animatedValue]);

  const translateX = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200], // Adjust based on the width of your skeleton item
  });

  return (
    <View style={styles.container}>
      <View style={styles.hallNamePlaceholder} />
      <View style={styles.slotsContainerPlaceholder}>
        <View style={styles.slotPlaceholder} />
        <View style={styles.slotPlaceholder} />
      </View>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [{ translateX }],
          },
        ]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(255, 255, 255, 0.1)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2C2C2E', // Dark gray, similar to your item background
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    overflow: 'hidden', // Important for the shimmer effect
  },
  hallNamePlaceholder: {
    backgroundColor: '#48484A', // Slightly lighter gray
    height: 20,
    width: '60%',
    borderRadius: 4,
    marginBottom: 10,
  },
  slotsContainerPlaceholder: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  slotPlaceholder: {
    backgroundColor: '#48484A',
    height: 40,
    width: '48%',
    borderRadius: 8,
  },
});

export default SkeletonItem;

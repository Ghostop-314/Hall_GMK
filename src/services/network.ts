// Network and connection utilities to handle Java IO section errors and connectivity issues
import { Alert, Platform } from 'react-native';
import { getDevServerUrl, logErrorForAnalytics } from './updates';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Handle NetInfo import safely with fallback to mock
// Updated for compatibility with @react-native-community/netinfo v11.4.1
let NetInfo: any;
try {
  NetInfo = require('@react-native-community/netinfo');
} catch (error) {
  console.warn('NetInfo package not available, using mock implementation');
  NetInfo = require('./__mocks__/netinfo').default;
}

// Cache key for storing hall data
const HALL_DATA_CACHE_KEY = 'hallDataCache';

// Save data to cache
const cacheHallData = async (date: Date, data: string) => {
  const key = `${HALL_DATA_CACHE_KEY}_${date.toISOString().split('T')[0]}`;
  try {
    await AsyncStorage.setItem(key, data);
    console.log(`Cached hall data for ${date}`);
  } catch (e) {
    console.warn('Failed to cache hall data:', e);
  }
};

// Load data from cache
const loadCachedHallData = async (date: Date): Promise<string | null> => {
  const key = `${HALL_DATA_CACHE_KEY}_${date.toISOString().split('T')[0]}`;
  try {
    return await AsyncStorage.getItem(key);
  } catch (e) {
    console.warn('Failed to load cached hall data:', e);
    return null;
  }
};

// Check if we can reach the internet
export const checkInternetConnectivity = async (): Promise<boolean> => {
  try {
    // Updated for NetInfo v11.4.1
    const netInfo = await NetInfo.fetch();
    console.log('Network connectivity state:', netInfo);
    
    // Check both connection and reachability for best reliability
    return (netInfo.isConnected && netInfo.isInternetReachable) ?? false;
  } catch (error) {
    console.error('Error checking internet connectivity:', error);
    return false;
  }
};

// Retry a network request with exponential backoff and specific error handling for Java IO errors
export const retryNetworkRequest = async <T>(
  requestFn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: Error) => boolean;
    onRetry?: (attempt: number, error: Error) => void;
  }
): Promise<T> => {
  const maxRetries = options?.maxRetries ?? 3;
  const initialDelayMs = options?.initialDelayMs ?? 1000;
  const maxDelayMs = options?.maxDelayMs ?? 10000;
  
  // Default retry condition includes Java IO section errors
  const shouldRetry = options?.shouldRetry ?? ((error: Error) => {
    const errorMessage = error.message.toLowerCase();
    return (
      errorMessage.includes('java.io') ||
      errorMessage.includes('section') ||
      errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('connection')
    );
  });
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const data = await requestFn();
      // Cache successful fetch
      if (requestFn.name === 'fetchHallData') {
        await cacheHallData((requestFn as any).date, JSON.stringify(data));
      }
      return data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Log the error for analytics
      logErrorForAnalytics(lastError, `networkRetry-attempt-${attempt + 1}`);
      
      // Special handling for Java IO section errors
      if (lastError.message.toLowerCase().includes('java.io') || 
          lastError.message.toLowerCase().includes('section')) {
        console.warn(`Java IO section error detected on attempt ${attempt + 1}:`, lastError);
        
        // For specific Java IO errors, we might want to abort retrying
        if (lastError.message.includes('Java.io.IOException: Cleartext HTTP traffic') && 
            Platform.OS === 'android') {
          Alert.alert(
            'Security Restriction',
            'This device is blocking non-secure connections. Please contact support.',
            [{ text: 'OK' }]
          );
          throw lastError; // Don't retry security-related errors
        }
      }
      
      // On last attempt, try cached data
      if (attempt === maxRetries - 1) {
        const cached = await loadCachedHallData((requestFn as any).date);
        if (cached) {
          console.log('Using cached hall data due to network failure');
          return JSON.parse(cached) as T;
        }
      }
      
      // Check if we should retry based on the error
      if (!shouldRetry(lastError) || attempt >= maxRetries - 1) {
        throw lastError;
      }
      
      // Notify about the retry attempt
      if (options?.onRetry) {
        options.onRetry(attempt + 1, lastError);
      }
      
      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        initialDelayMs * Math.pow(2, attempt), 
        maxDelayMs
      ) + Math.random() * 1000;
      
      console.log(`Retrying network request in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // This should never be reached because the last failed attempt will throw
  throw lastError ?? new Error('Unknown error during network request');
};

// Special handling for Java IO section errors when connecting to the dev server
export const handleDevServerConnection = async (): Promise<boolean> => {
  try {
    // First check if we have internet connectivity
    const hasInternet = await checkInternetConnectivity();
    if (!hasInternet) {
      console.log('No internet connectivity detected');
      return false;
    }
    
    // Try to ping the dev server
    const devServerUrl = getDevServerUrl();
    console.log(`Testing connection to dev server: ${devServerUrl}`);
    
    // Use the retryNetworkRequest utility for better error handling
    await retryNetworkRequest(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        try {
          const response = await fetch(`${devServerUrl}/status`, { 
            signal: controller.signal 
          });
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`Dev server returned status: ${response.status}`);
          }
          
          return true;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      },
      {
        maxRetries: 2,
        initialDelayMs: 500,
        onRetry: (attempt, error) => {
          console.log(`Dev server connection retry ${attempt}: ${error.message}`);
        }
      }
    );
    
    console.log('Successfully connected to development server');
    return true;
  } catch (error) {
    console.error('Failed to connect to development server:', error);
    return false;
  }
};

// We need to ensure we're using the correct connection method for your device
import { Platform, NativeModules } from 'react-native';
import * as Updates from 'expo-updates';
import * as Application from 'expo-application';

// Helper function to manually trigger an update check and reload
export const checkForUpdatesAndReload = async () => {
  try {
    // Check if we're in development or production
    if (!__DEV__) {
      console.log('Checking for updates in production mode...');
      const update = await Updates.checkForUpdateAsync();
      
      if (update.isAvailable) {
        console.log('Update available, downloading...');
        // Add timeouts to prevent indefinite waiting
        const fetchPromise = Updates.fetchUpdateAsync();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Update download timed out')), 30000)
        );
        
        // Race between the fetch and timeout
        await Promise.race([fetchPromise, timeoutPromise]);
        
        console.log('Update downloaded, reloading app...');
        // Reload the app with the new update
        await Updates.reloadAsync();
      } else {
        console.log('No updates available');
      }
    } else {
      // In development mode, we can try to reconnect to Metro bundler
      console.log('App is in development mode, checking connection to Metro...');
      
      // For development, let's verify connection to Metro
      try {
        // A simple test to check if Metro is reachable
        const testUrl = `${getDevServerUrl()}/status`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        console.log(`Testing connection to Metro at: ${testUrl}`);
        const response = await fetch(testUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          console.log('Successfully connected to Metro development server');
        } else {
          console.warn('Metro connection test returned non-OK status:', response.status);
        }
      } catch (metroError) {
        console.warn('Could not connect to Metro development server:', metroError);
        // We don't throw here, just log the warning
      }
    }
    return true;
  } catch (error) {
    console.error('Error checking for updates:', error);
    
    // Log more detailed error information for debugging
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        name: error.name,
        stack: error.stack
      });
    }
    
    return false;
  }
};

// Get the development server IP address dynamically
export const getLocalIpAddress = () => {
  try {
    // Prefer IP provided via app.config.js extra
    const Constants = require('expo-constants').default;
    const extraIp = Constants.expoConfig?.extra?.localIpAddress;
    if (extraIp) {
      console.log(`Using local IP from config.extra: ${extraIp}`);
      return extraIp;
    }
  } catch {
    // expo-constants not available
  }

  try {
    // On Android, try Expo SourceCode constants
    if (Platform.OS === 'android') {
      const debugURL = NativeModules.SourceCode?.getConstants()?.debugURL;
      if (debugURL) {
        const hostname = new URL(debugURL).hostname;
        if (hostname && hostname !== 'localhost') {
          return hostname;
        }
      }
      const serverHost = NativeModules.SourceCode?.getConstants()?.serverHost;
      if (serverHost) {
        return serverHost.split(':')[0];
      }
    }

    // On iOS, try SourceCode constants
    if (Platform.OS === 'ios') {
      const sourceBundleHost = NativeModules.SourceCode?.getConstants()?.sourceBundleHost;
      if (sourceBundleHost) {
        return sourceBundleHost;
      }
      const scriptURL = NativeModules.SourceCode?.getConstants()?.scriptURL;
      if (scriptURL) {
        const match = scriptURL.match(/https?:\/\/([^:]+):/);
        if (match?.[1]) {
          return match[1];
        }
      }
    }

    // Use fallback IPs if everything else fails
    const fallbackIPs = ['192.168.0.1','192.168.1.1','192.168.0.113','10.0.2.2','localhost','127.0.0.1'];
    return fallbackIPs[0];
  } catch (error) {
    console.error('Error determining IP address:', error);
    return '127.0.0.1';
  }
};

// Get the Expo server URL based on the current environment
export const getDevServerUrl = () => {
  const ipAddress = getLocalIpAddress();
  console.log(`Using IP address for development server: ${ipAddress}`);
  
  // Check if there's an explicitly set port from Expo
  let port = '8081'; // Default Metro port
  try {
    // Try to get port from Expo environment if available
    const Constants = require('expo-constants').default;
    const manifestUrl = Constants.manifest?.hostUri || Constants.expoConfig?.hostUri;
    if (manifestUrl) {
      const match = manifestUrl.match(/:(\d+)/);
      if (match && match[1]) {
        port = match[1];
        console.log(`Found Expo manifest port: ${port}`);
      }
    }
  } catch (e) {
    console.log('Could not get Expo port from Constants, using default');
  }
  
  // Fallback ports to try - we've seen 8081, 8082, 8083 in use
  const ports = [port, '8081', '8082', '8083'];
  
  // This is the URL format that the Expo server uses
  const baseUrl = Platform.select({
    ios: `exp://${ipAddress}:${ports[0]}`,
    android: `exp://${ipAddress}:${ports[0]}`,
    default: `exp://${ipAddress}:${ports[0]}`,
  });
  
  console.log(`Development server URL: ${baseUrl}`);
  
  // Also log alternate URLs for troubleshooting
  ports.slice(1).forEach(altPort => {
    console.log(`Alternative server URL: exp://${ipAddress}:${altPort}`);
  });
  
  return baseUrl;
};

// Function to verify a connection to the dev server
export const verifyDevServerConnection = async (): Promise<boolean> => {
  if (!__DEV__) return true;

  try {
    // Determine host and port for Metro status endpoint
    const ipAddress = getLocalIpAddress();
    let port = '8081';
    try {
      const Constants = require('expo-constants').default;
      const hostUri = Constants.manifest?.hostUri || Constants.expoConfig?.hostUri;
      const match = hostUri?.match(/:(\d+)/);
      if (match?.[1]) {
        port = match[1];
      }
    } catch {
      // fallback to default
    }

    const statusUrl = `http://${ipAddress}:${port}/status`;
    console.log(`Verifying connection to Metro status endpoint: ${statusUrl}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(statusUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    return response.ok;
  } catch (error) {
    console.warn('Failed to verify dev server connection:', error);
    return false;
  }
};

// Detect error types to provide targeted troubleshooting
export const detectErrorType = (error: Error | unknown): 'network' | 'java-io' | 'update' | 'general' => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStr = errorMessage.toLowerCase();
  
  // Look for specific patterns in error messages
  if (errorStr.includes('java.io.') || 
      errorStr.includes('java io section') || 
      errorStr.includes('section')) {
    return 'java-io';
  }
  
  if (errorStr.includes('network') || 
      errorStr.includes('unable to resolve host') || 
      errorStr.includes('econnrefused') || 
      errorStr.includes('connection') ||
      errorStr.includes('timeout')) {
    return 'network';
  }
  
  if (errorStr.includes('update') || 
      errorStr.includes('download') || 
      errorStr.includes('fetch')) {
    return 'update';
  }
  
  return 'general';
};

// Handle specific Java IO section errors that occur on physical devices
export const handleJavaIOError = async () => {
  console.log('Handling Java IO section error...');
  
  try {
    // Clear any in-memory cache
    if (typeof (global as any).gc === 'function') {
      (global as any).gc();
      console.log('Garbage collection triggered');
    }
    
    // For production builds with expo-updates
    if (!__DEV__ && Updates.reloadAsync) {
      console.log('Attempting to reload the app...');
      await Updates.reloadAsync();
      return true;
    }
    
    // For development mode
    if (__DEV__) {
      // First try to resolve network connectivity issues
      if (Platform.OS === 'android') {
        // On Android physical devices, explicitly reset the connection
        try {
          // Try to enable ADB reverse port forwarding
          console.log('Attempting to fix connection for Android physical device...');
          
          // Try multiple server ports
          const portsToTry = ['8081', '8082', '8083'];
          let foundWorkingPort = false;
          
          for (const port of portsToTry) {
            try {
              // Check if we can connect to this port
              const testUrl = `http://localhost:${port}/status`;
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 3000);
              
              const response = await fetch(testUrl, { signal: controller.signal });
              clearTimeout(timeoutId);
              
              if (response.ok) {
                console.log(`Found working Metro server on port ${port}`);
                foundWorkingPort = true;
                break;
              }
            } catch (portError) {
              console.log(`Port ${port} test failed:`, portError);
            }
          }
          
          // If we found a working port, try to verify connection again
          if (foundWorkingPort) {
            return await verifyDevServerConnection();
          }
        } catch (adbError) {
          console.warn('Error trying to reset Android connection:', adbError);
        }
      }
      
      // Try to verify connection to dev server
      const isConnected = await verifyDevServerConnection();
      console.log(`Dev server connection check result: ${isConnected ? 'Connected' : 'Failed'}`);
      return isConnected;
    }
    
    return false;
  } catch (error) {
    console.error('Error handling Java IO section error:', error);
    return false;
  }
};

// Type definition for error details
interface ErrorDetails {
  type: 'network' | 'java-io' | 'update' | 'general';
  message: string;
  context: string;
  timestamp: string;
  appVersion: string;
  platform: string;
  platformVersion: number | string;
}

// Declare a global namespace to extend global object
declare global {
  var _lastErrorDetails: ErrorDetails | undefined;
}

// Function to save error information for analytics/debugging
export const logErrorForAnalytics = (error: Error | unknown, context: string) => {
  try {
    const errorType = detectErrorType(error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDetails: ErrorDetails = {
      type: errorType,
      message: errorMessage,
      context,
      timestamp: new Date().toISOString(),
      appVersion: Application.nativeApplicationVersion || 'unknown',
      platform: Platform.OS,
      platformVersion: Platform.Version
    };
    
    // Log the error details for now (in a real app, you might send this to a server)
    console.log('Error analytics:', JSON.stringify(errorDetails, null, 2));
    
    // Save error details to check if we're seeing repeated errors
    // In a production app, you would use AsyncStorage or similar
    global._lastErrorDetails = errorDetails;
    
    return errorType;
  } catch (logError) {
    console.error('Error in logErrorForAnalytics:', logError);
    return 'general';
  }
};

// Provide troubleshooting steps for common errors
export const getTroubleshootingSteps = (errorType?: 'network' | 'java-io' | 'update' | 'general') => {
  const commonSteps = [
    "Make sure your device and computer are on the same WiFi network",
    "Try turning off mobile data and only use WiFi",
    "Restart the Expo server (npm start --clear)",
    "Close and reopen the Expo Go app"
  ];
  
  const networkSteps = [
    ...commonSteps,
    "Check if your WiFi has client isolation turned on (prevents devices from communicating)",
    "Try connecting to a different WiFi network",
    "For Android physical devices, run 'adb reverse tcp:8081 tcp:8081' command on your computer",
    "Try disabling VPNs or firewalls that might block connections",
    "Verify that your computer's firewall is not blocking Metro bundler"
  ];
  
  const javaIoSteps = [
    ...commonSteps,
    "Clear the Expo Go app cache (Settings > Apps > Expo Go > Storage > Clear Cache)",
    "Uninstall and reinstall the Expo Go app",
    "For physical Android devices, try using the Expo Go Development build instead of the regular app",
    "Enable Developer Mode and USB Debugging on your Android device and try using a USB connection",
    "If using Android, try setting Metro server port in app.json to 8083",
    "Try using an IP address instead of hostname when connecting to the server",
    "Check Android Logcat for specific Java errors and search for solutions online"
  ];
  
  const updateSteps = [
    "Restart your device",
    "Ensure you have a stable internet connection",
    "Check that you have enough storage space on your device",
    "Try using a different network connection (e.g., switch from WiFi to mobile data)",
    "For development builds, try rebuilding with 'expo run:android --device' or 'expo run:ios'",
    "If using Expo Go, check that your app is compatible with the installed Expo Go version",
    "Make sure you're using the latest SDK version and all dependencies are up to date"
  ];
  
  // Return steps based on error type
  switch (errorType) {
    case 'network':
      return networkSteps;
    case 'java-io':
      return javaIoSteps;
    case 'update':
      return updateSteps;
    case 'general':
    default:
      return commonSteps;
  }
};

// Dynamic configuration file for Expo that provides additional configuration options
const pkg = require('./package.json');
const path = require('path');
const fs = require('fs');

// Try to get local IP address
const getLocalIpAddress = () => {
  try {
    const { networkInterfaces } = require('os');
    const interfaces = networkInterfaces();
    for (const devName in interfaces) {
      const iface = interfaces[devName];
      for (let i = 0; i < iface.length; i++) {
        const alias = iface[i];
        if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
          return alias.address;
        }
      }
    }
    return '192.168.1.100'; // fallback
  } catch (e) {
    return '192.168.1.100'; // ultimate fallback
  }
};

module.exports = ({ config }) => {
  // Get machine's local IP for dev server
  const localIp = getLocalIpAddress();
  
  // Set a base configuration
  const baseConfig = {
    ...config,
    name: config.name || 'Hall Availability',
    version: pkg.version,
    orientation: 'portrait',
    // Ensure splash screen works properly
    splash: {
      ...config.splash,
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    // Configure updates behavior with increased timeouts for slower connections
    updates: {
      enabled: true,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 15000, // Increased to 15 seconds for slower connections
      url: process.env.EXPO_UPDATE_URL,
    },
    // Enhanced error handling for development
    extra: {
      ...config.extra,
      enableJavaIoErrorHandling: true,
      enableDetailedLogging: true,
      localIpAddress: localIp, // Make IP available to app
      eas: {
        projectId: process.env.EXPO_PROJECT_ID || "your-project-id"
      }
    },
    // Custom androidNavigationBar settings for better UX
    androidNavigationBar: {
      visible: 'sticky-immersive',
      barStyle: 'dark-content',
      backgroundColor: '#FFFFFF',
    },
  };

  // Platform-specific configurations
  if (config.android) {
    baseConfig.android = {
      ...config.android,
      // Configure the dev server to avoid Java IO section errors
      devServer: {
        // Try to use a different port to avoid conflicts
        port: 8083,
        host: localIp, // Explicitly set host for physical devices
        // Increase timeouts to handle slower physical device connections
        pollingIntervalMillis: 5000, // Poll for changes less frequently
        retryTimeoutMillis: 10000, // Wait longer before timing out 
      },
      // Enable adaptive navigation components
      navigationBarColor: 'transparent',
      softwareKeyboardLayoutMode: 'pan',
      // Set network security config for allowing local connections
      networkSecurityConfig: {
        cleartextTrafficPermitted: true, // Allow cleartext traffic for development
      },
      // Add package configuration for improved stability
      package: config.android?.package || "com.hallavailability.app",
    };
  }

  // Configure iOS-specific settings
  if (config.ios) {
    baseConfig.ios = {
      ...config.ios,
      // Enable background updates
      infoPlist: {
        ...config?.ios?.infoPlist,
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true, // For development only - allows local server connections
          NSExceptionDomains: {
            localhost: {
              NSExceptionAllowsInsecureHTTPLoads: true,
            },
          },
        },
      },
    };
  }

  return baseConfig;
};

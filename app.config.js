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
  
  return {
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
        projectId: 'd6564d27-824e-4a00-9874-1720ed49a913',
      }
    },
    // Custom androidNavigationBar settings for better UX
    androidNavigationBar: {
      visible: 'sticky-immersive',
      barStyle: 'dark-content',
      backgroundColor: '#FFFFFF',
    },
    android: {
      package: "com.yourdomain.hallavailability"
    },
    ios: {
      bundleIdentifier: "com.yourdomain.hallavailability",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false
      }
    }
  };
};

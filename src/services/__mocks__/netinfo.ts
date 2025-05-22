// Mock implementation of NetInfo for cases where the actual library fails to import
// Updated for compatibility with @react-native-community/netinfo v11.4.1
const MockNetInfo = {
  fetch: async () => ({
    isConnected: true,
    isInternetReachable: true,
    type: 'wifi',
    isWifiEnabled: true,
    details: {
      isConnectionExpensive: false,
      cellularGeneration: '4g',
      carrier: 'unknown',
      strength: 4,
    }
  }),
  
  addEventListener: (listener: (state: any) => void) => {
    // Return a function to unsubscribe
    return () => {};
  },
  
  useNetInfo: () => ({
    type: 'wifi',
    isConnected: true,
    isInternetReachable: true,
    details: {
      isConnectionExpensive: false,
      cellularGeneration: '4g',
    }
  }),
  
  configure: (options: any) => {},
};

export default MockNetInfo;

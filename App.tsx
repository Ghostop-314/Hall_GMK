import React, { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  SafeAreaView,
  Modal,
  ActivityIndicator,
  FlatList,
  Alert,
  Linking,
  TextInput // Added TextInput
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage'; // Added AsyncStorage
import { fetchHallData, formatDate } from './src/services/api';
import { HallData } from './src/types';
import {
  checkForUpdatesAndReload,
  getDevServerUrl,
  getTroubleshootingSteps,
  handleJavaIOError,
  logErrorForAnalytics,
  detectErrorType,
  verifyDevServerConnection
} from './src/services/updates';
import { LinearGradient } from 'expo-linear-gradient'; // Import LinearGradient
import { BlurView } from 'expo-blur'; // Import BlurView for iOS-like frosted glass

// Initialize environment variables check
const apiKey = process.env.EXPO_PUBLIC_GOOGLE_SHEETS_API_KEY;
console.log('App initialized with API KEY:', apiKey ? 'Set correctly' : 'NOT SET - Check .env file');
console.log('Development server URL:', __DEV__ ? getDevServerUrl() : 'Production mode');

const ITEMS_PER_PAGE = 20;
const AUTH_PASSWORD = "1M@GMK#"; // Defined password
const AUTH_STORAGE_KEY = "@gmk_hall_app_authenticated"; // AsyncStorage key

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isCheckingAuth, setIsCheckingAuth] = useState(true); // To show loading while checking auth

  const [date, setDate] = useState(new Date());
  const [tempDate, setTempDate] = useState(new Date()); // For iOS date picker
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [halls, setHalls] = useState<HallData[]>([]);
  const [displayedHalls, setDisplayedHalls] = useState<HallData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [networkError, setNetworkError] = useState(false);
  const [errorType, setErrorType] = useState<'network' | 'java-io' | 'update' | 'general' | null>(null);
  const [errorDetails, setErrorDetails] = useState<string>('');
  const [showAdvancedTroubleshooting, setShowAdvancedTroubleshooting] = useState(false);

  // Check auth status on app load
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const authStatus = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (authStatus === 'true') {
          setIsAuthenticated(true);
        }
      } catch (e) {
        console.error("Failed to load auth status", e);
        // Optionally handle error, e.g., show an error message
      } finally {
        setIsCheckingAuth(false);
      }
    };
    checkAuthStatus();
  }, []);

  // Check for updates when app launches
  useEffect(() => {
    const checkUpdates = async () => {
      try {
        await checkForUpdatesAndReload();
      } catch (error) {
        console.log('Error checking for updates:', error);
      }
    };
    
    checkUpdates();
  }, []);

  // Monitor for Java IO section errors and network connectivity
  useEffect(() => {
    // Check for any initial connection issues
    const checkConnectionStatus = async () => {
      if (__DEV__) {
        console.log('Checking development server connection on app launch...');
        try {
          const isConnected = await verifyDevServerConnection();
          console.log(`Initial dev server connection check: ${isConnected ? 'Connected' : 'Failed'}`);
          
          if (!isConnected) {
            // Show a non-blocking notification
            const statusUrl = getDevServerUrl().replace(/^exp:/, 'http:') + '/status';
            Alert.alert(
              'Development Server Notice',
              `The app is having trouble connecting to the development server. If you see errors, use the retry button.
              
              Status endpoint: ${statusUrl}
              Expo URL: ${getDevServerUrl()}`,
              [{ text: 'OK' }]
            );
          }
        } catch (error) {
          console.warn('Error checking initial dev server connection:', error);
        }
      }
    };
    
    checkConnectionStatus();
    
    // Set up a periodic connection check (every 30 seconds)
    // This can help detect Java IO section errors that happen during app use
    let connectionCheckInterval: ReturnType<typeof setInterval> | null = null;
    
    if (__DEV__) {
      connectionCheckInterval = setInterval(async () => {
        try {
          const isConnected = await verifyDevServerConnection();
          if (!isConnected && !networkError) {
            console.log('Connection check failed during background monitoring');
            // Don't show error UI automatically, just log the issue
            // This avoids disrupting the user experience
          }
        } catch (error) {
          // Check if this is a Java IO section error
          if (error instanceof Error && 
              (error.message.includes('java.io.') || 
               error.message.includes('section'))) {
            console.warn('Detected potential Java IO section error during background check:', error);
            // Log the error for analytics
            logErrorForAnalytics(error, 'backgroundConnectionCheck');
          }
        }
      }, 30000); // Check every 30 seconds
    }
    
    // Cleanup interval on component unmount
    return () => {
      if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
      }
    };
  }, [networkError]);

  // Function to handle connection retries
  const handleConnectionRetry = async () => {
    setNetworkError(false);
    setLoading(true);
    setErrorType(null);
    setErrorDetails('');
    
    try {
      // Check if we're dealing with a Java IO section error
      if (errorType === 'java-io') {
        console.log('Attempting to resolve Java IO section error...');
        const resolved = await handleJavaIOError();
        if (!resolved) {
          throw new Error('Failed to resolve Java IO section error');
        }
      }
      
      // Check connection to dev server if in development mode
      if (__DEV__) {
        console.log('Verifying connection to development server...');
        const isConnected = await verifyDevServerConnection();
        
        if (!isConnected) {
          console.log('Connection to dev server failed, showing alert with server details');
          const statusUrlRetry = getDevServerUrl().replace(/^exp:/, 'http:') + '/status';
          Alert.alert(
            'Development Server Connection Failed',
            `Make sure your device and development computer are on the same network.
            
            Status endpoint: ${statusUrlRetry}
            Expo URL: ${getDevServerUrl()}
            Try restarting the server with "npm start --clear"`,
            [{ text: 'OK' }]
          );
        } else {
          console.log('Successfully connected to development server');
        }
      }
      
      // Try to fetch data again
      console.log('Attempting to fetch hall data...');
      const hallData = await fetchHallData(date);
      
      if (hallData.length > 0) {
        console.log(`Successfully fetched ${hallData.length} hall records`);
        processHallData(hallData);
      } else {
        console.log('Fetch succeeded but returned empty results');
        setNetworkError(true);
        setErrorType('network');
        setErrorDetails('Server returned empty data. Please try again later.');
      }
    } catch (error) {
      console.error('Error retrying connection:', error);
      
      // Log the error for analytics
      const detectedErrorType = logErrorForAnalytics(error, 'handleConnectionRetry');
      
      setNetworkError(true);
      setErrorType(detectedErrorType);
      setErrorDetails(error instanceof Error ? error.message : String(error));
      
      // For Java IO section errors, offer specific remediation steps
      if (detectedErrorType === 'java-io') {
        console.log('Detected Java IO section error, will show specific troubleshooting steps');
      }
    } finally {
      setLoading(false);
    }
  };

  // Function to manually check for updates
  const handleCheckForUpdates = async () => {
    try {
      setLoading(true);
      const result = await checkForUpdatesAndReload();
      
      if (!result) {
        Alert.alert(
          'Update Check Failed',
          'Unable to check for updates. Please try again later.',
          [{ text: 'OK' }]
        );
      } else if (!__DEV__) {
        Alert.alert(
          'No Updates Available',
          'You are already using the latest version of the app.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      
      // Log the error for analytics
      const errorType = logErrorForAnalytics(error, 'handleCheckForUpdates');
      
      setNetworkError(true);
      setErrorType(errorType);
      setErrorDetails('Error checking for updates: ' + 
        (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      if (selectedDate) {
        setDate(selectedDate);
      }
    } else {
      if (selectedDate) {
        setTempDate(selectedDate);
      }
    }
  };

  const handleConfirmDate = () => {
    setDate(tempDate);
    setShowDatePicker(false);
  };

  const handleFind = async () => {
    setLoading(true);
    setPage(1);
    setNetworkError(false);
    setErrorType(null);
    setErrorDetails('');
    setShowAdvancedTroubleshooting(false);
    
    try {
      console.log(`Fetching hall data for date: ${formatDate(date)}`);
      const hallData = await fetchHallData(date);
      
      if (hallData.length > 0) {
        console.log(`Successfully fetched ${hallData.length} hall records`);
        processHallData(hallData);
      } else {
        console.log('Fetch returned empty results');
        setNetworkError(true);
        setErrorType('network');
        setErrorDetails('No data available for the selected date.');
      }
    } catch (error) {
      console.error('Error fetching hall data:', error);
      
      // Log the error for analytics and detect the type
      const detectedErrorType = logErrorForAnalytics(error, 'handleFind');
      
      setNetworkError(true);
      setErrorType(detectedErrorType);
      setErrorDetails(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };
  
  // Process hall data after fetching
  const processHallData = (hallData: HallData[]) => {
    // Group halls by location and organize data
    const organizedData: HallData[] = [];
    const locationGroups = hallData.reduce((groups: { [key: string]: any }, hall) => {
      if (!groups[hall.location]) {
        groups[hall.location] = {};
      }
      if (!groups[hall.location][hall.hallName]) {
        groups[hall.location][hall.hallName] = { Morning: null, Evening: null };
      }
      groups[hall.location][hall.hallName][hall.timeSlot] = hall.status;
      return groups;
    }, {});

    // Convert grouped data to flat list with section headers
    Object.entries(locationGroups).forEach(([location, halls]) => {
      // Add location header
      organizedData.push({
        date: formatDate(date),
        location: location as 'GMK Banquets Tathawade' | 'GMK Banquets Ravet',
        hallName: '',
        timeSlot: 'Morning',
        status: 'Available'
      });

      // Add halls with both time slots
      Object.entries(halls).forEach(([hallName, slots]: [string, any]) => {
        organizedData.push({
          date: formatDate(date),
          location: location as 'GMK Banquets Tathawade' | 'GMK Banquets Ravet',
          hallName,
          timeSlot: 'Morning',
          status: slots.Morning || 'Booked'
        });
        
        // Add evening slot for same hall
        organizedData.push({
          date: formatDate(date),
          location: location as 'GMK Banquets Tathawade' | 'GMK Banquets Ravet',
          hallName,
          timeSlot: 'Evening',
          status: slots.Evening || 'Booked'
        });
      });
    });

    setHalls(organizedData);
    setDisplayedHalls(organizedData.slice(0, ITEMS_PER_PAGE));
    setLoading(false);
  };

  const loadMore = useCallback(() => {
    if (loadingMore) return;
    if (displayedHalls.length >= halls.length) return;

    setLoadingMore(true);
    const nextPage = page + 1;
    const startIndex = (nextPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    
    setDisplayedHalls(prev => [...prev, ...halls.slice(startIndex, endIndex)]);
    setPage(nextPage);
    setLoadingMore(false);
  }, [halls, page, loadingMore, displayedHalls.length]);

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="large" />
      </View>
    );
  };

  const renderHallItem = useCallback(({ item, index }: { item: HallData, index: number }) => {
    if (item.hallName === '') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{item.location}</Text>
        </View>
      );
    }

    if (item.timeSlot === 'Morning') {
      const eveningSlot = halls[index + 1];
      if (!eveningSlot || eveningSlot.hallName !== item.hallName) {
        console.warn("Evening slot missing or mismatched for hall:", item.hallName);
        return null; 
      }
      return (
        <View style={styles.hallItem}>
          <Text style={styles.hallName}>{item.hallName}</Text>
          <View style={styles.slotsContainer}>
            <View style={[styles.timeSlotBadge, item.status === 'Available' ? styles.availableBadge : styles.bookedBadge]}>
              <Text style={styles.timeSlotText}>Morning</Text>
              <Text style={styles.statusText}>{item.status}</Text>
            </View>
            <View style={[styles.timeSlotBadge, eveningSlot.status === 'Available' ? styles.availableBadge : styles.bookedBadge]}>
              <Text style={styles.timeSlotText}>Evening</Text>
              <Text style={styles.statusText}>{eveningSlot.status}</Text>
            </View>
          </View>
        </View>
      );
    }
    return null;
  }, [halls]);

  const renderDatePicker = () => {
    if (Platform.OS === 'ios') {
      return (
        <Modal
          animationType="slide"
          transparent={true}
          visible={showDatePicker}
          onRequestClose={() => setShowDatePicker(false)}
        >
          <View style={styles.modalContainerIOS}>
            <View style={styles.modalContentIOS}>
              <View style={styles.pickerHeaderIOS}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)} style={styles.modalButtonIOS}>
                  <Text style={styles.modalButtonTextIOS}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleConfirmDate} style={styles.modalButtonIOS}>
                  <Text style={[styles.modalButtonTextIOS, styles.modalButtonConfirmIOS]}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner" // More iOS-like
                onChange={handleDateChange}
                style={styles.datePickerIOS}
                // themeVariant="light" // Optional: if you want to force light/dark
              />
            </View>
          </View>
        </Modal>
      );
    }
    // Android DatePicker remains the same as it uses native UI
    return showDatePicker && (
      <DateTimePicker
        value={date}
        mode="date"
        display="default"
        onChange={handleDateChange}
      />
    );
  };

  // Handle network error retry with advanced recovery
  const handleNetworkErrorRetry = async () => {
    setLoading(true);
    
    try {
      console.log(`Attempting error recovery...`);
      
      // First check if it's a Java IO error
      if (errorType === 'java-io') {
        // Try to handle Java IO error specifically
        const resolved = await handleJavaIOError();
        console.log(`Java IO error handling result: ${resolved ? 'Resolved' : 'Still having issues'}`);
      }
      
      // Verify connection regardless of error type
      const isConnected = await verifyDevServerConnection();
      console.log(`Dev server connection check: ${isConnected ? 'Connected' : 'Failed'}`);
      
      // Now try to load data again - Pass the date object directly
      console.log('Retrying data fetch with current date:', date);
      const data = await fetchHallData(date);
      
      // If we got here, we successfully recovered
      setHalls(data);
      setPage(1);
      setDisplayedHalls(data.slice(0, ITEMS_PER_PAGE));
      setNetworkError(false);
      setErrorType(null);
      setErrorDetails('');
    } catch (error) {
      console.error('Error during recovery attempt:', error);
      
      if (error instanceof Error) {
        // Analyze the error
        const newErrorType = detectErrorType(error);
        setErrorType(newErrorType);
        setErrorDetails(error.message);
        
        // Log analytics data about the error
        logErrorForAnalytics(error, `recovery-attempt`);
      }
      
      setNetworkError(true);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async () => {
    if (password === AUTH_PASSWORD) {
      try {
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, 'true');
        setIsAuthenticated(true);
        setPassword('');
        setAuthError('');
      } catch (e) {
        console.error("Failed to save auth status", e);
        setAuthError("Authentication failed. Please try again.");
      }
    } else {
      setAuthError("Incorrect password. Please try again.");
    }
  };

  if (isCheckingAuth) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.container, styles.centered]}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Checking authentication...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LinearGradient
          colors={['#4c669f', '#3b5998', '#192f6a']}
          style={styles.passwordContainer}
        >
          <Text style={styles.passwordTitle}>Enter Password</Text>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password"
            placeholderTextColor="#ccc"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {authError ? <Text style={styles.passwordError}>{authError}</Text> : null}
          <TouchableOpacity style={styles.passwordButton} onPress={handlePasswordSubmit}>
            <Text style={styles.passwordButtonText}>Submit</Text>
          </TouchableOpacity>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Hall Availability</Text>

        {/* Date Picker Section - Enhanced */}
        <View style={styles.dateContainer}>
          <View style={styles.dateWrapper}>
            <Text style={styles.dateLabel}>Selected Date:</Text>
            <TouchableOpacity 
              style={styles.dateButton}
              onPress={() => {
                setTempDate(date);
                setShowDatePicker(true);
              }}
            >
              <Text style={styles.dateButtonText}>
                {formatDate(date)}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity 
            style={styles.findButton}
            onPress={handleFind}
            disabled={loading} // Disable button when loading
          >
            {loading && !loadingMore ? ( // Show main loader only when not loading more
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.findButtonText}>Find Availability</Text>
            )}
          </TouchableOpacity>
        </View>

        {renderDatePicker()}

        {/* Loading State */}
        {loading && !halls.length && !networkError && (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        )}

        {/* Network Error Display */}
        {networkError && (
          <BlurView intensity={100} tint="light" style={styles.errorContainer}>
            <View style={[
                styles.errorTypeTag, 
                errorType === 'java-io' ? styles.errorTypeTagJava : styles.errorTypeTagNetwork
            ]}>
              <Text style={styles.errorTypeText}>
                {errorType === 'java-io' ? 'Connection Issue' : 'Network Error'}
              </Text>
            </View>
            <Text style={styles.errorText}>{errorDetails || 'Unable to connect. Please check your network.'}</Text>
            
            {/* Troubleshooting Steps */}
            {getTroubleshootingSteps(errorType ?? undefined).map((step, index) => (
              <Text key={index} style={styles.troubleshootingStep}>
                {`\\u2022 ${step}`}
              </Text>
            ))}

            {/* Advanced Troubleshooting Toggle */}
            {errorType === 'java-io' && (
              <TouchableOpacity 
                style={styles.advancedButton}
                onPress={() => setShowAdvancedTroubleshooting(!showAdvancedTroubleshooting)}
              >
                <Text style={styles.advancedButtonText}>
                  {showAdvancedTroubleshooting ? 'Hide' : 'Show'} Advanced Details
                </Text>
              </TouchableOpacity>
            )}

            {/* Advanced Troubleshooting Details */}
            {showAdvancedTroubleshooting && errorType === 'java-io' && (
              <View style={styles.advancedDetailsContainer}>
                <Text style={styles.advancedDetailsText}>
                  Error Type: {errorType}\\n
                  Details: {errorDetails}\\n
                  Expo URL: {getDevServerUrl()}\\n
                  Status URL: {getDevServerUrl().replace(/^exp:/, 'http:') + '/status'}
                </Text>
              </View>
            )}
            
            <TouchableOpacity style={styles.retryButton} onPress={handleNetworkErrorRetry}>
              <Text style={styles.retryButtonText}>Retry Connection</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.updateButton} onPress={handleCheckForUpdates}>
              <Text style={styles.updateButtonText}>Check for Updates</Text>
            </TouchableOpacity>
          </BlurView>
        )}

        {/* Hall List */}
        {!loading && !networkError && halls.length > 0 && (
          <FlatList
            data={displayedHalls}
            renderItem={renderHallItem}
            keyExtractor={(item, index) => `${item.location}-${item.hallName}-${item.timeSlot}-${index}`}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={renderFooter}
            style={styles.list}
            contentContainerStyle={styles.listContent}
          />
        )}

        {/* No Halls Available Message */}
        {!loading && !networkError && halls.length === 0 && (
          <View style={[styles.centered, styles.noHallsContainer]}>
            <Text style={styles.noHallsText}>No halls available for selected date</Text>
            <Text style={styles.tipText}>Try selecting a different date</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f0f0f0', 
  },
  container: {
    flex: 1,
    padding: Platform.OS === 'ios' ? 20 : 15, 
    backgroundColor: '#f0f0f0', 
  },
  centered: { 
    flex: 1, // Ensure it takes up space to center content
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { 
    marginTop: 10,
    fontSize: 16,
    color: '#555', // General loading text color
  },
  passwordContainer: { 
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  passwordTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 30,
    textAlign: 'center',
  },
  passwordInput: {
    width: '100%',
    height: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 10,
    paddingHorizontal: 15,
    fontSize: 16,
    color: '#fff',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  passwordButton: {
    backgroundColor: '#007AFF', 
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 10,
    elevation: 3, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  passwordButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  passwordError: {
    color: '#ff3b30', 
    fontSize: 14,
    marginBottom: 15,
    textAlign: 'center',
  },
  title: {
    fontSize: Platform.OS === 'ios' ? 28 : 26, 
    fontWeight: '700', 
    color: '#1C1C1E', 
    textAlign: 'center',
    marginVertical: 20, 
  },
  dateContainer: { 
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 5,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  dateWrapper: { 
    flexDirection: 'column',
  },
  dateLabel: { 
    fontSize: 14,
    color: '#8A8A8E', 
    marginBottom: 5,
  },
  dateButton: { 
    backgroundColor: 'transparent', 
  },
  dateButtonText: { 
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF', 
  },
  findButton: {
    backgroundColor: '#007AFF', 
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 10, 
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  findButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  loaderContainer: { 
    flex: 1, // Takes up available space to center content
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorContainer: {
    margin: 15,
    padding: 15,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.8)', 
    alignItems: 'center', 
    overflow: 'hidden', 
  },
  errorTypeTag: { 
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    marginBottom: 10,
    alignSelf: 'flex-start', 
  },
  errorTypeTagNetwork: { 
    backgroundColor: '#FF9500', 
  },
  errorTypeTagJava: { 
    backgroundColor: '#FF3B30', 
  },
  errorTypeText: { 
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  errorText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#D70015', 
    textAlign: 'center',
    marginBottom: 10,
  },
  errorSubText: { 
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  troubleshootingStep: { 
    fontSize: 15,
    color: '#3C3C43',
    textAlign: 'left',
    lineHeight: 22,
    marginBottom: 8,
    width: '100%',
  },
  advancedButton: { 
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 15,
    backgroundColor: '#E5E5EA', 
    borderRadius: 8,
  },
  advancedButtonText: { 
    color: '#007AFF', 
    fontSize: 14,
    fontWeight: '500',
  },
  advancedDetailsContainer: { 
    marginTop: 10,
    padding: 10,
    backgroundColor: '#F0F0F7', 
    borderRadius: 8,
    width: '100%',
  },
  advancedDetailsText: { 
    fontSize: 13,
    color: '#555',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', 
  },
  retryButton: {
    backgroundColor: '#34C759', 
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 10,
    marginTop: 15, 
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  updateButton: {
    backgroundColor: '#5856D6', 
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 10,
    marginTop: 10,
    shadowColor: '#5856D6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  list: { 
    flex: 1,
  },
  listContent: { 
    paddingBottom: 20, 
  },
  sectionHeader: {
    backgroundColor: '#E5E5EA', 
    paddingVertical: 8,
    paddingHorizontal: 15,
    marginTop: 15, 
    marginBottom: 5,
    borderRadius: 8,
  },
  sectionHeaderText: {
    fontSize: 18, 
    fontWeight: '600', 
    color: '#3C3C43', 
  },
  hallItem: {
    backgroundColor: '#FFFFFF', 
    padding: 15,
    borderRadius: 12, 
    marginBottom: 12, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, 
    shadowRadius: 4,
    elevation: 2,
  },
  hallName: {
    fontSize: 20, 
    fontWeight: '600', 
    color: '#1C1C1E',
    marginBottom: 10, 
  },
  slotsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around', 
  },
  timeSlotBadge: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8, 
    alignItems: 'center',
    minWidth: 120, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  availableBadge: {
    backgroundColor: '#E0F8E9', 
  },
  bookedBadge: {
    backgroundColor: '#FFEBEE', 
  },
  timeSlotText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1C1C1E', // Darker text for better contrast on light badges
    marginBottom: 3,
  },
  statusText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  // iOS Specific Date Picker Modal Styles
  modalContainerIOS: {
    flex: 1,
    justifyContent: 'flex-end', // Appears from bottom
    backgroundColor: 'rgba(0,0,0,0.4)', // Dimmed background
  },
  modalContentIOS: {
    backgroundColor: '#FFFFFF', // White background for the picker
    borderTopLeftRadius: 20, // Rounded corners
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 30 : 10, // Safe area padding for bottom
  },
  pickerHeaderIOS: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA', // Light separator line
  },
  modalButtonIOS: {
    padding: 5,
  },
  modalButtonTextIOS: {
    fontSize: 17,
    color: '#007AFF', // Standard iOS blue
  },
  modalButtonConfirmIOS: {
    fontWeight: '600', // Bold for "Done"
  },
  datePickerIOS: {
    height: 200, // Adjust height as needed
    width: '100%', // Full width
  },
  footerLoader: {
    paddingVertical: 20,
  },
  noHallsContainer: { // Added to ensure "No halls" message is also centered
     // styles.centered already has flex:1, justifyContent and alignItems
  },
  noHallsText: {
    fontSize: 18,
    color: '#8A8A8E',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 15,
    color: '#C7C7CD',
  },
});

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
  TextInput, // Added TextInput
  StatusBar // Added StatusBar
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
import { Image } from 'react-native'; // Ensure correct import for React Native Image component

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
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [date, setDate] = useState(new Date());
  const [tempDate, setTempDate] = useState(new Date());  const [showDatePicker, setShowDatePicker] = useState(false);
  const [halls, setHalls] = useState<HallData[]>([]);
  const [displayedHalls, setDisplayedHalls] = useState<HallData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [networkError, setNetworkError] = useState(false);
  const [errorType, setErrorType] = useState<'network' | 'java-io' | 'update' | 'general' | null>(null);
  const [errorDetails, setErrorDetails] = useState<string>('');
  const [showAdvancedTroubleshooting, setShowAdvancedTroubleshooting] = useState(false);
  const [debugDate, setDebugDate] = useState(''); // Added for debugging

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
    setDebugDate(formatDate(date)); // Update debugDate when date changes
    console.log('Debug Date State:', debugDate);
    
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
    console.log('Received hallData:', JSON.stringify(hallData, null, 2)); // Debug: log the actual data in detail

    const organizedData: HallData[] = [];
    const locationGroups = hallData.reduce((groups: { [key: string]: any }, hall) => {
      const upperCaseLocation = hall.location.toUpperCase(); // Convert to uppercase
      if (!groups[upperCaseLocation]) {
        groups[upperCaseLocation] = {};
      }
      if (!groups[upperCaseLocation][hall.hallName]) {
        groups[upperCaseLocation][hall.hallName] = { Morning: null, Evening: null };
      }
      groups[upperCaseLocation][hall.hallName][hall.timeSlot] = hall.status;
      return groups;
    }, {});

    console.log('Grouped location data:', JSON.stringify(locationGroups, null, 2)); // Debug: log grouped data in detail

    const locationOrder: Array<'GMK BANQUETS TATHAWADE' | 'GMK BANQUETS RAVET'> = [
      'GMK BANQUETS TATHAWADE',
      'GMK BANQUETS RAVET'
    ];

    const hallOrder: {
      'GMK BANQUETS TATHAWADE': string[];
      'GMK BANQUETS RAVET': string[];
    } = {
      'GMK BANQUETS TATHAWADE': ['Aster', 'Grand', 'Tulip', 'Lotus'],
      'GMK BANQUETS RAVET': ['Agastya', 'Vyas', 'Lawn']
    };

    locationOrder.forEach(location => {
      if (locationGroups[location]) {
        organizedData.push({
          date: formatDate(date),
          location: location as 'GMK BANQUETS TATHAWADE' | 'GMK BANQUETS RAVET',
          hallName: '',
          timeSlot: 'Morning',
          status: 'Available' // This is a placeholder for the section header, status doesn't matter
        });

        hallOrder[location].forEach((hallName: string) => {
          if (locationGroups[location][hallName]) {
            const slots = locationGroups[location][hallName];
            organizedData.push({
              date: formatDate(date),
              location: location as 'GMK BANQUETS TATHAWADE' | 'GMK BANQUETS RAVET',
              hallName,
              timeSlot: 'Morning',
              status: slots.Morning || 'Booked'
            });
            organizedData.push({
              date: formatDate(date),
              location: location as 'GMK BANQUETS TATHAWADE' | 'GMK BANQUETS RAVET',
              hallName,
              timeSlot: 'Evening',
              status: slots.Evening || 'Booked'
            });
          } else {
            console.warn(`Hall ${hallName} missing in location ${location}`); // Debug: warn about missing halls
          }
        });
      } else {
        console.warn(`Location ${location} missing in data`); // Debug: warn about missing locations
      }
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
              <TouchableOpacity 
                onPress={handleConfirmDate} 
                style={[styles.modalButtonIOS, styles.modalButtonConfirmIOS]}
              >
                <Text style={styles.modalButtonTextIOS}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={tempDate}
              mode="date"
              display="inline"
              onChange={handleDateChange}
              style={styles.datePickerIOS}
              textColor="#fff" // White text for date picker
              themeVariant="dark" // Dark mode for date picker
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

  if (isCheckingAuth) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Checking authentication...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.passwordContainer}>
          <Image source={require('./assets/icon.png')} style={styles.passwordLogo} resizeMode="contain" />
          <Text style={styles.passwordBrandName}>GMK Banquets</Text>
          {/* <Text style={styles.passwordTitle}>Enter Password</Text> // Removed as per request */}
          {authError ? <Text style={styles.passwordError}>{authError}</Text> : null}
          <TextInput
            style={styles.passwordInput}
            placeholder="Enter Password" // Changed placeholder
            placeholderTextColor="#757575" // Grey placeholder for TextInput component prop
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity
            style={styles.passwordButton}
            onPress={async () => {
              setLoading(true);
              setAuthError('');
              try {
                // Simulate password check
                await new Promise((resolve, reject) => {
                  setTimeout(() => {
                    if (password === AUTH_PASSWORD) {
                      resolve(true);
                    } else {
                      reject(new Error('Invalid password, please try again.'));
                    }
                  }, 1000);
                });
                
                // If successful, store auth status and reload app
                await AsyncStorage.setItem(AUTH_STORAGE_KEY, 'true');
                setIsAuthenticated(true);
              } catch (e) { // Changed variable name to avoid conflict if 'error' is defined elsewhere
                if (e instanceof Error) {
                  setAuthError(e.message);
                } else {
                  setAuthError('An unknown error occurred during authentication.');
                }
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.passwordButtonText}>Unlock</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Image source={require('./assets/icon.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.heading} numberOfLines={1}>GMK Banquets</Text>
        </View>
        
        <View style={styles.dateSection}>
          <View style={styles.dateTextContainer}>
            <Text style={styles.dateLabel}>Selected Date</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => {
                setTempDate(date);
                setShowDatePicker(true);
              }}
            >
              <Text style={styles.dateButtonText}>
                {formatDate(date)} {/* Display debugDate here */}
              </Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity
            style={styles.findButton}
            onPress={handleFind}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <Text style={styles.findButtonText}>Check</Text>
            )}
          </TouchableOpacity>
        </View>
        
        {renderDatePicker()}

        {/* Loading State */}
        {loading && (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading data, please wait...</Text>
          </View>
        )}

        {/* Network Error Display */}
        {networkError && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              {errorType === 'java-io' 
                ? 'Java IO section error detected. Please check your connection and try again.'
                : 'Network error. Please check your internet connection and try again.'}
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleConnectionRetry}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
            {errorType === 'java-io' && (
              <TouchableOpacity
                style={styles.advancedButton}
                onPress={() => setShowAdvancedTroubleshooting(!showAdvancedTroubleshooting)}
              >
                <Text style={styles.advancedButtonText}>
                  {showAdvancedTroubleshooting ? 'Hide' : 'Show'} Advanced Troubleshooting
                </Text>
              </TouchableOpacity>
            )}
            {showAdvancedTroubleshooting && errorType === 'java-io' && (
              <View style={styles.advancedDetailsContainer}>
                <Text style={styles.advancedDetailsText}>
                  1. Ensure your device is connected to the internet.
                </Text>
                <Text style={styles.advancedDetailsText}>
                  2. Restart the app.
                </Text>
                <Text style={styles.advancedDetailsText}>
                  3. If the problem persists, contact support.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Halls List */}
        {!loading && displayedHalls.length === 0 && (
          <View style={styles.noHallsContainer}>
            <Text style={styles.noHallsText}>No halls found for the selected date.</Text>
            <Text style={styles.tipText}>Tip: Try selecting a different date.</Text>
          </View>
        )}
        <FlatList
          data={displayedHalls}
          renderItem={renderHallItem}
          keyExtractor={(item, index) => item.hallName + index}
          contentContainerStyle={styles.listContent}
          style={styles.list}
          ListFooterComponent={renderFooter}
          showsVerticalScrollIndicator={false}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000', // Ensure this is black
  },
  container: {
    flex: 1,
    padding: 20, // Keep overall padding
    backgroundColor: '#000000', // Ensure this is black
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // --- Start of changes for header ---
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    // marginVertical: 20, // Reduced from 20
    paddingHorizontal: 20,
    ...Platform.select({
      android: {
        marginTop: 25, // Further reduced from 40
      },
      ios: {
        marginTop: 5, // Further reduced from 10
      },
    }),
  },
  logo: {
    width: 60,
    height: 60,
    marginBottom: 10,
  },
  heading: {
    fontSize: 32,
    fontWeight: '700',
    color: '#C6A556',
    textAlign: 'center',
  },
  // --- End of changes for header ---
  // --- Start of changes for dateSection ---
  dateSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 15,
    marginVertical: 8, // Further reduced from 10
    height: 80, 
  },
  dateTextContainer: {
    flex: 4, // Increased flex ratio
    justifyContent: 'center',
    width: '70%', // Added explicit width
  },
  dateLabel: {
    color: '#C6A556',
    fontSize: 18,
    marginBottom: 8,
  },
  dateButton: {
    height: 40, // Added fixed height
    justifyContent: 'center',
  },
  dateButtonText: {
    color: '#FFFFFF',
    fontSize: 24, // Increased font size
    fontWeight: 'bold',
  },
  findButton: {
    flex: 1,
    minWidth: 90,
    height: 45, // Added fixed height
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#D4AF37',
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10, // Added margin to separate from date
  },
  findButtonText: {
    fontSize: 14, // Ensured smaller font size for alignment
    color: '#000',
    textAlign: 'center',
  },
  // --- End of changes for dateSection ---
  modalContainerIOS: {
    flex: 1,
    justifyContent: 'flex-end', // Position modal at the bottom
    backgroundColor: 'rgba(0,0,0,0.5)', // Semi-transparent background
  },
  modalContentIOS: {
    backgroundColor: '#2C2C2E', // Dark background for modal content
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  pickerHeaderIOS: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#4A4A4C', // Subtle border
  },
  modalButtonIOS: {
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  modalButtonConfirmIOS: {
    // No specific style needed here if default is fine, or adjust as necessary
    // fontWeight: 'bold', // fontWeight can be 'normal', 'bold', '100'-'900'
    // Let's try '600' which is a common semi-bold weight
    // fontWeight: '600', // This property is for Text styles, not View styles. Removing to fix type error.
  },
  modalButtonTextIOS: {
    fontSize: 17,
    color: '#007AFF', // iOS blue for button text
  },
  datePickerIOS: {
    // Ensure the picker itself doesn't cause layout issues
    // backgroundColor: 'transparent', // Or match modalContentIOS background
    // No explicit width/height needed, let it size naturally
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#E0E0E0', // Light text for loading
    fontSize: 16,
  },
  errorContainer: {
    margin: 20,
    padding: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(50, 50, 50, 0.9)', // Darker, slightly transparent background
    alignItems: 'center',
    overflow: 'hidden', // For BlurView border radius on Android
  },
  errorTypeTag: {
    position: 'absolute',
    top: -1, // Slight overlap for visual effect
    left: -1,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderTopLeftRadius: 10,
    borderBottomRightRadius: 10, // Stylish corner
  },
  errorTypeTagNetwork: {
    backgroundColor: '#D32F2F', // Red for network errors
  },
  errorTypeTagJava: {
    backgroundColor: '#FFA000', // Amber for Java IO issues
  },
  errorTypeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  errorText: {
    fontSize: 16,
    color: '#FFCDD2', // Light red for error text
    textAlign: 'center',
    marginBottom: 15,
    marginTop: 30, // Space below the tag
  },
  troubleshootingStep: {
    fontSize: 14,
    color: '#B0BEC5', // Lighter grey for steps
    textAlign: 'left',
    alignSelf: 'stretch', // Make text take full width
    marginLeft: 20, // Indent steps
    marginBottom: 5,
  },
  advancedButton: {
    marginTop: 15,
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 5,
    backgroundColor: '#4CAF50', // Green for advanced button
  },
  advancedButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  advancedDetailsContainer: {
    marginTop: 10,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.2)', // Darker background for details
    borderRadius: 5,
    alignSelf: 'stretch',
  },
  advancedDetailsText: {
    fontSize: 12,
    color: '#CFD8DC', // Even lighter grey for details
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', // Monospace for details
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#007AFF', // Blue for retry
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  updateButton: {
    marginTop: 10,
    backgroundColor: '#555', // Grey for update button
    paddingVertical: 10,
    paddingHorizontal: 25,
    borderRadius: 8,
  },
  updateButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  list: {
    marginTop: 10,
  },
  listContent: {
    paddingBottom: 20, // Space at the bottom of the list
  },
  sectionHeader: {
    backgroundColor: '#1C1C1E', // Darker background
    paddingVertical: 12,
    paddingHorizontal: 15,
    marginTop: 15,
    marginBottom: 5,
    borderRadius: 12,
    shadowColor: '#C6A556', // Golden glow
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4, // Android shadow
  },
  sectionHeaderText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#C6A556', // Golden color
    textAlign: 'center', // Center alignment
    textShadowColor: 'rgba(198, 165, 86, 0.3)', // Subtle golden glow
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  hallItem: {
    backgroundColor: '#1E1E1E', // Slightly lighter dark for hall items
    padding: 15,
    marginVertical: 5,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  hallName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#D0D0D0', // Slightly lighter text for hall names
    marginBottom: 10,
  },
  slotsContainer: {
    flexDirection: 'row', // Keep slots horizontal
    justifyContent: 'space-around', // Distribute space evenly
    marginTop: 8,
    gap: 10, // Add gap between morning and evening slots
  },
  timeSlotBadge: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 15, // More rounded badges
    minWidth: 120, // Ensure badges have enough width
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  timeSlotText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#121212', // Dark text for slot type (Morning/Evening)
  },
  statusText: {
    fontSize: 12,
    color: '#333', // Slightly lighter dark text for status
    marginTop: 3,
  },
  availableBadge: {
    backgroundColor: '#A5D6A7', // Subtle green (pastel green)
  },
  bookedBadge: {
    backgroundColor: '#EF9A9A', // Subtle red (pastel red)
  },
  footerLoader: {
    paddingVertical: 20,
  },
  noHallsContainer: {
    paddingVertical: 30,
    alignItems: 'center', // Added to center content
  },
  noHallsText: {
    fontSize: 18,
    color: '#757575', // Grey text for no halls message
    marginBottom: 5,
  },
  tipText: {
    fontSize: 14,
    color: '#505050', // Darker grey for tip
  },
  passwordContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30, // Increased padding for more empty space
    backgroundColor: '#000000',
  },
  passwordLogo: {
    width: 90, // Slightly larger logo
    height: 90,
    marginBottom: 15, // Adjusted margin
  },
  passwordBrandName: {
    fontSize: 28, // Slightly larger brand name
    fontWeight: '600', // Semi-bold for a more refined look
    color: '#C6A556',
    marginBottom: 40, // Increased margin for more separation
  },
  // passwordTitle style removed as the Text element is removed
  passwordInput: {
    width: '100%',
    backgroundColor: '#1A1A1A', // Slightly darker input background
    color: '#FFFFFF',
    paddingHorizontal: 20, // Increased horizontal padding
    paddingVertical: 18, // Increased vertical padding
    borderRadius: 12, // More rounded corners
    marginBottom: 25, // Adjusted margin
    fontSize: 17, // Standard iOS text size
    borderColor: '#C6A556',
    borderWidth: 1,
    textAlign: 'center', // Center placeholder text
  },
  passwordError: {
    color: '#EF9A9A',
    marginBottom: 20, // Adjusted margin
    textAlign: 'center',
    fontSize: 14, // Slightly smaller error text
  },
  passwordButton: {
    backgroundColor: '#D4AF37',
    paddingVertical: 18, // Increased vertical padding
    paddingHorizontal: 40, // Increased horizontal padding
    borderRadius: 12, // Consistent with input field
    width: '100%', // Make button full width
    alignItems: 'center', // Center text in button
  },
  passwordButtonText: {
    color: '#000000', // Black text
    fontSize: 16,
    fontWeight: 'bold',
  },
});

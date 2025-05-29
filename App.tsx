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
import SkeletonItem from './src/components/SkeletonItem';

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
  const [tempDate, setTempDate] = useState(new Date());
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
  }, [networkError, date]); // Added date to dependency array for setDebugDate

  // Function to handle connection retries
  const handleConnectionRetry = async () => {
    setNetworkError(false);
    setLoading(true);
    setDisplayedHalls([]); // Clear previous results to show skeleton
    setHalls([]);          // Clear all hall data
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
      
      if (!result && __DEV__) { // Only show "Update Check Failed" in DEV if it actually fails
        Alert.alert(
          'Update Check Failed (Dev)',
          'Unable to check for updates. This might be normal in dev if not connected to update server.',
          [{ text: 'OK' }]
        );
      } else if (!result && !__DEV__) { // In Prod, a failed check is an issue
         Alert.alert(
          'Update Check Failed',
          'Unable to check for updates. Please try again later.',
          [{ text: 'OK' }]
        );
      } else if (result && !__DEV__){ // If check was successful (result=true) and in prod
         Alert.alert(
          'No Updates Available', // Or "App is up to date" if checkForUpdatesAndReload can distinguish
          'You are already using the latest version of the app.',
          [{ text: 'OK' }]
        );
      } else if (result && __DEV__){
         Alert.alert(
          'Update Check (Dev)',
          'Update check completed. In development, updates are usually handled by Metro bundler. If an OTA update was found, it would have been applied.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      const errorTypeLog = logErrorForAnalytics(error, 'handleCheckForUpdates');
      setNetworkError(true); // Consider if this should set networkError or a specific updateError state
      setErrorType(errorTypeLog); // Or 'update'
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
    } else { // iOS
      if (selectedDate) {
        setTempDate(selectedDate); // Store in tempDate for iOS
      }
    }
  };

  const handleConfirmDate = () => { // For iOS
    setDate(tempDate);
    setShowDatePicker(false);
  };

  const handleFind = async () => {
    setLoading(true);
    setDisplayedHalls([]); 
    setHalls([]);          
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
        console.log('Fetch returned empty results for the selected date.');
        // setNetworkError(true); // Don't set network error for empty data, it's a valid response
        // setErrorType('network');
        // setErrorDetails('No data available for the selected date.');
        setHalls([]); // Ensure halls are empty
        setDisplayedHalls([]); // Ensure displayedHalls are empty
      }
    } catch (error) {
      console.error('Error fetching hall data:', error);
      const detectedErrorType = logErrorForAnalytics(error, 'handleFind');
      setNetworkError(true);
      setErrorType(detectedErrorType);
      setErrorDetails(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };
  
  const processHallData = (hallData: HallData[]) => {
    // console.log('Received hallData for processing:', JSON.stringify(hallData, null, 2));

    const organizedData: HallData[] = [];
    const locationGroups: { [key: string]: { [hallName: string]: { Morning?: 'Available' | 'Booked' | 'Enquiry', Evening?: 'Available' | 'Booked' | 'Enquiry' } } } = {};

    hallData.forEach(hall => {
      const upperCaseLocation = hall.location.toUpperCase();
      if (!locationGroups[upperCaseLocation]) {
        locationGroups[upperCaseLocation] = {};
      }
      if (!locationGroups[upperCaseLocation][hall.hallName]) {
        locationGroups[upperCaseLocation][hall.hallName] = {};
      }
      // Ensure timeslot is one of the expected values
      if (hall.timeSlot === 'Morning' || hall.timeSlot === 'Evening') {
        locationGroups[upperCaseLocation][hall.hallName][hall.timeSlot] = hall.status;
      }
    });

    // console.log('Grouped location data:', JSON.stringify(locationGroups, null, 2));

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
      const normalizedLocationKey = location.toUpperCase(); // Use consistent casing for lookup
      if (locationGroups[normalizedLocationKey] && Object.keys(locationGroups[normalizedLocationKey]).length > 0) {
        organizedData.push({
          date: formatDate(date), // This date is from the state, consistent for all items in this fetch
          location: location, // Use original casing for display
          hallName: '', // Indicates a section header
          timeSlot: 'Morning', // Placeholder
          status: 'Available'  // Placeholder
        });

        hallOrder[location].forEach((hallName: string) => {
          if (locationGroups[normalizedLocationKey][hallName]) {
            const slots = locationGroups[normalizedLocationKey][hallName];
            organizedData.push({
              date: formatDate(date),
              location: location,
              hallName,
              timeSlot: 'Morning',
              status: slots.Morning || 'Enquiry' // Default to 'Enquiry' or similar if not explicitly booked/available
            });
            organizedData.push({
              date: formatDate(date),
              location: location,
              hallName,
              timeSlot: 'Evening',
              status: slots.Evening || 'Enquiry'
            });
          } else {
            // If a hall defined in hallOrder is not in the data, you might want to represent it as 'Not Available' or skip it.
            // For now, we skip it, meaning only halls present in data are shown.
            // console.warn(`Hall ${hallName} not found in data for location ${location}`);
          }
        });
      } else {
        // console.warn(`Location ${location} not found in data or has no halls.`);
      }
    });
    
    // console.log('Organized Data:', JSON.stringify(organizedData, null, 2));
    setHalls(organizedData);
    setDisplayedHalls(organizedData.slice(0, ITEMS_PER_PAGE));
  };

  const loadMore = useCallback(() => {
    if (loadingMore || displayedHalls.length >= halls.length) return;

    setLoadingMore(true);
    const nextPage = page + 1;
    const startIndex = page * ITEMS_PER_PAGE; // page is 1-indexed, so for page 1, start is 0. For page 2, start is ITEMS_PER_PAGE.
                                            // This should be (page * ITEMS_PER_PAGE) if page starts at 0 for calculation
                                            // Or if page is 1-indexed, then (page * ITEMS_PER_PAGE) is the start of next page's items
                                            // Let's adjust: current page is `page`. We want items for `page+1`.
                                            // Items for page `p` are from `(p-1)*ITEMS_PER_PAGE` to `p*ITEMS_PER_PAGE - 1`
    
    const newItems = halls.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    
    if (newItems.length > 0) {
      setDisplayedHalls(prev => [...prev, ...newItems]);
      setPage(nextPage);
    }
    setLoadingMore(false);
  }, [halls, page, loadingMore, displayedHalls.length]);

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="large" color="#C6A556" />
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
      const eveningSlotIndex = index + 1;
      let eveningSlotStatus = 'Enquiry'; // Default if not found or mismatched

      if (eveningSlotIndex < halls.length && 
          halls[eveningSlotIndex].hallName === item.hallName && 
          halls[eveningSlotIndex].timeSlot === 'Evening') {
        eveningSlotStatus = halls[eveningSlotIndex].status;
      } else {
        // console.warn(`Evening slot for ${item.hallName} mismatched or not found directly after morning slot.`);
        // Attempt to find it further if data isn't strictly paired (though current logic assumes pairs)
        const foundEveningSlot = halls.find(h => h.hallName === item.hallName && h.location === item.location && h.timeSlot === 'Evening');
        if (foundEveningSlot) eveningSlotStatus = foundEveningSlot.status;
      }
      
      return (
        <View style={styles.hallItem}>
          <Text style={styles.hallName}>{item.hallName}</Text>
          <View style={styles.slotsContainer}>
            <View style={[styles.timeSlotBadge, item.status === 'Available' ? styles.availableBadge : (item.status === 'Booked' ? styles.bookedBadge : styles.enquiryBadge)]}>
              <Text style={styles.timeSlotText}>Morning</Text>
              <Text style={styles.statusText}>{item.status}</Text>
            </View>
            <View style={[styles.timeSlotBadge, eveningSlotStatus === 'Available' ? styles.availableBadge : (eveningSlotStatus === 'Booked' ? styles.bookedBadge : styles.enquiryBadge)]}>
              <Text style={styles.timeSlotText}>Evening</Text>
              <Text style={styles.statusText}>{eveningSlotStatus}</Text>
            </View>
          </View>
        </View>
      );
    }
    return null; // Only render for "Morning" items, Evening is paired.
  }, [halls, styles]); // styles dependency

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
                <Text style={[styles.modalButtonTextIOS, {fontWeight: '600'}]}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={tempDate}
              mode="date"
              display="inline"
              onChange={handleDateChange}
              style={styles.datePickerIOS}
              textColor="#FFFFFF" 
              themeVariant="dark" // Ensure this is supported or remove if causing issues
            />
          </View>
        </View>
      </Modal>
      );
    }
    return showDatePicker && (
      <DateTimePicker
        value={date}
        mode="date"
        display="default" // Or "calendar", "spinner"
        onChange={handleDateChange}
      />
    );
  };

  if (isCheckingAuth) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar barStyle="light-content" backgroundColor="#000000" />
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#C6A556" />
            <Text style={styles.loadingText}>Checking authentication...</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar barStyle="light-content" backgroundColor="#000000" />
          <View style={styles.passwordContainer}>
            <Image source={require('./assets/icon.png')} style={styles.passwordLogo} resizeMode="contain" />
            <Text style={styles.passwordBrandName}>GMK Banquets</Text>
            {authError ? <Text style={styles.passwordError}>{authError}</Text> : null}
            <TextInput
              style={styles.passwordInput}
              placeholder="Enter Password"
              placeholderTextColor="#757575"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.passwordButton}
              onPress={async () => {
                setLoading(true); 
                setAuthError('');
                try {
                  await new Promise<void>((resolve, reject) => { // Explicitly type Promise
                    setTimeout(() => {
                      if (password === AUTH_PASSWORD) {
                        resolve();
                      } else {
                        reject(new Error('Invalid password, please try again.'));
                      }
                    }, 500); 
                  });
                  await AsyncStorage.setItem(AUTH_STORAGE_KEY, 'true');
                  setIsAuthenticated(true);
                } catch (e: any) { 
                  setAuthError(e.message || 'An unknown error occurred.');
                } finally {
                  setLoading(false); 
                }
              }}
              disabled={loading} 
            >
              {loading ? ( 
                <ActivityIndicator size="small" color="#000000" /> 
              ) : (
                <Text style={styles.passwordButtonText}>Unlock</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
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
                setTempDate(new Date(date)); // Ensure tempDate is a new instance based on current date
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
            disabled={loading}
          >
            {loading && displayedHalls.length === 0 ? ( 
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <Text style={styles.findButtonText}>Check</Text>
            )}
          </TouchableOpacity>
        </View>
        
        {renderDatePicker()}

        {loading && !networkError && displayedHalls.length === 0 && (
          <FlatList
            data={Array.from({ length: 6 })} // Changed length to 6 to add one more skeleton item
            renderItem={() => <SkeletonItem />}
            keyExtractor={(item, index) => `skeleton-${index}`}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}

        {networkError && (
          <View style={styles.errorContainer}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(30, 30, 30, 0.9)' }]} />
            )}
            <View style={[
                styles.errorTypeTag,
                errorType === 'java-io' ? styles.errorTypeTagJava : styles.errorTypeTagNetwork
            ]}>
                <Text style={styles.errorTypeText}>
                    {errorType === 'java-io' ? 'Connection Issue' : (errorType === 'update' ? 'Update Error' : 'Network Error')}
                </Text>
            </View>
            <Text style={styles.errorText}>
              {errorType === 'java-io'
                ? getTroubleshootingSteps(errorType).join('\n') // Join array of strings
                : errorDetails || 'An unexpected error occurred. Please try again.'}
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleConnectionRetry}
              disabled={loading}
            >
              {loading && errorType !== 'update' ? <ActivityIndicator color="#fff" /> : <Text style={styles.retryButtonText}>Retry</Text>}
            </TouchableOpacity>
            
            {errorType === 'java-io' && (
              <TouchableOpacity
                style={styles.advancedButton}
                onPress={() => setShowAdvancedTroubleshooting(!showAdvancedTroubleshooting)}
              >
                <Text style={styles.advancedButtonText}>
                  {showAdvancedTroubleshooting ? 'Hide' : 'Show'} Troubleshooting
                </Text>
              </TouchableOpacity>
            )}
            {showAdvancedTroubleshooting && errorType === 'java-io' && (
              <View style={styles.advancedDetailsContainer}>
                {getTroubleshootingSteps(errorType).map((step: string, idx: number) => ( // Add types for step and idx
                  <Text key={idx} style={styles.advancedDetailsText}>{step}</Text>
                ))}
                {__DEV__ && (
                  <TouchableOpacity onPress={() => {
                    const url = getDevServerUrl();
                    if (url) Linking.openURL(url.replace(/^exp:/, 'http:') + '/status');
                    }}
                  >
                    <Text style={[styles.advancedDetailsText, { color: '#0A84FF', marginTop: 10 }]}>
                      Check Dev Server Status
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            <TouchableOpacity
                style={styles.updateButton}
                onPress={handleCheckForUpdates}
                disabled={loading}
            >
                {loading && errorType === 'update' ? <ActivityIndicator color="#fff" /> : <Text style={styles.updateButtonText}>Check for Updates</Text>}
            </TouchableOpacity>
          </View>
        )}

        {!loading && !networkError && displayedHalls.length > 0 && (
          <FlatList
            data={displayedHalls}
            renderItem={renderHallItem}
            keyExtractor={(item, index) => `${item.location}-${item.hallName}-${item.timeSlot}-${index}`} // Ensure unique keys
            contentContainerStyle={styles.listContent}
            style={styles.list}
            ListFooterComponent={renderFooter}
            showsVerticalScrollIndicator={false}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5} 
          />
        )}
        
        {!loading && !networkError && halls.length === 0 && ( 
          <View style={styles.noHallsContainer}>
            <Text style={styles.noHallsText}>No halls found for the selected date.</Text>
            <Text style={styles.tipText}>Tip: Try selecting a different date.</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
    paddingHorizontal: 15, 
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 10 : 10, // Adjusted top padding
    backgroundColor: '#000000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 10, 
    marginBottom: 10, 
  },
  logo: {
    width: 55, 
    height: 55,
    marginBottom: 8,
  },
  heading: {
    fontSize: 26, 
    fontWeight: 'bold', // Changed from 700
    color: '#C6A556', 
    textAlign: 'center',
  },
  dateSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 12, 
    paddingHorizontal: 5, 
  },
  dateTextContainer: {
    flex: 1, 
    marginRight: 12, 
  },
  dateLabel: {
    color: '#A0A0A0', 
    fontSize: 15, 
    marginBottom: 5,
  },
  dateButton: {
    paddingVertical: 8, 
  },
  dateButtonText: {
    color: '#FFFFFF',
    fontSize: 22, 
    fontWeight: 'bold',
  },
  findButton: {
    minWidth: 85, 
    height: 50, 
    paddingHorizontal: 18, 
    backgroundColor: '#D4AF37', 
    borderRadius: 25, 
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 6,
  },
  findButtonText: {
    fontSize: 17,
    color: '#000000', 
    fontWeight: 'bold',
  },
  modalContainerIOS: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  modalContentIOS: {
    backgroundColor: '#1C1C1E', 
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 12, 
    paddingBottom: Platform.OS === 'ios' ? 34 : 20, // Account for home indicator on iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  pickerHeaderIOS: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12, 
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3A3A3C', 
  },
  modalButtonIOS: {
    padding: 10, 
  },
  modalButtonConfirmIOS: {
    // fontWeight handled in Text style
  },
  modalButtonTextIOS: {
    fontSize: 17,
    color: '#0A84FF', 
    // fontWeight: '600' for Done button is applied directly in JSX
  },
  datePickerIOS: {
    // width: '100%', // Ensure it takes full width if needed
    // height: 216, // Standard iOS picker height
  },
  loadingText: {
    marginTop: 15,
    color: '#B0B0B0', // Slightly brighter loading text
    fontSize: 16,
  },
  errorContainer: {
    flex: 1, 
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 15, 
    padding: 25, // Increased padding
    borderRadius: 18,
    overflow: 'hidden', 
  },
  errorTypeTag: {
    position: 'absolute',
    top: 0, 
    left: 0,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderTopLeftRadius: 18, 
    borderBottomRightRadius: 18, 
  },
  errorTypeTagNetwork: {
    backgroundColor: '#D32F2F', 
  },
  errorTypeTagJava: {
    backgroundColor: '#FFA000', 
  },
  errorTypeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  errorText: {
    fontSize: 17, 
    color: '#FFDDE2', // Softer red for text
    textAlign: 'center',
    marginBottom: 22,
    marginTop: 55, 
    lineHeight: 25, 
  },
  retryButton: {
    marginTop: 18,
    backgroundColor: '#0A84FF', 
    paddingVertical: 14, // Larger touch target
    paddingHorizontal: 40,
    borderRadius: 28, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  advancedButton: {
    marginTop: 22, 
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  advancedButtonText: {
    color: '#0A84FF', 
    fontSize: 15,
    fontWeight: '500',
  },
  advancedDetailsContainer: {
    marginTop: 18,
    padding: 18,
    backgroundColor: 'rgba(255,255,255,0.08)', 
    borderRadius: 12,
    alignSelf: 'stretch', 
  },
  advancedDetailsText: {
    fontSize: 14,
    color: '#C0C0C0', 
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 9,
    lineHeight: 20,
  },
  updateButton: {
    marginTop: 18,
    backgroundColor: '#555555', 
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 22,
  },
  updateButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  list: {
    marginTop: 12, 
  },
  listContent: {
    paddingBottom: 40, 
  },
  sectionHeader: {
    backgroundColor: 'rgba(198, 165, 86, 0.12)', 
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginTop: 22, 
    marginBottom: 12, 
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#C6A556', 
  },
  sectionHeaderText: {
    fontSize: 20, 
    fontWeight: '600', 
    color: '#C6A556', 
  },
  hallItem: {
    backgroundColor: '#1C1C1E', // Darker item background, consistent with iOS modal
    padding: 18, // Increased padding
    marginVertical: 7, 
    borderRadius: 14, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, 
    shadowRadius: 5,
    elevation: 4, // Slightly more elevation
  },
  hallName: {
    fontSize: 19, // Larger hall name
    fontWeight: 'bold',
    color: '#E8E8E8', 
    marginBottom: 14, 
  },
  slotsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between', 
  },
  timeSlotBadge: {
    paddingVertical: 6, // Further reduced padding
    borderRadius: 8, // Further reduced borderRadius
    flex: 1, 
    marginHorizontal: 8, // Increased margin to create more space between boxes
    alignItems: 'center', 
    minHeight: 50, // Further reduced minHeight
    justifyContent: 'center', 
    borderWidth: 1, // Adding a subtle border
    borderColor: 'rgba(255, 255, 255, 0.1)', // Border for badges
  },
  timeSlotText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#121212', 
  },
  statusText: {
    fontSize: 14, 
    color: '#222222', // Darker status text for better contrast on light badges
    marginTop: 5, 
    fontWeight: '600', // Bolder status
  },
  availableBadge: {
    backgroundColor: '#90EE90', // LightGreen (from user)
    borderColor: '#5cb85c', // Darker green border
  },
  bookedBadge: {
    backgroundColor: '#F08080', // LightCoral (from user)
    borderColor: '#d9534f', // Darker red border
  },
  enquiryBadge: { // Added style for 'Enquiry' or other statuses
    backgroundColor: '#DAA520', // Goldenrod (from user for 'Enquiry')
    borderColor: '#b8860b', // Darker gold border
  },
  footerLoader: {
    paddingVertical: 25,
    alignItems: 'center', 
  },
  noHallsContainer: {
    flex: 1, 
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  noHallsText: {
    fontSize: 19,
    color: '#999999', 
    textAlign: 'center',
    marginBottom: 10,
  },
  tipText: {
    fontSize: 15,
    color: '#777777', 
    textAlign: 'center',
  },
  passwordContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 35, // More horizontal padding
    backgroundColor: '#000000',
  },
  passwordLogo: {
    width: 85,
    height: 85,
    marginBottom: 20,
  },
  passwordBrandName: {
    fontSize: 28,
    fontWeight: '600',
    color: '#C6A556',
    marginBottom: 60, 
  },
  passwordInput: {
    width: '100%',
    backgroundColor: '#1C1C1E', 
    color: '#FFFFFF',
    paddingHorizontal: 22,
    paddingVertical: 18, 
    borderRadius: 12, 
    marginBottom: 25,
    fontSize: 18, // Larger font size
    borderColor: '#C6A556', 
    borderWidth: 1.5, // Slightly thicker border
    textAlign: 'center',
  },
  passwordError: {
    color: '#FF7B7B', // Brighter, more noticeable red
    marginBottom: 18,
    textAlign: 'center',
    fontSize: 15, // Larger error text
  },
  passwordButton: {
    backgroundColor: '#D4AF37', 
    paddingVertical: 18,
    borderRadius: 12, 
    width: '100%',
    alignItems: 'center',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 5,
  },
  passwordButtonText: {
    color: '#000000',
    fontSize: 18, 
    fontWeight: '600', 
  },
});

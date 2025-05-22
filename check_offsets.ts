import { checkSheetOffsets } from './src/services/api';

// Call our offset check function
console.log('Running sheet offset check...');
checkSheetOffsets().then(() => {
  console.log('Check completed');
}).catch(error => {
  console.error('Error running check:', error);
});

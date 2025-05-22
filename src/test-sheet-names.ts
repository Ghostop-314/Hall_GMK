const getSheetName = (date: Date): string => {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `'${months[date.getMonth()]} ${date.getFullYear()}'!`;
};

const testDates = [
    new Date('2025-05-16'), // May
    new Date('2025-06-16'), // June
    new Date('2025-01-16'), // January
];

testDates.forEach(date => {
    console.log(`${date.toLocaleDateString()}: ${getSheetName(date)}`);
});

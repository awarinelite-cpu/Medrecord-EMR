/**
 * EMR (Electronic Medical Record) Number Utilities
 * Handles generation and validation of auto-generated EMR numbers
 */

/**
 * Generate a unique EMR number
 * Format: EMR-YYYYMMDD-XXXXX (e.g., EMR-20260606-A7F2K)
 * @returns {string} Generated EMR number
 */
export const generateEMRNumber = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  
  // Generate random alphanumeric suffix (5 characters)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomSuffix = '';
  for (let i = 0; i < 5; i++) {
    randomSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return `EMR-${dateStr}-${randomSuffix}`;
};

/**
 * Validate if a string is a valid EMR number format
 * @param {string} emrNumber - EMR number to validate
 * @returns {boolean} True if valid EMR format
 */
export const isValidEMRFormat = (emrNumber) => {
  if (!emrNumber || typeof emrNumber !== 'string') return false;
  
  // Pattern: EMR-YYYYMMDD-XXXXX
  const emrPattern = /^EMR-\d{8}-[A-Z0-9]{5}$/;
  return emrPattern.test(emrNumber.toUpperCase());
};

/**
 * Extract date from EMR number
 * @param {string} emrNumber - EMR number
 * @returns {Date|null} Date object or null if invalid
 */
export const getEMRDate = (emrNumber) => {
  if (!isValidEMRFormat(emrNumber)) return null;
  
  const dateStr = emrNumber.split('-')[1]; // Get YYYYMMDD part
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  
  return new Date(year, month, day);
};

/**
 * Format EMR number for display
 * @param {string} emrNumber - EMR number
 * @returns {string} Formatted EMR number
 */
export const formatEMRNumber = (emrNumber) => {
  if (!emrNumber) return 'N/A';
  return emrNumber.toUpperCase();
};

/**
 * Search patients by EMR number or name
 * @param {Array} patients - List of patient objects
 * @param {string} searchTerm - Search term (EMR or name)
 * @returns {Array} Filtered patients
 */
export const searchPatientsByEMR = (patients, searchTerm) => {
  if (!searchTerm || !patients) return [];
  
  const term = searchTerm.toLowerCase().trim();
  return patients.filter(patient => {
    const emr = (patient.emr || '').toLowerCase();
    const name = (patient.name || '').toLowerCase();
    return emr.includes(term) || name.includes(term);
  });
};

/**
 * Get patient by EMR number (exact match)
 * @param {Array} patients - List of patient objects
 * @param {string} emrNumber - EMR number to search for
 * @returns {Object|null} Patient object or null
 */
export const getPatientByEMR = (patients, emrNumber) => {
  if (!emrNumber || !patients) return null;
  
  const normalizedEMR = emrNumber.toUpperCase().trim();
  return patients.find(p => p.emr && p.emr.toUpperCase() === normalizedEMR) || null;
};

/**
 * Check if EMR number already exists
 * @param {Array} patients - List of patient objects
 * @param {string} emrNumber - EMR number to check
 * @returns {boolean} True if EMR exists
 */
export const emrExists = (patients, emrNumber) => {
  return getPatientByEMR(patients, emrNumber) !== null;
};

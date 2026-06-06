/**
 * INTEGRATION GUIDE: PatientSearch Component
 * 
 * This document outlines the modifications needed to integrate the PatientSearch component
 * into your existing App.jsx file.
 */

// ============================================================================
// STEP 1: Add Import Statement at the Top of App.jsx
// ============================================================================
// Add this after your existing imports (around line 1-5):

import PatientSearch from './PatientSearch';
import { generateEMRNumber } from './emrUtils';

// ============================================================================
// STEP 2: Add State Variables in Your Main App Component
// ============================================================================
// Add these states near your existing useState declarations (around line 70-80):

const [showPatientSearch, setShowPatientSearch] = useState(false);  // Toggle patient search view
const [searchSection, setSearchSection] = useState("search");      // Current section: 'search' or 'main'

// ============================================================================
// STEP 3: Modify the Login Success Handler
// ============================================================================
// Find where login is successful (around line 1530-1550) and add:

// After successful authentication, set the search section first
useEffect(() => {
  if (user && user.email) {
    setSearchSection("search");  // Show patient search on first login
  }
}, [user]);

// ============================================================================
// STEP 4: Create a Patient Selection Handler
// ============================================================================
// Add this function in your App component (around line 2950):

const handlePatientSearchSelect = (patientId) => {
  // Find and set the selected patient
  const selectedPatient = patients.find(p => p.id === patientId);
  if (selectedPatient) {
    setSelectedId(patientId);
    setSection("patients");  // Switch to patient details view
    setSearchSection("main"); // Exit search view
  }
};

// ============================================================================
// STEP 5: Modify Your Main Return/Render Logic
// ============================================================================
// In your main App return statement, wrap your existing render with a check:

// Around the main return statement (before your existing JSX), add:
if (!user) {
  return /* Your existing auth/login UI */;
}

// After login, if in search section, show PatientSearch
if (searchSection === "search") {
  return (
    <PatientSearch
      patients={patients}
      onSelectPatient={handlePatientSearchSelect}
      user={user}
      onClose={() => setSearchSection("main")}
    />
  );
}

// Then render your normal dashboard/app UI...
return (
  /* Your existing main app JSX */
);

// ============================================================================
// STEP 6: Add "New Patient" Button with EMR Generation
// ============================================================================
// In your "Add Patient" modal/form, when creating a new patient, use:

const newPatientData = {
  id: uid(),
  name: "Patient Name",
  emr: generateEMRNumber(),  // Auto-generate EMR number
  // ... other fields
};

// ============================================================================
// EXAMPLE: Complete Integration in handleAddPatient
// ============================================================================

const handleAddPatient = async (data) => {
  try {
    const newPatient = {
      ...data,
      id: uid(),
      emr: data.emr || generateEMRNumber(),  // Use provided or generate new
      createdAt: new Date().toISOString(),
    };
    await FB.savePatient(newPatient);
    setPatients([...patients, newPatient]);
    showToast("Patient added successfully!");
    // Show search page after adding patient
    setSearchSection("search");
  } catch (e) {
    showToast("Error: " + e.message, "error");
  }
};

// ============================================================================
// STEP 7: Optional - Add Search Button to Navigation
// ============================================================================
// Add a button in your navigation/header to return to search:

<button onClick={() => setSearchSection("search")} className="nav-search-btn">
  🔍 Patient Search
</button>

// ============================================================================
// FILES CREATED:
// ============================================================================
// 1. src/PatientSearch.jsx - Main search component with UI
// 2. src/emrUtils.js - EMR generation and validation utilities
// 3. INTEGRATION_GUIDE.js - This file with detailed instructions
// ============================================================================

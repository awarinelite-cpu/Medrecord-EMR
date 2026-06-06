import { useState, useEffect } from 'react';

export default function PatientSearch({ patients, onSelectPatient, onClose, user }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [recentPatients, setRecentPatients] = useState([]);

  // Load recent patients from localStorage on mount
  useEffect(() => {
    const recent = localStorage.getItem('recentPatients');
    if (recent) {
      try {
        const recentIds = JSON.parse(recent);
        const recents = patients.filter(p => recentIds.includes(p.id)).slice(0, 5);
        setRecentPatients(recents);
      } catch (e) {
        console.error('Error loading recent patients:', e);
      }
    }
  }, [patients]);

  // Search patients by EMR number or name
  const handleSearch = (e) => {
    const term = e.target.value.toLowerCase().trim();
    setSearchTerm(term);
    setLoading(true);

    if (!term) {
      setFilteredPatients([]);
      setNoResults(false);
      setLoading(false);
      return;
    }

    // Simulate slight delay for better UX
    setTimeout(() => {
      const results = patients.filter(patient => {
        const emr = (patient.emr || "").toLowerCase();
        const name = (patient.name || "").toLowerCase();
        return emr.includes(term) || name.includes(term);
      });

      setFilteredPatients(results);
      setNoResults(results.length === 0);
      setLoading(false);
    }, 300);
  };

  // Handle patient selection
  const handleSelectPatient = (patientId) => {
    // Save to recent patients
    const recent = localStorage.getItem('recentPatients');
    let recentIds = recent ? JSON.parse(recent) : [];
    recentIds = [patientId, ...recentIds.filter(id => id !== patientId)].slice(0, 10);
    localStorage.setItem('recentPatients', JSON.stringify(recentIds));

    onSelectPatient(patientId);
  };

  const PatientCard = ({ patient }) => (
    <div 
      className="patient-card"
      onClick={() => handleSelectPatient(patient.id)}
    >
      <div className="patient-card-header">
        <div className="patient-emr-badge">
          <strong>{patient.emr || 'N/A'}</strong>
        </div>
        <div className="patient-status">
          {patient.status === 'discharged' ? '✓ Discharged' : '🏥 Active'}
        </div>
      </div>
      <div className="patient-card-body">
        <h3 className="patient-name">{patient.name}</h3>
        <div className="patient-details">
          <span className="detail-item">
            <strong>Ward:</strong> {patient.ward || 'N/A'}
          </span>
          <span className="detail-item">
            <strong>Physician:</strong> {patient.physician || 'Unassigned'}
          </span>
        </div>
        <div className="patient-meta">
          <span className="meta-item">
            🎂 {patient.dob ? new Date(patient.dob).toLocaleDateString() : 'N/A'}
          </span>
          <span className="meta-item">
            👤 {patient.gender || 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="patient-search-container">
      <div className="patient-search-header">
        <div className="search-header-top">
          <h1>🔍 Patient Search</h1>
          <p className="search-subtitle">Welcome, {user?.name}! Search for a patient to view their EMR.</p>
        </div>

        <div className="search-input-wrapper">
          <div className="search-input-field">
            <input
              type="text"
              placeholder="Search by EMR number or patient name..."
              value={searchTerm}
              onChange={handleSearch}
              className="search-input"
              autoFocus
            />
            {searchTerm && (
              <button 
                className="clear-search-btn"
                onClick={() => {
                  setSearchTerm("");
                  setFilteredPatients([]);
                  setNoResults(false);
                }}
              >
                ✕
              </button>
            )}
          </div>
          {searchTerm && (
            <div className="search-hint">
              Found {filteredPatients.length} patient{filteredPatients.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      <div className="patient-search-content">
        {/* Search Results */}
        {searchTerm ? (
          <div className="search-results-section">
            {loading && (
              <div className="loading-state">
                <span className="spinner"></span>
                <p>Searching patients...</p>
              </div>
            )}

            {!loading && noResults && (
              <div className="empty-state">
                <div className="empty-icon">🔎</div>
                <h3>No patients found</h3>
                <p>Try searching with a different EMR number or patient name</p>
              </div>
            )}

            {!loading && filteredPatients.length > 0 && (
              <div className="results-list">
                <h2 className="results-title">Search Results</h2>
                <div className="patient-cards-grid">
                  {filteredPatients.map(patient => (
                    <PatientCard key={patient.id} patient={patient} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          // Recent Patients or Empty State
          <>
            {recentPatients.length > 0 ? (
              <div className="recent-patients-section">
                <h2 className="section-title">📋 Recently Viewed Patients</h2>
                <div className="patient-cards-grid">
                  {recentPatients.map(patient => (
                    <PatientCard key={patient.id} patient={patient} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state large">
                <div className="empty-icon">📋</div>
                <h3>Start Your Search</h3>
                <p>Enter a patient's EMR number or name to get started</p>
              </div>
            )}
          </>
        )}
      </div>

      <style jsx>{`
        .patient-search-container {
          width: 100%;
          height: 100vh;
          display: flex;
          flex-direction: column;
          background: linear-gradient(135deg, #0f1e2e 0%, #1a2a3a 100%);
          color: #e0e6ed;
          overflow: hidden;
        }

        .patient-search-header {
          padding: 2rem;
          background: rgba(15, 30, 46, 0.8);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .search-header-top {
          margin-bottom: 1.5rem;
        }

        .patient-search-header h1 {
          margin: 0;
          font-size: 2rem;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.5px;
        }

        .search-subtitle {
          margin: 0.5rem 0 0;
          color: #a0aab5;
          font-size: 0.95rem;
        }

        .search-input-wrapper {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .search-input-field {
          position: relative;
          width: 100%;
        }

        .search-input {
          width: 100%;
          padding: 0.875rem 1rem 0.875rem 1rem;
          border: 2px solid rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          font-size: 1rem;
          transition: all 0.3s ease;
          font-family: inherit;
        }

        .search-input::placeholder {
          color: #708090;
        }

        .search-input:focus {
          outline: none;
          border-color: #4a90e2;
          background: rgba(255, 255, 255, 0.12);
          box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.1);
        }

        .clear-search-btn {
          position: absolute;
          right: 1rem;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #708090;
          cursor: pointer;
          font-size: 1.2rem;
          padding: 0.25rem 0.5rem;
          transition: color 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .clear-search-btn:hover {
          color: #fff;
        }

        .search-hint {
          font-size: 0.85rem;
          color: #708090;
          padding: 0 0.25rem;
        }

        .patient-search-content {
          flex: 1;
          overflow-y: auto;
          padding: 2rem;
          display: flex;
          flex-direction: column;
        }

        .search-results-section,
        .recent-patients-section {
          width: 100%;
        }

        .results-title,
        .section-title {
          font-size: 1.3rem;
          font-weight: 600;
          margin: 0 0 1.5rem;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .patient-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1.5rem;
          width: 100%;
        }

        .patient-card {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.04) 100%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          padding: 1.25rem;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .patient-card:hover {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.08) 100%);
          border-color: rgba(74, 144, 226, 0.3);
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        }

        .patient-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.25rem;
        }

        .patient-emr-badge {
          background: rgba(74, 144, 226, 0.15);
          border: 1px solid rgba(74, 144, 226, 0.3);
          border-radius: 6px;
          padding: 0.4rem 0.75rem;
          font-size: 0.9rem;
          color: #4a90e2;
          letter-spacing: 0.5px;
        }

        .patient-status {
          font-size: 0.85rem;
          color: #a0aab5;
          white-space: nowrap;
        }

        .patient-card-body {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .patient-name {
          margin: 0;
          font-size: 1.15rem;
          font-weight: 600;
          color: #fff;
          line-height: 1.3;
        }

        .patient-details {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .detail-item {
          font-size: 0.9rem;
          color: #a0aab5;
          line-height: 1.4;
        }

        .detail-item strong {
          color: #c0c6d1;
          font-weight: 600;
        }

        .patient-meta {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          margin-top: 0.5rem;
        }

        .meta-item {
          font-size: 0.85rem;
          color: #708090;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 2rem;
          color: #a0aab5;
        }

        .empty-state.large {
          min-height: 300px;
        }

        .empty-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
          opacity: 0.8;
        }

        .empty-state h3 {
          margin: 0 0 0.5rem;
          font-size: 1.3rem;
          color: #c0c6d1;
        }

        .empty-state p {
          margin: 0;
          font-size: 0.95rem;
          color: #708090;
        }

        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          padding: 3rem 2rem;
          min-height: 200px;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255, 255, 255, 0.15);
          border-top-color: #4a90e2;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .loading-state p {
          color: #a0aab5;
          font-size: 0.95rem;
          margin: 0;
        }

        /* Scrollbar styling */
        .patient-search-content::-webkit-scrollbar {
          width: 8px;
        }

        .patient-search-content::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
        }

        .patient-search-content::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
        }

        .patient-search-content::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        @media (max-width: 768px) {
          .patient-search-container {
            height: auto;
            min-height: 100vh;
          }

          .patient-search-header {
            padding: 1.5rem;
          }

          .patient-search-header h1 {
            font-size: 1.5rem;
          }

          .patient-cards-grid {
            grid-template-columns: 1fr;
            gap: 1rem;
          }

          .patient-search-content {
            padding: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}

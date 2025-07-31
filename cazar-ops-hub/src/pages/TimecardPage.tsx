import { useState, useEffect } from 'react';
import { Calendar, AlertCircle, CheckCircle, Clock, Filter, Download, RefreshCw } from 'lucide-react';
import { generateMockDrivers, generateMockRoutes, generateMockTimecards, generateMockDiscrepancies } from '../services/mockData';
import type { TimecardDiscrepancy } from '../types';

export default function TimecardPage() {
  const [discrepancies, setDiscrepancies] = useState<TimecardDiscrepancy[]>([]);
  const [selectedDateRange, setSelectedDateRange] = useState('week');
  const [selectedSeverity, setSelectedSeverity] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setLoading(true);
    // Generate mock data
    const mockDrivers = generateMockDrivers(25);
    const mockRoutes = generateMockRoutes(mockDrivers);
    const mockTimecards = generateMockTimecards(mockRoutes);
    const mockDiscrepancies = generateMockDiscrepancies(mockTimecards, mockRoutes, mockDrivers);

    setDiscrepancies(mockDiscrepancies);
    setLoading(false);
  };

  const runReconciliation = () => {
    setReconciling(true);
    // Simulate AI reconciliation process
    setTimeout(() => {
      loadData();
      setReconciling(false);
    }, 2000);
  };

  const resolveDiscrepancy = (id: string) => {
    setDiscrepancies(prev => 
      prev.map(d => d.id === id ? { ...d, status: 'resolved' } : d)
    );
  };

  const escalateDiscrepancy = (id: string) => {
    setDiscrepancies(prev => 
      prev.map(d => d.id === id ? { ...d, status: 'escalated' } : d)
    );
  };

  // Filter discrepancies
  const filteredDiscrepancies = discrepancies.filter(d => {
    if (selectedSeverity !== 'all' && d.severity !== selectedSeverity) return false;
    if (selectedStatus !== 'all' && d.status !== selectedStatus) return false;
    return true;
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  // Calculate summary stats
  const totalDiscrepancies = discrepancies.length;
  const highSeverity = discrepancies.filter(d => d.severity === 'high').length;
  const totalVarianceHours = discrepancies.reduce((sum, d) => sum + (d.variance || 0), 0);
  const resolvedToday = discrepancies.filter(d => d.status === 'resolved').length;

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>
          Timecard Reconciliation
        </h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            className="btn btn-secondary"
            onClick={() => {}}
          >
            <Download size={18} />
            Export Report
          </button>
          <button 
            className="btn btn-primary"
            onClick={runReconciliation}
            disabled={reconciling}
          >
            {reconciling ? (
              <>
                <div className="spinner" style={{ width: '18px', height: '18px' }}></div>
                Running AI Analysis...
              </>
            ) : (
              <>
                <RefreshCw size={18} />
                Run Reconciliation
              </>
            )}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3>Total Discrepancies</h3>
              <div className="value">{totalDiscrepancies}</div>
              <div className="change negative">
                <AlertCircle size={16} style={{ display: 'inline', marginRight: '4px' }} />
                {highSeverity} high severity
              </div>
            </div>
            <AlertCircle size={24} color="var(--warning)" />
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3>Total Variance</h3>
              <div className="value">{totalVarianceHours.toFixed(1)} hrs</div>
              <div className="change">
                <Clock size={16} style={{ display: 'inline', marginRight: '4px' }} />
                Across all discrepancies
              </div>
            </div>
            <Clock size={24} color="var(--primary)" />
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3>Resolved Today</h3>
              <div className="value">{resolvedToday}</div>
              <div className="change positive">
                <CheckCircle size={16} style={{ display: 'inline', marginRight: '4px' }} />
                Successfully reconciled
              </div>
            </div>
            <CheckCircle size={24} color="var(--success)" />
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3>AI Accuracy</h3>
              <div className="value">94.5%</div>
              <div className="change positive">
                Detection accuracy rate
              </div>
            </div>
            <Calendar size={24} color="var(--accent)" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Filter size={20} />
          
          <select 
            className="input" 
            style={{ width: 'auto' }}
            value={selectedDateRange}
            onChange={(e) => setSelectedDateRange(e.target.value)}
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>

          <select 
            className="input" 
            style={{ width: 'auto' }}
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
          >
            <option value="all">All Severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select 
            className="input" 
            style={{ width: 'auto' }}
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="escalated">Escalated</option>
          </select>
        </div>
      </div>

      {/* Discrepancies Table */}
      <div className="card">
        <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: 600 }}>
          Detected Discrepancies
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>ADP Hours</th>
                <th>Amazon Hours</th>
                <th>Variance</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDiscrepancies.map((disc) => (
                <tr key={disc.id}>
                  <td>{disc.driver_name}</td>
                  <td>{new Date(disc.date).toLocaleDateString()}</td>
                  <td>{disc.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
                  <td style={{ maxWidth: '300px', fontSize: '0.875rem' }}>{disc.description}</td>
                  <td>{(disc.adp_hours || 0).toFixed(2)}</td>
                  <td>{(disc.amazon_hours || 0).toFixed(2)}</td>
                  <td>
                    <span style={{ 
                      color: (disc.variance || 0) > 0.5 ? 'var(--danger)' : 'var(--warning)',
                      fontWeight: 500
                    }}>
                      {(disc.variance || 0).toFixed(2)} hrs
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${
                      disc.severity === 'high' ? 'danger' : 
                      disc.severity === 'medium' ? 'warning' : 
                      'info'
                    }`}>
                      {disc.severity}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${
                      disc.status === 'resolved' ? 'success' : 
                      disc.status === 'escalated' ? 'danger' : 
                      'warning'
                    }`}>
                      {disc.status}
                    </span>
                  </td>
                  <td>
                    {disc.status === 'pending' && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '0.25rem 0.5rem' }}
                          onClick={() => disc.id && resolveDiscrepancy(disc.id)}
                          disabled={!disc.id}
                        >
                          Resolve
                        </button>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '0.25rem 0.5rem' }}
                          onClick={() => disc.id && escalateDiscrepancy(disc.id)}
                          disabled={!disc.id}
                        >
                          Escalate
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
} 
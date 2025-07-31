import { useEffect, useState } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, Clock, Users, Package, DollarSign } from 'lucide-react';
import { generateMockDrivers, generateMockRoutes, generateMockTimecards, generateMockDiscrepancies } from '../services/mockData';
import type { Driver, Route, TimecardDiscrepancy } from '../types';

export default function DashboardPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [discrepancies, setDiscrepancies] = useState<TimecardDiscrepancy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Generate mock data
    const mockDrivers = generateMockDrivers(25);
    const mockRoutes = generateMockRoutes(mockDrivers);
    const mockTimecards = generateMockTimecards(mockRoutes);
    const mockDiscrepancies = generateMockDiscrepancies(mockTimecards, mockRoutes, mockDrivers);

    setDrivers(mockDrivers);
    setRoutes(mockRoutes);
    setDiscrepancies(mockDiscrepancies);
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  // Calculate stats
  const activeDrivers = drivers.filter(d => d.driver_status === 'active').length;
  const totalPackagesDelivered = routes.reduce((sum, r) => sum + r.packages_delivered, 0);
  const avgDeliveryRate = routes.length > 0 
    ? routes.reduce((sum, r) => sum + (r.packages_delivered / r.total_packages), 0) / routes.length * 100
    : 0;
  const pendingDiscrepancies = discrepancies.filter(d => d.status === 'pending').length;

  // Prepare chart data
  const dailyDeliveryData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayRoutes = routes.filter(r => r.route_date === dateStr);
    
    return {
      date: date.toLocaleDateString('en-US', { weekday: 'short' }),
      packages: dayRoutes.reduce((sum, r) => sum + r.packages_delivered, 0),
      routes: dayRoutes.length
    };
  }).reverse();

  const discrepancyTypeData = [
    { name: 'Time Mismatch', value: discrepancies.filter(d => d.type === 'time_mismatch').length },
    { name: 'Overtime Alert', value: discrepancies.filter(d => d.type === 'overtime_alert').length },
    { name: 'Missing Punch', value: discrepancies.filter(d => d.type === 'missing_punch').length },
    { name: 'Break Violation', value: discrepancies.filter(d => d.type === 'break_violation').length }
  ];

  const COLORS = ['#3b82f6', '#f59e0b', '#ef4444', '#22c55e'];

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem' }}>
        Operations Dashboard
      </h1>

      {/* Stats Grid */}
      <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3>Active Drivers</h3>
              <div className="value">{activeDrivers}</div>
              <div className="change positive">
                <TrendingUp size={16} style={{ display: 'inline', marginRight: '4px' }} />
                +2 from last week
              </div>
            </div>
            <Users size={24} color="var(--primary)" />
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3>Packages Delivered</h3>
              <div className="value">{totalPackagesDelivered.toLocaleString()}</div>
              <div className="change positive">
                <TrendingUp size={16} style={{ display: 'inline', marginRight: '4px' }} />
                {avgDeliveryRate.toFixed(1)}% delivery rate
              </div>
            </div>
            <Package size={24} color="var(--success)" />
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3>Pending Discrepancies</h3>
              <div className="value">{pendingDiscrepancies}</div>
              <div className="change negative">
                <AlertTriangle size={16} style={{ display: 'inline', marginRight: '4px' }} />
                Requires attention
              </div>
            </div>
            <Clock size={24} color="var(--warning)" />
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3>Weekly Payroll</h3>
              <div className="value">$48,350</div>
              <div className="change negative">
                <TrendingDown size={16} style={{ display: 'inline', marginRight: '4px' }} />
                -5% from last week
              </div>
            </div>
            <DollarSign size={24} color="var(--accent)" />
          </div>
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '1.5rem' }}>
        {/* Daily Deliveries Chart */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: 600 }}>
            Daily Delivery Performance
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyDeliveryData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="packages" fill="#3b82f6" name="Packages Delivered" />
              <Bar dataKey="routes" fill="#22c55e" name="Routes Completed" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Discrepancy Types Chart */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: 600 }}>
            Discrepancy Breakdown
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={discrepancyTypeData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {discrepancyTypeData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Discrepancies Table */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.125rem', fontWeight: 600 }}>
          Recent Timecard Discrepancies
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Date</th>
                <th>Type</th>
                <th>Variance</th>
                <th>Severity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {discrepancies.slice(0, 5).map((disc) => (
                <tr key={disc.id}>
                  <td>{disc.driver_name}</td>
                  <td>{new Date(disc.date).toLocaleDateString()}</td>
                  <td>{disc.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
                  <td>{disc.variance.toFixed(2)} hrs</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
} 
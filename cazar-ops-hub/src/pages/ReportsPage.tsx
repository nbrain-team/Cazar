import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Calendar, TrendingUp, DollarSign, Clock, Users, Package, AlertTriangle, FileText } from 'lucide-react';
import { format, subDays, startOfWeek, endOfWeek } from 'date-fns';

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState('week');
  const [reportType, setReportType] = useState('overview');
  const [loading, setLoading] = useState(true);
  
  // Mock data for charts
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  const [payrollData, setPayrollData] = useState<any[]>([]);
  const [discrepancyData, setDiscrepancyData] = useState<any[]>([]);
  const [driverMetrics, setDriverMetrics] = useState<any[]>([]);

  useEffect(() => {
    // Simulate loading data
    setTimeout(() => {
      // Generate mock performance data
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      setPerformanceData(days.map(day => ({
        day,
        deliveries: Math.floor(Math.random() * 500) + 300,
        onTime: Math.floor(Math.random() * 95) + 85,
        hours: Math.floor(Math.random() * 200) + 150
      })));

      // Generate mock payroll data
      setPayrollData([
        { category: 'Regular Hours', amount: 45000, percentage: 65 },
        { category: 'Overtime', amount: 12000, percentage: 17 },
        { category: 'Bonuses', amount: 8000, percentage: 12 },
        { category: 'Other', amount: 4000, percentage: 6 }
      ]);

      // Generate mock discrepancy data
      setDiscrepancyData([
        { type: 'Clock-in Mismatch', count: 23, severity: 'high' },
        { type: 'Break Time Variance', count: 15, severity: 'medium' },
        { type: 'Overtime Discrepancy', count: 8, severity: 'high' },
        { type: 'Missing Punch', count: 12, severity: 'low' }
      ]);

      // Generate mock driver metrics
      setDriverMetrics(Array.from({ length: 10 }, (_, i) => ({
        driver: `Driver ${i + 1}`,
        deliveries: Math.floor(Math.random() * 200) + 100,
        onTimeRate: Math.floor(Math.random() * 15) + 85,
        safetyScore: Math.floor(Math.random() * 10) + 90,
        revenue: Math.floor(Math.random() * 5000) + 3000
      })));

      setLoading(false);
    }, 1000);
  }, [dateRange]);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>
          Reports & Analytics
        </h1>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <select 
            className="input" 
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            style={{ width: 'auto' }}
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
          </select>
          
          <button className="btn btn-primary">
            <FileText size={18} />
            Export Report
          </button>
        </div>
      </div>

      {/* Report Type Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        {['overview', 'performance', 'payroll', 'discrepancies'].map(type => (
          <button
            key={type}
            className={`btn ${reportType === type ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setReportType(type)}
            style={{ textTransform: 'capitalize' }}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Overview Report */}
      {reportType === 'overview' && (
        <>
          {/* KPI Cards */}
          <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
            <div className="stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Total Deliveries</h3>
                <Package size={24} style={{ color: 'var(--primary)' }} />
              </div>
              <div className="value">2,847</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--success)' }}>
                <TrendingUp size={16} style={{ display: 'inline' }} /> +12% from last week
              </div>
            </div>
            
            <div className="stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Total Hours</h3>
                <Clock size={24} style={{ color: 'var(--primary)' }} />
              </div>
              <div className="value">1,234</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Avg: 49.4 hrs/driver
              </div>
            </div>
            
            <div className="stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Labor Cost</h3>
                <DollarSign size={24} style={{ color: 'var(--primary)' }} />
              </div>
              <div className="value">$69,000</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--danger)' }}>
                <TrendingUp size={16} style={{ display: 'inline' }} /> +8% from budget
              </div>
            </div>
            
            <div className="stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Active Drivers</h3>
                <Users size={24} style={{ color: 'var(--primary)' }} />
              </div>
              <div className="value">25</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                3 on leave
              </div>
            </div>
          </div>

          {/* Charts Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '1.5rem' }}>
            {/* Daily Performance Chart */}
            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>Daily Performance</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="deliveries" fill="#8884d8" name="Deliveries" />
                  <Bar dataKey="hours" fill="#82ca9d" name="Hours Worked" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Payroll Distribution */}
            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>Payroll Distribution</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={payrollData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ percentage }) => `${percentage}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="amount"
                  >
                    {payrollData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* Performance Report */}
      {reportType === 'performance' && (
        <>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Driver Performance Rankings</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Driver</th>
                    <th>Deliveries</th>
                    <th>On-Time Rate</th>
                    <th>Safety Score</th>
                    <th>Revenue Generated</th>
                  </tr>
                </thead>
                <tbody>
                  {driverMetrics
                    .sort((a, b) => b.deliveries - a.deliveries)
                    .map((driver, index) => (
                      <tr key={driver.driver}>
                        <td>{index + 1}</td>
                        <td>{driver.driver}</td>
                        <td>{driver.deliveries}</td>
                        <td>
                          <span className={`badge badge-${driver.onTimeRate >= 95 ? 'success' : driver.onTimeRate >= 90 ? 'warning' : 'danger'}`}>
                            {driver.onTimeRate}%
                          </span>
                        </td>
                        <td>
                          <span className={`badge badge-${driver.safetyScore >= 95 ? 'success' : driver.safetyScore >= 90 ? 'warning' : 'danger'}`}>
                            {driver.safetyScore}
                          </span>
                        </td>
                        <td>${driver.revenue.toLocaleString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Performance Trends</h3>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="onTime" stroke="#8884d8" name="On-Time %" />
                <Line type="monotone" dataKey="deliveries" stroke="#82ca9d" name="Deliveries" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Payroll Report */}
      {reportType === 'payroll' && (
        <>
          <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
            <div className="stat-card">
              <h3>Total Payroll</h3>
              <div className="value">$69,000</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                This period
              </div>
            </div>
            <div className="stat-card">
              <h3>Overtime Hours</h3>
              <div className="value">234</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--warning)' }}>
                15% of total hours
              </div>
            </div>
            <div className="stat-card">
              <h3>Average Hourly Rate</h3>
              <div className="value">$22.50</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Across all drivers
              </div>
            </div>
            <div className="stat-card">
              <h3>Bonus Payouts</h3>
              <div className="value">$8,000</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--success)' }}>
                12 drivers qualified
              </div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Weekly Payroll Breakdown</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={[
                { week: 'Week 1', regular: 35000, overtime: 5000, bonus: 3000 },
                { week: 'Week 2', regular: 38000, overtime: 7000, bonus: 2000 },
                { week: 'Week 3', regular: 40000, overtime: 6000, bonus: 3500 },
                { week: 'Week 4', regular: 42000, overtime: 8000, bonus: 4000 }
              ]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="regular" stackId="a" fill="#8884d8" name="Regular Pay" />
                <Bar dataKey="overtime" stackId="a" fill="#82ca9d" name="Overtime" />
                <Bar dataKey="bonus" stackId="a" fill="#ffc658" name="Bonuses" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Discrepancies Report */}
      {reportType === 'discrepancies' && (
        <>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>Timecard Discrepancies Summary</h3>
              <AlertTriangle size={24} style={{ color: 'var(--warning)' }} />
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              {discrepancyData.map(item => (
                <div key={item.type} style={{ 
                  padding: '1rem', 
                  border: '1px solid var(--border)', 
                  borderRadius: '8px',
                  borderLeft: `4px solid var(--${item.severity === 'high' ? 'danger' : item.severity === 'medium' ? 'warning' : 'info'})`
                }}>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{item.type}</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginTop: '0.5rem' }}>{item.count}</div>
                </div>
              ))}
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={discrepancyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="type" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#ff7300" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Resolution Status</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--danger)' }}>23</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Pending Review</div>
              </div>
              <div>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--warning)' }}>15</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>In Progress</div>
              </div>
              <div>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--success)' }}>42</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Resolved</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
} 
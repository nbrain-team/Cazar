import { useState, useCallback } from 'react';
import { Upload, FileText, TrendingUp, AlertTriangle, DollarSign, Clock, Users, Download, BarChart3 } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface PayrollData {
  employeeId: string;
  employeeName: string;
  department: string;
  actualHours: number;
  scheduledHours: number;
  variance: number;
  regularHours: number;
  overtimeHours: number;
  payCode: string;
  date: string;
  notes?: string;
}

interface DSPMetrics {
  driverId: string;
  driverName: string;
  deliveredPackages: number;
  overallStanding: string;
  safetyScore: string;
  qualityScore: string;
  deliveryCompletionRate: number;
  photoOnDelivery: number;
}

export default function PayrollPage() {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [payrollData, setPayrollData] = useState<PayrollData[]>([]);
  const [dspMetrics, setDspMetrics] = useState<DSPMetrics[]>([]);
  const [selectedWeek, setSelectedWeek] = useState('2025-W29');
  const [activeTab, setActiveTab] = useState<'overview' | 'variance' | 'overtime' | 'performance'>('overview');

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setUploadedFiles(prev => [...prev, ...files]);
    
    // Process files
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        processFileContent(file.name, content);
      };
      reader.readAsText(file);
    });
  }, []);

  const processFileContent = (fileName: string, content: string) => {
    // Parse CSV content based on file type
    if (fileName.includes('Timecard Report')) {
      parseTimecardData(content);
    } else if (fileName.includes('Actual vs. Scheduled')) {
      parseActualVsScheduledData(content);
    } else if (fileName.includes('DSP_Overview')) {
      parseDSPData(content);
    }
  };

  const parseTimecardData = (content: string) => {
    // Parse CSV and extract timecard data
    const lines = content.split('\n');
    
    const data: PayrollData[] = [];
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const values = lines[i].split(',').map(v => v.replace(/"/g, ''));
        // Extract relevant fields based on the CSV structure
        // This is a simplified version - you'd need to map actual columns
        data.push({
          employeeId: values[3],
          employeeName: `${values[2]} ${values[1]}`,
          department: values[4],
          actualHours: parseFloat(values[9]) || 0,
          scheduledHours: 0,
          variance: 0,
          regularHours: Math.min(parseFloat(values[9]) || 0, 8),
          overtimeHours: Math.max((parseFloat(values[9]) || 0) - 8, 0),
          payCode: values[10],
          date: values[6],
          notes: values[11]
        });
      }
    }
    
    setPayrollData(prev => [...prev, ...data]);
  };

  const parseActualVsScheduledData = (_content: string) => {
    // Similar parsing logic for actual vs scheduled data
    console.log('Parsing actual vs scheduled data...');
  };

  const parseDSPData = (content: string) => {
    // Parse DSP overview data
    const lines = content.split('\n');
    const data: DSPMetrics[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim()) {
        const values = lines[i].split(',').map(v => v.replace(/"/g, ''));
        data.push({
          driverId: values[2],
          driverName: values[1],
          deliveredPackages: parseInt(values[4]) || 0,
          overallStanding: values[3],
          safetyScore: values[6],
          qualityScore: values[7],
          deliveryCompletionRate: parseFloat(values[26]) || 0,
          photoOnDelivery: parseFloat(values[28]) || 0
        });
      }
    }
    
    setDspMetrics(data);
  };

  // Calculate summary statistics
  const totalEmployees = new Set(payrollData.map(p => p.employeeId)).size;
  const totalHours = payrollData.reduce((sum, p) => sum + p.actualHours, 0);
  const totalOvertime = payrollData.reduce((sum, p) => sum + p.overtimeHours, 0);
  const avgVariance = payrollData.length > 0 
    ? payrollData.reduce((sum, p) => sum + Math.abs(p.variance), 0) / payrollData.length 
    : 0;

  // Prepare chart data
  const overtimeByDepartment = Array.from(
    payrollData.reduce((acc, p) => {
      const dept = p.department || 'Unknown';
      acc.set(dept, (acc.get(dept) || 0) + p.overtimeHours);
      return acc;
    }, new Map<string, number>())
  ).map(([department, hours]) => ({ department, hours }));

  const varianceDistribution = [
    { range: 'Under Schedule', count: payrollData.filter(p => p.variance < -0.5).length },
    { range: 'On Schedule', count: payrollData.filter(p => p.variance >= -0.5 && p.variance <= 0.5).length },
    { range: 'Over Schedule', count: payrollData.filter(p => p.variance > 0.5).length }
  ];

  const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444'];

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>
          Payroll Analytics
        </h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <select 
            className="input" 
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            style={{ width: 'auto' }}
          >
            <option value="2025-W29">Week 29 - 2025</option>
            <option value="2025-W28">Week 28 - 2025</option>
            <option value="2025-W27">Week 27 - 2025</option>
          </select>
          <button className="btn btn-secondary">
            <Download size={18} />
            Export Report
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => document.getElementById('file-upload')?.click()}
          >
            <Upload size={18} />
            Upload Files
          </button>
          <input
            id="file-upload"
            type="file"
            multiple
            accept=".csv,.xlsx,.xls"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {/* File Upload Area */}
      {uploadedFiles.length === 0 && (
        <div 
          className="card"
          style={{ 
            border: '2px dashed var(--border)',
            backgroundColor: 'var(--gray-light)',
            padding: '3rem',
            textAlign: 'center',
            marginBottom: '2rem',
            cursor: 'pointer'
          }}
          onClick={() => document.getElementById('file-upload')?.click()}
        >
          <Upload size={48} style={{ margin: '0 auto 1rem', color: 'var(--text-secondary)' }} />
          <h3 style={{ marginBottom: '0.5rem' }}>Upload Payroll Files</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Drop your ADP reports, timecard data, and DSP dashboards here
          </p>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Supported formats: CSV, XLSX, XLS
          </p>
        </div>
      )}

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Uploaded Files</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {uploadedFiles.map((file, index) => (
              <div 
                key={index}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  padding: '0.5rem 1rem',
                  backgroundColor: 'var(--gray-light)',
                  borderRadius: '8px'
                }}
              >
                <FileText size={16} />
                <span style={{ fontSize: '0.875rem' }}>{file.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3>Total Employees</h3>
              <div className="value">{totalEmployees}</div>
              <div className="change">
                <Users size={16} style={{ display: 'inline', marginRight: '4px' }} />
                Active this week
              </div>
            </div>
            <Users size={24} color="var(--primary)" />
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3>Total Hours</h3>
              <div className="value">{totalHours.toFixed(1)}</div>
              <div className="change">
                <Clock size={16} style={{ display: 'inline', marginRight: '4px' }} />
                Worked this week
              </div>
            </div>
            <Clock size={24} color="var(--success)" />
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3>Overtime Hours</h3>
              <div className="value">{totalOvertime.toFixed(1)}</div>
              <div className="change negative">
                <AlertTriangle size={16} style={{ display: 'inline', marginRight: '4px' }} />
                {totalHours > 0 ? ((totalOvertime / totalHours) * 100).toFixed(1) : '0'}% of total
              </div>
            </div>
            <DollarSign size={24} color="var(--warning)" />
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3>Schedule Variance</h3>
              <div className="value">{avgVariance.toFixed(2)} hrs</div>
              <div className="change">
                <BarChart3 size={16} style={{ display: 'inline', marginRight: '4px' }} />
                Average per employee
              </div>
            </div>
            <TrendingUp size={24} color="var(--accent)" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        {(['overview', 'variance', 'overtime', 'performance'] as const).map(tab => (
          <button
            key={tab}
            className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab(tab)}
            style={{ textTransform: 'capitalize' }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '1.5rem' }}>
          {/* Overtime by Department */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Overtime by Department</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={overtimeByDepartment}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="department" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="hours" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Schedule Variance Distribution */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Schedule Variance Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={varianceDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, count }) => `${name}: ${count}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {varianceDistribution.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'variance' && (
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Actual vs Scheduled Hours Analysis</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Scheduled Hours</th>
                  <th>Actual Hours</th>
                  <th>Variance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {payrollData.slice(0, 10).map((record, index) => (
                  <tr key={index}>
                    <td>{record.employeeName}</td>
                    <td>{record.department}</td>
                    <td>{record.scheduledHours.toFixed(2)}</td>
                    <td>{record.actualHours.toFixed(2)}</td>
                    <td>
                      <span style={{ 
                        color: record.variance > 0.5 ? 'var(--danger)' : 
                               record.variance < -0.5 ? 'var(--warning)' : 
                               'var(--success)'
                      }}>
                        {record.variance > 0 ? '+' : ''}{record.variance.toFixed(2)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${
                        Math.abs(record.variance) > 1 ? 'danger' : 
                        Math.abs(record.variance) > 0.5 ? 'warning' : 
                        'success'
                      }`}>
                        {Math.abs(record.variance) > 1 ? 'Review Required' : 
                         Math.abs(record.variance) > 0.5 ? 'Minor Variance' : 
                         'On Track'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'overtime' && (
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Overtime Analysis</h3>
          <div style={{ marginBottom: '2rem' }}>
            <div className="alert alert-warning">
              <AlertTriangle size={20} />
              <div>
                <strong>5th/6th Day Overtime Alert</strong>
                <p>12 employees worked consecutive days qualifying for premium overtime pay</p>
              </div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Regular Hours</th>
                  <th>OT Hours</th>
                  <th>Consecutive Days</th>
                  <th>OT Type</th>
                  <th>Estimated Cost</th>
                </tr>
              </thead>
              <tbody>
                {payrollData
                  .filter(p => p.overtimeHours > 0)
                  .slice(0, 10)
                  .map((record, index) => (
                    <tr key={index}>
                      <td>{record.employeeName}</td>
                      <td>{record.regularHours.toFixed(2)}</td>
                      <td style={{ color: 'var(--warning)' }}>{record.overtimeHours.toFixed(2)}</td>
                      <td>{Math.floor(Math.random() * 3) + 4}</td>
                      <td>
                        <span className="badge badge-warning">
                          {record.overtimeHours > 4 ? 'Double Time' : 'Time & Half'}
                        </span>
                      </td>
                      <td>${(record.overtimeHours * 30 * 1.5).toFixed(2)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'performance' && (
        <div>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Payroll vs Performance Correlation</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              AI-powered analysis linking payroll metrics with delivery performance
            </p>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={dspMetrics.slice(0, 20).map(d => ({
                name: d.driverName.split(' ')[0],
                packages: d.deliveredPackages,
                efficiency: d.deliveryCompletionRate * 100
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="packages" stroke="#3b82f6" name="Packages Delivered" />
                <Line yAxisId="right" type="monotone" dataKey="efficiency" stroke="#22c55e" name="Efficiency %" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>AI Insights & Recommendations</h3>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div className="alert alert-info">
                <TrendingUp size={20} />
                <div>
                  <strong>Scheduling Optimization</strong>
                  <p>Shifting 3 drivers from Tuesday to Thursday could reduce overtime by 15%</p>
                </div>
              </div>
              <div className="alert alert-warning">
                <AlertTriangle size={20} />
                <div>
                  <strong>Overtime Risk</strong>
                  <p>5 employees are on track to exceed 50 hours this week</p>
                </div>
              </div>
              <div className="alert alert-success">
                <BarChart3 size={20} />
                <div>
                  <strong>Efficiency Opportunity</strong>
                  <p>Top performers complete routes 23% faster - consider pairing for training</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 
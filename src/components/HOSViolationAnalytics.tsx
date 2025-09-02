import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  TrendingUp, AlertTriangle, DollarSign, Users, 
  Download 
} from 'lucide-react';
import { DatabaseService } from '../services/database';

interface ViolationTrend {
  date: string;
  count: number;
  type: string;
}

interface ViolationByType {
  type: string;
  count: number;
  percentage: number;
  averageCost: number;
}

interface DriverViolationStats {
  driverId: string;
  driverName: string;
  totalViolations: number;
  violationTypes: string[];
  lastViolation: string;
  riskScore: number;
}

interface RootCauseAnalysis {
  cause: string;
  frequency: number;
  impact: 'low' | 'medium' | 'high';
  recommendations: string[];
}

const VIOLATION_COSTS = {
  'WEEKLY_60_HOUR': 2750,
  'DRIVING_11_HOUR': 2750,
  'ON_DUTY_14_HOUR': 2750,
  'BREAK_30_MINUTE': 1650,
  'REST_10_HOUR': 2750,
  'RESTART_34_HOUR': 1100,
};

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6'];

export const HOSViolationAnalytics: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [selectedViolationType] = useState<string>('all');
  const [violationTrends, setViolationTrends] = useState<ViolationTrend[]>([]);
  const [violationsByType, setViolationsByType] = useState<ViolationByType[]>([]);
  const [driverStats, setDriverStats] = useState<DriverViolationStats[]>([]);
  const [rootCauses, setRootCauses] = useState<RootCauseAnalysis[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalyticsData();
  }, [timeRange, selectedViolationType]);

  const loadAnalyticsData = async () => {
    setLoading(true);
    try {
      // Generate mock data for demonstration
      // In production, this would fetch from the API
      
      // Violation trends over time
      const trends = generateViolationTrends(timeRange);
      setViolationTrends(trends);
      
      // Violations by type
      const byType = generateViolationsByType();
      setViolationsByType(byType);
      
      // Driver statistics
      const drivers = await DatabaseService.getDrivers();
      const stats = generateDriverStats(drivers);
      setDriverStats(stats);
      
      // Root cause analysis
      const causes = generateRootCauseAnalysis();
      setRootCauses(causes);
      
      // Calculate total cost
      const cost = byType.reduce((sum, v) => sum + (v.count * v.averageCost), 0);
      setTotalCost(cost);
      
    } catch (error) {
      console.error('Failed to load analytics data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateViolationTrends = (range: string): ViolationTrend[] => {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 365;
    const trends: ViolationTrend[] = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      // Generate realistic violation patterns
      const dayOfWeek = date.getDay();
      const baseCount = Math.random() * 3;
      const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.5 : 1.2;
      const count = Math.round(baseCount * weekendFactor);
      
      trends.push({
        date: date.toISOString().split('T')[0],
        count,
        type: ['WEEKLY_60_HOUR', 'DRIVING_11_HOUR', 'BREAK_30_MINUTE'][Math.floor(Math.random() * 3)]
      });
    }
    
    return trends;
  };

  const generateViolationsByType = (): ViolationByType[] => {
    return [
      { type: 'WEEKLY_60_HOUR', count: 23, percentage: 28, averageCost: VIOLATION_COSTS.WEEKLY_60_HOUR },
      { type: 'DRIVING_11_HOUR', count: 19, percentage: 23, averageCost: VIOLATION_COSTS.DRIVING_11_HOUR },
      { type: 'BREAK_30_MINUTE', count: 17, percentage: 21, averageCost: VIOLATION_COSTS.BREAK_30_MINUTE },
      { type: 'ON_DUTY_14_HOUR', count: 12, percentage: 15, averageCost: VIOLATION_COSTS.ON_DUTY_14_HOUR },
      { type: 'REST_10_HOUR', count: 8, percentage: 10, averageCost: VIOLATION_COSTS.REST_10_HOUR },
      { type: 'RESTART_34_HOUR', count: 3, percentage: 3, averageCost: VIOLATION_COSTS.RESTART_34_HOUR },
    ];
  };

  const generateDriverStats = (drivers: any[]): DriverViolationStats[] => {
    return drivers.slice(0, 10).map(driver => ({
      driverId: driver.driver_id,
      driverName: driver.driver_name,
      totalViolations: Math.floor(Math.random() * 8),
      violationTypes: ['WEEKLY_60_HOUR', 'DRIVING_11_HOUR', 'BREAK_30_MINUTE']
        .filter(() => Math.random() > 0.5),
      lastViolation: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0],
      riskScore: Math.floor(Math.random() * 100),
    })).sort((a, b) => b.totalViolations - a.totalViolations);
  };

  const generateRootCauseAnalysis = (): RootCauseAnalysis[] => {
    return [
      {
        cause: 'Inadequate rest planning',
        frequency: 35,
        impact: 'high',
        recommendations: [
          'Implement mandatory rest day scheduling',
          'Use predictive analytics for rest planning',
          'Educate dispatchers on fatigue management'
        ]
      },
      {
        cause: 'Peak season overtime',
        frequency: 28,
        impact: 'high',
        recommendations: [
          'Hire seasonal drivers',
          'Implement staggered shift patterns',
          'Use smart routing to reduce drive time'
        ]
      },
      {
        cause: 'Poor route optimization',
        frequency: 22,
        impact: 'medium',
        recommendations: [
          'Invest in advanced routing software',
          'Analyze historical route data',
          'Consider delivery density when planning'
        ]
      },
      {
        cause: 'Manual scheduling errors',
        frequency: 15,
        impact: 'medium',
        recommendations: [
          'Automate schedule generation',
          'Implement approval workflows',
          'Provide real-time HOS visibility'
        ]
      },
    ];
  };

  const getTimeRangeLabel = () => {
    switch (timeRange) {
      case '7d': return 'Last 7 Days';
      case '30d': return 'Last 30 Days';
      case '90d': return 'Last 90 Days';
      case '1y': return 'Last Year';
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Violation Analytics</h2>
            <p className="text-gray-600 mt-1">
              Historical patterns, trends, and root cause analysis
            </p>
          </div>
          <div className="flex gap-3">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="1y">Last Year</option>
            </select>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export Report
            </button>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Violations</p>
              <p className="text-2xl font-bold text-gray-900">
                {violationsByType.reduce((sum, v) => sum + v.count, 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">{getTimeRangeLabel()}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Estimated Fines</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(totalCost)}</p>
              <p className="text-xs text-gray-500 mt-1">Potential DOT penalties</p>
            </div>
            <DollarSign className="h-8 w-8 text-red-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Violation Rate</p>
              <p className="text-2xl font-bold text-orange-600">
                {((violationsByType.reduce((sum, v) => sum + v.count, 0) / 25) * 100).toFixed(1)}%
              </p>
              <p className="text-xs text-gray-500 mt-1">Per driver average</p>
            </div>
            <TrendingUp className="h-8 w-8 text-orange-600 opacity-20" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">High Risk Drivers</p>
              <p className="text-2xl font-bold text-yellow-600">
                {driverStats.filter(d => d.riskScore > 70).length}
              </p>
              <p className="text-xs text-gray-500 mt-1">Need intervention</p>
            </div>
            <Users className="h-8 w-8 text-yellow-600 opacity-20" />
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Violation Trends */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Violation Trends</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={violationTrends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis />
              <Tooltip />
              <Line 
                type="monotone" 
                dataKey="count" 
                stroke="#3b82f6" 
                strokeWidth={2}
                dot={{ fill: '#3b82f6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Violations by Type */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Violations by Type</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={violationsByType}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ type, percentage }) => `${type.replace(/_/g, ' ')}: ${percentage}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="count"
              >
                {violationsByType.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Root Cause Analysis */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Root Cause Analysis</h3>
        <div className="space-y-4">
          {rootCauses.map((cause, index) => (
            <div key={index} className="border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-medium text-gray-900">{cause.cause}</h4>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      cause.impact === 'high' 
                        ? 'bg-red-100 text-red-800' 
                        : cause.impact === 'medium'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {cause.impact.toUpperCase()} IMPACT
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                    <span>Frequency: {cause.frequency}%</span>
                    <span>•</span>
                    <span>Est. Cost Impact: {formatCurrency(cause.frequency * 1000)}</span>
                  </div>
                  <div className="mt-3">
                    <p className="text-sm font-medium text-gray-700 mb-2">Recommendations:</p>
                    <ul className="space-y-1">
                      {cause.recommendations.map((rec, recIndex) => (
                        <li key={recIndex} className="text-sm text-gray-600 flex items-start gap-2">
                          <span className="text-blue-600 mt-0.5">•</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="ml-4">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                    <span className="text-2xl font-bold text-gray-700">{cause.frequency}%</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Violators Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Driver Risk Analysis</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Driver
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Violations
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Violation Types
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Violation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Risk Score
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {driverStats.map((driver) => (
                <tr key={driver.driverId}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{driver.driverName}</div>
                    <div className="text-sm text-gray-500">ID: {driver.driverId}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-medium ${
                      driver.totalViolations > 5 ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      {driver.totalViolations}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {driver.violationTypes.map((type, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded"
                        >
                          {type.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(driver.lastViolation).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-1 bg-gray-200 rounded-full h-2 mr-2">
                        <div
                          className={`h-2 rounded-full ${
                            driver.riskScore > 70 
                              ? 'bg-red-600' 
                              : driver.riskScore > 40 
                              ? 'bg-yellow-600' 
                              : 'bg-green-600'
                          }`}
                          style={{ width: `${driver.riskScore}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">{driver.riskScore}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button className="text-blue-600 hover:text-blue-800">
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cost Analysis */}
      <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Impact Analysis</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-gray-600 mb-1">Direct Fine Exposure</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totalCost)}</p>
            <p className="text-xs text-gray-500 mt-1">Based on DOT penalty schedule</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Insurance Impact</p>
            <p className="text-2xl font-bold text-orange-600">{formatCurrency(totalCost * 0.3)}</p>
            <p className="text-xs text-gray-500 mt-1">Estimated premium increase</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Operational Cost</p>
            <p className="text-2xl font-bold text-yellow-600">{formatCurrency(totalCost * 0.5)}</p>
            <p className="text-xs text-gray-500 mt-1">Lost productivity & remediation</p>
          </div>
        </div>
        <div className="mt-4 p-4 bg-white bg-opacity-50 rounded-lg">
          <p className="text-sm text-gray-700">
            <strong>Total Potential Impact:</strong> {formatCurrency(totalCost * 1.8)} over {getTimeRangeLabel().toLowerCase()}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Implementing proactive compliance measures could save up to 80% of these costs
          </p>
        </div>
      </div>
    </div>
  );
};

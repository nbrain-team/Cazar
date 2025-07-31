import { useState, useEffect } from 'react';
import { AlertTriangle, TrendingUp, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { generateMockDrivers, generateMockSchedules } from '../services/mockData';
import type { Driver, Schedule, ScheduleOptimization } from '../types';

export default function SchedulingPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedDriver, setSelectedDriver] = useState<string>('all');
  const [optimization, setOptimization] = useState<ScheduleOptimization | null>(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setLoading(true);
    const mockDrivers = generateMockDrivers(25);
    const mockSchedules = generateMockSchedules(mockDrivers);
    
    setDrivers(mockDrivers);
    setSchedules(mockSchedules);
    setLoading(false);
  };

  const runOptimization = () => {
    setOptimizing(true);
    
    // Simulate AI optimization
    setTimeout(() => {
      const mockOptimization: ScheduleOptimization = {
        date: new Date().toISOString().split('T')[0],
        recommended_changes: [
          {
            driver_id: 'DRV001',
            current_shift: '06:00-16:00',
            recommended_shift: '08:00-18:00',
            reason: 'Better route coverage during peak hours'
          },
          {
            driver_id: 'DRV005',
            current_shift: '10:00-20:00',
            recommended_shift: '06:00-16:00',
            reason: 'Avoid overtime, driver approaching 40 hours'
          }
        ],
        coverage_gaps: [
          {
            time_slot: '18:00-20:00',
            drivers_needed: 3,
            priority: 'high'
          },
          {
            time_slot: '05:00-06:00',
            drivers_needed: 1,
            priority: 'low'
          }
        ],
        overtime_risks: [
          {
            driver_id: 'DRV003',
            projected_hours: 45,
            recommendation: 'Reduce Thursday shift by 2 hours'
          },
          {
            driver_id: 'DRV008',
            projected_hours: 42,
            recommendation: 'Monitor closely, consider shift swap'
          }
        ]
      };
      
      setOptimization(mockOptimization);
      setOptimizing(false);
    }, 2000);
  };

  const getWeekDates = () => {
    const dates = [];
    const startOfWeek = new Date(currentWeek);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      dates.push(date);
    }
    
    return dates;
  };

  const navigateWeek = (direction: number) => {
    const newWeek = new Date(currentWeek);
    newWeek.setDate(newWeek.getDate() + (direction * 7));
    setCurrentWeek(newWeek);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  const weekDates = getWeekDates();
  const activeDrivers = drivers.filter(d => d.driver_status === 'active');

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>
          Smart Scheduling
        </h1>
        <button 
          className="btn btn-primary"
          onClick={runOptimization}
          disabled={optimizing}
        >
          {optimizing ? (
            <>
              <div className="spinner" style={{ width: '18px', height: '18px' }}></div>
              Optimizing Schedule...
            </>
          ) : (
            <>
              <TrendingUp size={18} />
              Run AI Optimization
            </>
          )}
        </button>
      </div>

      {/* Week Navigation */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button 
            className="btn btn-secondary"
            onClick={() => navigateWeek(-1)}
          >
            <ChevronLeft size={18} />
            Previous Week
          </button>
          
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
            Week of {weekDates[0].toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - {weekDates[6].toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </h3>
          
          <button 
            className="btn btn-secondary"
            onClick={() => navigateWeek(1)}
          >
            Next Week
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* AI Optimization Results */}
      {optimization && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
          {/* Recommended Changes */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={18} color="var(--primary)" />
              Recommended Changes
            </h3>
            {optimization.recommended_changes.map((change, index) => (
              <div key={index} style={{ 
                padding: '0.75rem', 
                backgroundColor: 'var(--gray-light)', 
                borderRadius: '8px',
                marginBottom: '0.5rem'
              }}>
                <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
                  {drivers.find(d => d.driver_id === change.driver_id)?.driver_name}
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  {change.current_shift} → {change.recommended_shift}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--primary)', marginTop: '0.25rem' }}>
                  {change.reason}
                </div>
              </div>
            ))}
          </div>

          {/* Coverage Gaps */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={18} color="var(--warning)" />
              Coverage Gaps
            </h3>
            {optimization.coverage_gaps.map((gap, index) => (
              <div key={index} style={{ 
                padding: '0.75rem', 
                backgroundColor: 'var(--gray-light)', 
                borderRadius: '8px',
                marginBottom: '0.5rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{gap.time_slot}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      Need {gap.drivers_needed} more driver{gap.drivers_needed > 1 ? 's' : ''}
                    </div>
                  </div>
                  <span className={`badge badge-${gap.priority === 'high' ? 'danger' : gap.priority === 'medium' ? 'warning' : 'info'}`}>
                    {gap.priority}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Overtime Risks */}
          <div className="card">
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={18} color="var(--danger)" />
              Overtime Risks
            </h3>
            {optimization.overtime_risks.map((risk, index) => (
              <div key={index} style={{ 
                padding: '0.75rem', 
                backgroundColor: 'var(--gray-light)', 
                borderRadius: '8px',
                marginBottom: '0.5rem'
              }}>
                <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
                  {drivers.find(d => d.driver_id === risk.driver_id)?.driver_name}
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--danger)' }}>
                  Projected: {risk.projected_hours} hours
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  {risk.recommendation}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Driver Filter */}
      <div style={{ marginBottom: '1rem' }}>
        <select 
          className="input" 
          style={{ width: '250px' }}
          value={selectedDriver}
          onChange={(e) => setSelectedDriver(e.target.value)}
        >
          <option value="all">All Drivers</option>
          {activeDrivers.map(driver => (
            <option key={driver.driver_id} value={driver.driver_id}>
              {driver.driver_name}
            </option>
          ))}
        </select>
      </div>

      {/* Schedule Grid */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, backgroundColor: 'var(--gray-light)', zIndex: 1 }}>
                Driver
              </th>
              {weekDates.map(date => (
                <th key={date.toISOString()}>
                  {date.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' })}
                </th>
              ))}
              <th>Total Hours</th>
            </tr>
          </thead>
          <tbody>
            {activeDrivers
              .filter(driver => selectedDriver === 'all' || driver.driver_id === selectedDriver)
              .map(driver => {
                const driverSchedules = schedules.filter(s => s.driver_id === driver.driver_id);
                let totalHours = 0;
                
                return (
                  <tr key={driver.driver_id}>
                    <td style={{ position: 'sticky', left: 0, backgroundColor: 'var(--card-bg)', zIndex: 1 }}>
                      {driver.driver_name}
                    </td>
                    {weekDates.map(date => {
                      const dateStr = date.toISOString().split('T')[0];
                      const daySchedule = driverSchedules.find(s => s.shift_date === dateStr);
                      
                      if (daySchedule) {
                        const start = parseInt(daySchedule.shift_start.split(':')[0]);
                        const end = parseInt(daySchedule.shift_end.split(':')[0]);
                        const hours = end - start;
                        totalHours += hours;
                        
                        return (
                          <td key={date.toISOString()}>
                            <div style={{ 
                              padding: '0.25rem 0.5rem', 
                              backgroundColor: 'var(--primary-light)',
                              borderRadius: '4px',
                              fontSize: '0.875rem',
                              textAlign: 'center'
                            }}>
                              {daySchedule.shift_start.substring(0, 5)} - {daySchedule.shift_end.substring(0, 5)}
                            </div>
                          </td>
                        );
                      }
                      
                      return <td key={date.toISOString()}>-</td>;
                    })}
                    <td>
                      <span style={{ 
                        fontWeight: 500,
                        color: totalHours > 40 ? 'var(--danger)' : totalHours > 35 ? 'var(--warning)' : 'var(--success)'
                      }}>
                        {totalHours} hrs
                      </span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
} 
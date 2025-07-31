import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, Mail, Phone, Calendar, DollarSign, AlertCircle } from 'lucide-react';
import type { Driver } from '../types';

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDrivers();
  }, []);

  const fetchDrivers = async () => {
    try {
      // For now, using mock data - will be replaced with API call
      const mockDrivers: Driver[] = Array.from({ length: 25 }, (_, i) => ({
        driver_id: `DRV${(i + 1).toString().padStart(3, '0')}`,
        driver_name: `Driver ${i + 1}`,
        driver_status: Math.random() > 0.1 ? 'active' : 'inactive',
        employment_status: Math.random() > 0.1 ? 'active' : 'terminated',
        job_title: 'Delivery Driver',
        pay_type: 'hourly',
        pay_rate: 18 + Math.random() * 7,
        department: 'Operations',
        location: 'NYC',
        email: `driver${i + 1}@cazar.com`,
        phone: `212-555-${(1000 + i).toString().padStart(4, '0')}`,
        hire_date: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000 * 3).toISOString(),
        license_number: `NY${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        license_expiry: new Date(Date.now() + Math.random() * 365 * 24 * 60 * 60 * 1000 * 2).toISOString()
      }));
      setDrivers(mockDrivers);
    } catch (error) {
      console.error('Error fetching drivers:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredDrivers = drivers.filter(driver => {
    const matchesSearch = driver.driver_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         driver.driver_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         driver.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || driver.driver_status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleAddDriver = (newDriver: Partial<Driver>) => {
    const driver: Driver = {
      driver_id: `DRV${(drivers.length + 1).toString().padStart(3, '0')}`,
      driver_name: newDriver.driver_name || '',
      driver_status: newDriver.driver_status || 'active',
      employment_status: newDriver.employment_status || 'active',
      job_title: newDriver.job_title || 'Delivery Driver',
      pay_type: newDriver.pay_type || 'hourly',
      pay_rate: newDriver.pay_rate || 20,
      department: newDriver.department || 'Operations',
      location: newDriver.location || 'NYC',
      email: newDriver.email,
      phone: newDriver.phone,
      hire_date: new Date().toISOString(),
      license_number: newDriver.license_number,
      license_expiry: newDriver.license_expiry
    };
    setDrivers([...drivers, driver]);
    setShowAddModal(false);
  };

  const handleUpdateDriver = (updatedDriver: Driver) => {
    setDrivers(drivers.map(d => d.driver_id === updatedDriver.driver_id ? updatedDriver : d));
    setEditingDriver(null);
  };

  const handleDeleteDriver = (driverId: string) => {
    if (window.confirm('Are you sure you want to delete this driver?')) {
      setDrivers(drivers.filter(d => d.driver_id !== driverId));
    }
  };

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
          Driver Management
        </h1>
        <button 
          className="btn btn-primary"
          onClick={() => setShowAddModal(true)}
        >
          <Plus size={18} />
          Add Driver
        </button>
      </div>

      {/* Search and Filters */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '250px', position: 'relative' }}>
            <Search size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)' }} />
            <input
              type="text"
              className="input"
              placeholder="Search drivers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '40px' }}
            />
          </div>
          
          <select 
            className="input" 
            style={{ width: 'auto' }}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
        <div className="stat-card">
          <h3>Total Drivers</h3>
          <div className="value">{drivers.length}</div>
        </div>
        <div className="stat-card">
          <h3>Active Drivers</h3>
          <div className="value">{drivers.filter(d => d.driver_status === 'active').length}</div>
        </div>
        <div className="stat-card">
          <h3>Average Pay Rate</h3>
          <div className="value">
            ${(drivers.reduce((sum, d) => sum + (d.pay_rate || 0), 0) / drivers.length).toFixed(2)}/hr
          </div>
        </div>
        <div className="stat-card">
          <h3>License Expiring Soon</h3>
          <div className="value">
            {drivers.filter(d => {
              if (!d.license_expiry) return false;
              const daysUntilExpiry = (new Date(d.license_expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
              return daysUntilExpiry < 30 && daysUntilExpiry > 0;
            }).length}
          </div>
        </div>
      </div>

      {/* Drivers Table */}
      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Driver ID</th>
                <th>Name</th>
                <th>Status</th>
                <th>Contact</th>
                <th>Pay Rate</th>
                <th>Hire Date</th>
                <th>License</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDrivers.map((driver) => (
                <tr key={driver.driver_id}>
                  <td>{driver.driver_id}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{driver.driver_name}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      {driver.job_title}
                    </div>
                  </td>
                  <td>
                    <span className={`badge badge-${driver.driver_status === 'active' ? 'success' : 'danger'}`}>
                      {driver.driver_status}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {driver.email && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                          <Mail size={14} />
                          {driver.email}
                        </div>
                      )}
                      {driver.phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                          <Phone size={14} />
                          {driver.phone}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <DollarSign size={16} />
                      ${driver.pay_rate?.toFixed(2)}/hr
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                      <Calendar size={14} />
                      {driver.hire_date ? new Date(driver.hire_date).toLocaleDateString() : 'N/A'}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.875rem' }}>
                      <div>{driver.license_number || 'N/A'}</div>
                      {driver.license_expiry && (
                        <div style={{ 
                          color: new Date(driver.license_expiry).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000 ? 'var(--danger)' : 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}>
                          {new Date(driver.license_expiry).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000 && <AlertCircle size={12} />}
                          Exp: {new Date(driver.license_expiry).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '0.25rem 0.5rem' }}
                        onClick={() => setEditingDriver(driver)}
                      >
                        <Edit size={16} />
                      </button>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '0.25rem 0.5rem', color: 'var(--danger)' }}
                        onClick={() => handleDeleteDriver(driver.driver_id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingDriver) && (
        <DriverModal
          driver={editingDriver}
          onSave={editingDriver ? handleUpdateDriver : handleAddDriver}
          onClose={() => {
            setShowAddModal(false);
            setEditingDriver(null);
          }}
        />
      )}
    </div>
  );
}

// Driver Modal Component
function DriverModal({ 
  driver, 
  onSave, 
  onClose 
}: { 
  driver: Driver | null; 
  onSave: (driver: any) => void; 
  onClose: () => void;
}) {
  const [formData, setFormData] = useState({
    driver_name: driver?.driver_name || '',
    driver_status: driver?.driver_status || 'active',
    employment_status: driver?.employment_status || 'active',
    job_title: driver?.job_title || 'Delivery Driver',
    pay_type: driver?.pay_type || 'hourly',
    pay_rate: driver?.pay_rate || 20,
    department: driver?.department || 'Operations',
    location: driver?.location || 'NYC',
    email: driver?.email || '',
    phone: driver?.phone || '',
    license_number: driver?.license_number || '',
    license_expiry: driver?.license_expiry ? new Date(driver.license_expiry).toISOString().split('T')[0] : ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...driver,
      ...formData,
      pay_rate: parseFloat(formData.pay_rate.toString()),
      license_expiry: formData.license_expiry ? new Date(formData.license_expiry).toISOString() : undefined
    });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div className="card" style={{ width: '90%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto' }}>
        <h2 style={{ marginBottom: '1.5rem' }}>
          {driver ? 'Edit Driver' : 'Add New Driver'}
        </h2>
        
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Driver Name *
              </label>
              <input
                type="text"
                className="input"
                value={formData.driver_name}
                onChange={(e) => setFormData({ ...formData, driver_name: e.target.value })}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Email
              </label>
              <input
                type="email"
                className="input"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Phone
              </label>
              <input
                type="tel"
                className="input"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Status
              </label>
              <select
                className="input"
                value={formData.driver_status}
                onChange={(e) => setFormData({ ...formData, driver_status: e.target.value })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Pay Rate ($/hr)
              </label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={formData.pay_rate}
                onChange={(e) => setFormData({ ...formData, pay_rate: parseFloat(e.target.value) })}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                Department
              </label>
              <input
                type="text"
                className="input"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                License Number
              </label>
              <input
                type="text"
                className="input"
                value={formData.license_number}
                onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
                License Expiry
              </label>
              <input
                type="date"
                className="input"
                value={formData.license_expiry}
                onChange={(e) => setFormData({ ...formData, license_expiry: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {driver ? 'Update' : 'Add'} Driver
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 
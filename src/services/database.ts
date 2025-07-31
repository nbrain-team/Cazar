// Database service layer - switches between mock data and real database
import { 
  generateMockDrivers, 
  generateMockRoutes, 
  generateMockTimecards, 
  generateMockDiscrepancies,
  generateMockSchedules,
  generateMockScorecards
} from './mockData';
import type { Driver, Route, Timecard, TimecardDiscrepancy, Schedule, Scorecard } from '../types';

// For now, always use mock data since we're running in the browser
// When backend is implemented, this will check for API availability
const USE_MOCK_DATA = true;

export class DatabaseService {
  // Driver operations
  static async getDrivers(): Promise<Driver[]> {
    if (USE_MOCK_DATA) {
      return generateMockDrivers(25);
    }
    
    // TODO: Implement real database query
    // const result = await db.query('SELECT * FROM drivers');
    // return result.rows;
    
    return generateMockDrivers(25);
  }

  static async getDriverById(id: string): Promise<Driver | null> {
    const drivers = await this.getDrivers();
    return drivers.find(d => d.driver_id === id) || null;
  }

  // Route operations
  static async getRoutes(_dateRange?: { start: Date; end: Date }): Promise<Route[]> {
    if (USE_MOCK_DATA) {
      const drivers = await this.getDrivers();
      return generateMockRoutes(drivers);
    }
    
    // TODO: Implement real database query with date filtering
    return generateMockRoutes(await this.getDrivers());
  }

  // Timecard operations
  static async getTimecards(_dateRange?: { start: Date; end: Date }): Promise<Timecard[]> {
    if (USE_MOCK_DATA) {
      const routes = await this.getRoutes();
      return generateMockTimecards(routes);
    }
    
    // TODO: Implement real database query
    return generateMockTimecards(await this.getRoutes());
  }

  // Discrepancy operations
  static async getDiscrepancies(): Promise<TimecardDiscrepancy[]> {
    if (USE_MOCK_DATA) {
      const drivers = await this.getDrivers();
      const routes = await this.getRoutes();
      const timecards = await this.getTimecards();
      return generateMockDiscrepancies(timecards, routes, drivers);
    }
    
    // TODO: Implement real database query
    return generateMockDiscrepancies(
      await this.getTimecards(),
      await this.getRoutes(),
      await this.getDrivers()
    );
  }

  static async updateDiscrepancyStatus(
    id: string, 
    status: 'pending' | 'resolved' | 'escalated'
  ): Promise<void> {
    if (USE_MOCK_DATA) {
      // In mock mode, we can't persist changes
      console.log(`Would update discrepancy ${id} to ${status}`);
      return;
    }
    
    // TODO: Implement real database update
    // await db.query('UPDATE discrepancies SET status = $1 WHERE id = $2', [status, id]);
  }

  // Schedule operations
  static async getSchedules(): Promise<Schedule[]> {
    if (USE_MOCK_DATA) {
      const drivers = await this.getDrivers();
      return generateMockSchedules(drivers);
    }
    
    // TODO: Implement real database query
    return generateMockSchedules(await this.getDrivers());
  }

  // Scorecard operations
  static async getScorecards(): Promise<Scorecard[]> {
    if (USE_MOCK_DATA) {
      const drivers = await this.getDrivers();
      return generateMockScorecards(drivers);
    }
    
    // TODO: Implement real database query
    return generateMockScorecards(await this.getDrivers());
  }

  // API sync methods (for future implementation)
  static async syncWithAmazonLogistics(): Promise<void> {
    // TODO: Implement Amazon Logistics API sync
    console.log('Amazon Logistics sync not yet implemented');
  }

  static async syncWithADP(): Promise<void> {
    // TODO: Implement ADP API sync
    console.log('ADP sync not yet implemented');
  }

  static async syncWithDSPWorkplace(): Promise<void> {
    // TODO: Implement DSP Workplace API sync
    console.log('DSP Workplace sync not yet implemented');
  }
} 
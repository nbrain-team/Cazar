import pg from 'pg';
import { DateTime } from 'luxon';

async function main() {
  const dbUrl = process.env.DATABASE_URL || 'postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a.oregon-postgres.render.com/cazar_ops_hub';
  
  const driverId = process.argv[2] || 'LSW001202';
  
  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  
  try {
    console.log(`🔍 Checking breaks for driver: ${driverId}\n`);
    
    // Get driver info
    const driverResult = await client.query(
      'SELECT driver_id, driver_name FROM drivers WHERE driver_id = $1',
      [driverId]
    );
    
    if (driverResult.rows.length === 0) {
      console.log('Driver not found!');
      return;
    }
    
    const driver = driverResult.rows[0];
    console.log(`Driver: ${driver.driver_name} (${driver.driver_id})\n`);
    
    // Get recent work segments
    console.log('📅 Recent work segments (last 7 days):');
    const segmentsResult = await client.query(`
      SELECT 
        id,
        start_utc,
        end_utc,
        EXTRACT(EPOCH FROM (end_utc - start_utc)) / 3600.0 as hours,
        timezone('America/Los_Angeles', start_utc) as start_local,
        timezone('America/Los_Angeles', end_utc) as end_local,
        source_row_ref
      FROM on_duty_segments
      WHERE driver_id = $1
        AND start_utc >= NOW() - INTERVAL '7 days'
      ORDER BY start_utc DESC
      LIMIT 20
    `, [driverId]);
    
    segmentsResult.rows.forEach(seg => {
      const start = DateTime.fromJSDate(seg.start_local);
      const end = DateTime.fromJSDate(seg.end_local);
      console.log(`  ${start.toFormat('MM/dd HH:mm')} - ${end.toFormat('HH:mm')} (${Number(seg.hours).toFixed(2)}h)`);
      if (seg.source_row_ref) {
        try {
          const ref = typeof seg.source_row_ref === 'string' ? JSON.parse(seg.source_row_ref) : seg.source_row_ref;
          if (ref.out_punch_type) {
            console.log(`    Out punch type: ${ref.out_punch_type}`);
          }
        } catch (e) {
          // Skip if not valid JSON
        }
      }
    });
    
    // Get break segments
    console.log('\n🍽️  Break segments (last 7 days):');
    const breaksResult = await client.query(`
      SELECT 
        id,
        label,
        start_utc,
        end_utc,
        EXTRACT(EPOCH FROM (end_utc - start_utc)) / 60.0 as minutes,
        timezone('America/Los_Angeles', start_utc) as start_local,
        timezone('America/Los_Angeles', end_utc) as end_local,
        source_row_ref
      FROM break_segments
      WHERE driver_id = $1
        AND start_utc >= NOW() - INTERVAL '7 days'
      ORDER BY start_utc DESC
      LIMIT 20
    `, [driverId]);
    
    if (breaksResult.rows.length === 0) {
      console.log('  No breaks found!');
    } else {
      breaksResult.rows.forEach(brk => {
        const start = DateTime.fromJSDate(brk.start_local);
        const end = DateTime.fromJSDate(brk.end_local);
        const source = brk.source_row_ref ? (typeof brk.source_row_ref === 'string' ? JSON.parse(brk.source_row_ref) : brk.source_row_ref) : null;
        const inferred = source?.inferred ? ' (inferred)' : '';
        console.log(`  ${brk.label}: ${start.toFormat('MM/dd HH:mm')} - ${end.toFormat('HH:mm')} (${Number(brk.minutes).toFixed(0)}min)${inferred}`);
        if (source) {
          if (source.reason) console.log(`    Reason: ${source.reason}`);
          if (source.out_punch_type) console.log(`    Out punch type: ${source.out_punch_type}`);
        }
      });
    }
    
    // Check for gaps that might be lunch breaks
    console.log('\n🔍 Checking for gaps between segments that could be breaks:');
    const segments = segmentsResult.rows.sort((a, b) => 
      new Date(a.start_utc).getTime() - new Date(b.start_utc).getTime()
    );
    
    for (let i = 0; i < segments.length - 1; i++) {
      const current = segments[i];
      const next = segments[i + 1];
      
      const currentEnd = DateTime.fromJSDate(new Date(current.end_utc));
      const nextStart = DateTime.fromJSDate(new Date(next.start_utc));
      
      // Only check gaps within the same day
      if (currentEnd.hasSame(nextStart, 'day')) {
        const gapMinutes = nextStart.diff(currentEnd, 'minutes').minutes;
        
        if (gapMinutes > 0 && gapMinutes < 120) {
          console.log(`  Gap: ${currentEnd.toFormat('MM/dd HH:mm')} to ${nextStart.toFormat('HH:mm')} (${gapMinutes.toFixed(0)}min)`);
          
          // Check if there's a break segment covering this gap
          const hasBreak = breaksResult.rows.some(brk => {
            const brkStart = new Date(brk.start_utc).getTime();
            const brkEnd = new Date(brk.end_utc).getTime();
            const gapStart = currentEnd.toJSDate().getTime();
            const gapEnd = nextStart.toJSDate().getTime();
            
            return brkStart <= gapStart && brkEnd >= gapEnd;
          });
          
          if (!hasBreak && gapMinutes < 60) {
            console.log('    ⚠️  This gap should have been detected as a lunch break!');
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

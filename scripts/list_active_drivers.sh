#!/bin/bash
#
# List Active Drivers from Database
# Usage: ./list_active_drivers.sh
#

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              ACTIVE DRIVERS LIST                               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Database connection (from environment or default)
DB_URL="${DATABASE_URL:-postgresql://cazar_admin:7m0bT1rRf0TCnGYeaDOCujeLmcXGsJke@dpg-d25rt60gjchc73acglmg-a/cazar_ops_hub}"

# Query active drivers
psql "$DB_URL" -c "
SELECT 
  driver_id,
  driver_name,
  driver_status,
  employment_status,
  hire_date,
  termination_date
FROM drivers
WHERE driver_status = 'active'
  OR employment_status = 'active'
ORDER BY driver_name;
" --pset=border=2 --pset=format=aligned

echo ""
echo "────────────────────────────────────────────────────────────────"
echo ""

# Get count
psql "$DB_URL" -t -c "
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE driver_status = 'active') as active_driver_status,
  COUNT(*) FILTER (WHERE employment_status = 'active') as active_employment
FROM drivers
WHERE driver_status = 'active' OR employment_status = 'active';
" | while read total active_status active_employment; do
  echo "📊 Total Active Drivers: $total"
  echo "   • Active (driver_status): $active_status"
  echo "   • Active (employment_status): $active_employment"
done

echo ""


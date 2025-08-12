-- Seed data for COMPLIANCE module (DYY5 and VNY1)
-- Assumes core schema and uuid extension are present

-- Driver identifiers (link to Amazon Transporter IDs)
INSERT INTO driver_identifiers (driver_id, transporter_id, station_code, delivery_associate_name, adp_position_id)
VALUES
  ('DRV001', 'A1UPD0VQ5XF9L', 'VNY1', 'KAMAU OMARI ADAMS', 'LSW001376'),
  ('DRV002', 'A392ICYQEKZ789', 'VNY1', 'JEFFREY AHAY', 'LSW001508'),
  ('DRV003', 'A1TYMBVD1U5VKQ', 'DYY5', 'KEVIN LOPEZ EUSEBIO', 'LSW001052'),
  ('DRV004', 'A1CO02I4VOCA74', 'DYY5', 'MIGUEL ANGEL ALVAREZ', 'LSW001409'),
  ('DRV005', 'A2MPQ47UJLPALK', 'DYY5', 'WALTER LOCKHART', 'LSW001348');

-- Weekly metrics (subset of columns, realistic values)
INSERT INTO dsp_driver_weekly_metrics (
  week_code, station_code, transporter_id, delivered_packages, overall_standing, key_focus_area,
  on_road_safety_score, overall_quality_score, fico, seatbelt_off_rate, speeding_event_rate,
  distractions_rate, sign_signal_violations_rate, stop_sign_violations, stop_light_violations,
  illegal_u_turns, cdf_dpmo, dcr, dsb, swc_pod, swc_cc, swc_ad, dnrs,
  shipments_per_on_zone_hour, pod_opps, cc_opps, customer_escalation_defect, customer_delivery_feedback
)
VALUES
  ('2025-29','VNY1','A1UPD0VQ5XF9L',433,'Fantastic','Photo-On-Delivery','Coming Soon','Fantastic','',0.000,0.002,0.001,0.000,0,0,0,0.000,1.000,0.000,0.998,0.000,0.000,2,28.559,791,0,0.000),
  ('2025-29','VNY1','A392ICYQEKZ789',52,'Fantastic','Photo-On-Delivery','Coming Soon','Fantastic','',0.000,0.000,0.000,0.000,0,0,0,0.000,1.000,0.000,0.912,0.000,0.000,0,22.000,34,0,0.000),
  ('2025-29','DYY5','A1TYMBVD1U5VKQ',2688,'Fantastic','Customer Delivery Feedback','Fantastic','Fantastic','',0.000,0.000,0.000,0.000,0,0,0,1868.000,0.999,0.000,1.000,0.000,0.000,1,28.559,791,0,1868.000),
  ('2025-29','DYY5','A1CO02I4VOCA74',647,'Fantastic','Delivery Completion Rate','Fantastic','Fantastic','',0.000,0.000,0.000,0.000,0,0,0,0.000,0.998,0.000,1.000,0.000,0.000,2,34.007,515,0,0.000),
  ('2025-29','DYY5','A2MPQ47UJLPALK',659,'Fantastic','Delivery Completion Rate','Coming Soon','Fantastic','',0.000,0.000,0.000,0.000,0,0,0,0.000,0.997,0.000,0.993,0.000,0.000,0,19.972,455,0,0.000);

-- Safety events (sample telemetry)
INSERT INTO safety_events (transporter_id, station_code, route_id, type, severity, occurred_at, source, location, video_url)
VALUES
  ('A1UPD0VQ5XF9L','VNY1','RT2025-07-19-001','seatbelt',3, NOW() - INTERVAL '3 days', 'camera', '{"lat":40.74,"lng":-73.98}', NULL),
  ('A1UPD0VQ5XF9L','VNY1','RT2025-07-19-001','speeding',2, NOW() - INTERVAL '2 days', 'camera', '{"lat":40.73,"lng":-73.99}', NULL),
  ('A1TYMBVD1U5VKQ','DYY5','RT2025-07-19-007','distraction',2, NOW() - INTERVAL '4 days', 'camera', '{"lat":34.05,"lng":-118.24}', NULL);

-- Compliance rules (defaults; editable)
INSERT INTO compliance_rules (metric_key, operator, threshold_value, window, severity, active, description)
VALUES
  ('seatbelt_off_rate','>',0,'weekly','high',TRUE,'Any seatbelt-off events trigger a violation'),
  ('speeding_event_rate','>',0,'weekly','high',TRUE,'Any speeding events trigger a violation'),
  ('distractions_rate','>',0,'weekly','high',TRUE,'Any distraction events trigger a violation'),
  ('cdf_dpmo','>',0,'weekly','high',TRUE,'Any customer delivery feedback defects create a violation'),
  ('customer_escalation_defect','>',0,'weekly','high',TRUE,'Any escalation defects should be reviewed'),
  ('variance_hours','>',1.0,'daily','medium',TRUE,'Daily hours variance exceeds 1 hour');

-- Detected violations (examples)
INSERT INTO driver_violations (transporter_id, station_code, metric_key, observed_value, threshold_value, severity, occurred_week, status)
VALUES
  ('A1UPD0VQ5XF9L','VNY1','speeding_event_rate',0.002,0.000,'high','2025-29','open'),
  ('A1TYMBVD1U5VKQ','DYY5','customer_escalation_defect',2.000,0.000,'high','2025-29','open');

-- WHC Policy (NYS defaults for DYY5 and VNY1)
INSERT INTO work_hours_policy_profiles (station_code, state_code, min_meal_minutes, meal_window_start_minute, meal_window_end_minute, min_rest_hours_between_shifts, max_daily_on_duty_hours, max_weekly_hours)
VALUES
  ('DYY5','NY',30,240,360,10.00,12.00,60.00),
  ('VNY1','NY',30,240,360,10.00,12.00,60.00)
ON CONFLICT DO NOTHING;

-- WHC Audit examples (mock)
INSERT INTO work_hours_audit_daily (
  work_date, station_code, position_id, transporter_id, driver_name, shift_start, shift_end,
  on_duty_hours, meal_minutes, meal_within_window, short_rest_flag, daily_max_exceeded,
  fifth_sixth_day_flag, weekly_hours, weekly_ot_flag, verdict, reasons
)
VALUES
  (CURRENT_DATE - INTERVAL '1 day','DYY5','LSW001376','A1UPD0VQ5XF9L','KAMAU OMARI ADAMS', CURRENT_DATE - INTERVAL '1 day' + TIME '03:30', CURRENT_DATE - INTERVAL '1 day' + TIME '14:10', 10.67, 30, TRUE, FALSE, FALSE, FALSE, 42.50, FALSE, 'PASS', ARRAY['All within policy']),
  (CURRENT_DATE - INTERVAL '1 day','DYY5','LSW001052','A1TYMBVD1U5VKQ','KEVIN LOPEZ EUSEBIO', CURRENT_DATE - INTERVAL '1 day' + TIME '06:45', CURRENT_DATE - INTERVAL '1 day' + TIME '19:30', 12.75, 20, FALSE, FALSE, TRUE, TRUE, 58.25, TRUE, 'FAIL', ARRAY['Meal short (<30)','Meal outside window','Daily > 12h','5th/6th day','Weekly OT risk']); 
// no imports needed

export default function HosRulesPage() {
  return (
    <div style={{ padding: '2rem', maxWidth: 900 }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>Compliance & HOS 60/7 — Rules We Enforce</h1>

      <p style={{ marginBottom: '1rem' }}>
        This page lists the compliance logic the platform applies for Drivers on the HOS 60/7 hub. We use simple, auditable math and familiar terms
        (Drivers, Lunch break, PTO) so your team can understand and act quickly.
      </p>

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>1) Rolling 7‑Day Hours of Service (HOS 60/7)</h2>
        <ul>
          <li>No driving after <strong>60 on‑duty hours</strong> in any rolling 7‑day (168‑hour) window.</li>
          <li>We include <strong>driver‑attested other employer hours</strong> in the rolling total when provided.</li>
          <li><strong>34‑hour restart</strong> support: a continuous 34 hours off‑duty resets the rolling total when applicable.</li>
        </ul>
        <p style={{ marginTop: '0.5rem' }}>
          <strong>Math</strong>: Hours Used = Sum of on‑duty minutes inside the last 168 hours + attested minutes (÷60).
          Hours Available = 60 − Hours Used. Negative Available indicates a violation.
        </p>
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>2) Daily Limits</h2>
        <ul>
          <li><strong>Daily max on‑duty cap</strong>: 12h (configurable). If a Driver exceeds 12h on a local day, it is a violation.</li>
          <li><strong>Minimum rest between shifts</strong>: 10h. If rest before the first start of a day is &lt;10h and the Driver works that day, it is a violation.</li>
        </ul>
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>3) Meal / Lunch Break Compliance</h2>
        <ul>
          <li>Drivers must take a <strong>Lunch break of ≥30 minutes</strong> by the <strong>6th on‑duty hour</strong> of their day.</li>
          <li>Lunch breaks are automatically detected when a driver punches out and then punches back in <strong>less than 60 minutes later</strong>.</li>
          <li>The Out Punch Type <strong>LP</strong> designation is optional - the system will detect lunch breaks based on timing patterns.</li>
          <li>Lunch break time is excluded from hours worked calculations.</li>
          <li>If a Driver reaches 6 on‑duty hours with no qualifying Lunch (≥30 minutes), we flag a violation.</li>
        </ul>
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>4) Consecutive Work Days</h2>
        <ul>
          <li><strong>5th consecutive day</strong>: Exposure (at‑risk) indicator.</li>
          <li><strong>6th consecutive day+</strong>: Violation indicator.</li>
          <li>Days without work (blank “–” in the grid, or PTO) reset the consecutive day count.</li>
        </ul>
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>5) PTO and Days Off</h2>
        <ul>
          <li>If Out Punch Type is <strong>PTO</strong>, we <strong>ignore the row’s time</strong> and treat the day as not worked.</li>
        </ul>
      </div>

      <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>6) Time Zones & Windows</h2>
        <ul>
          <li>All timestamps are stored and computed in <strong>UTC</strong>. The 7‑day grid displays local days in <strong>America/Los_Angeles</strong> (D‑6 … D).</li>
          <li>The 7‑day window is the 
            <em>rolling last 168 hours</em> from the end date you pick. Per‑day hours reflect the local day bounds.</li>
        </ul>
      </div>

      <p style={{ marginTop: '1rem' }}>
        Need help interpreting a Driver’s status? On the HOS 60/7 page, click a row to expand detailed reasoning for the current window and each day.
      </p>

      <a href="/hos-607" className="link" style={{ display: 'inline-block', marginTop: '1rem' }}>← Back to HOS 60/7</a>
    </div>
  );
}



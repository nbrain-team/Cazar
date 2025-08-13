import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// Pinecone v3: no environment property; index is resolved by name
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const pcIndexName = process.env.PINECONE_INDEX_NAME || 'nbrain';
const pcTargetDim = Number(process.env.PINECONE_DIM || 768);

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

function downProject(vector, targetDim) {
  const n = vector.length;
  if (n === targetDim) return vector;
  const out = new Array(targetDim).fill(0);
  const factor = n / targetDim; // e.g., 1536/768=2, 3072/768=4
  for (let i = 0; i < targetDim; i++) {
    const start = Math.floor(i * factor);
    const end = Math.floor((i + 1) * factor);
    let sum = 0;
    let count = 0;
    for (let j = start; j < Math.min(end, n); j++) { sum += vector[j]; count++; }
    out[i] = count ? sum / count : 0;
  }
  return out;
}

async function getTopSpeedingWithMetrics(limit = 5) {
  const sql = `
    WITH latest AS (
      SELECT DISTINCT ON (station_code, transporter_id)
        station_code, transporter_id, speeding_event_rate, dcr, swc_pod, created_at
      FROM dsp_driver_weekly_metrics
      ORDER BY station_code, transporter_id, created_at DESC
    )
    SELECT station_code, transporter_id, speeding_event_rate, dcr, swc_pod
    FROM latest
    WHERE speeding_event_rate IS NOT NULL
    ORDER BY speeding_event_rate DESC NULLS LAST
    LIMIT $1;
  `;
  const { rows } = await pool.query(sql, [limit]);
  return rows || [];
}

async function getExecutiveStationSnapshot() {
  const sql = `
    WITH latest AS (
      SELECT DISTINCT ON (station_code, transporter_id)
        station_code, transporter_id, dcr, swc_pod, cdf_dpmo, created_at
      FROM dsp_driver_weekly_metrics
      ORDER BY station_code, transporter_id, created_at DESC
    )
    SELECT station_code,
           COUNT(DISTINCT transporter_id) AS drivers,
           AVG(dcr) AS avg_dcr,
           AVG(swc_pod) AS avg_swc_pod,
           AVG(cdf_dpmo) AS avg_cdf_dpmo
    FROM latest
    GROUP BY station_code
    ORDER BY station_code;
  `;
  const { rows } = await pool.query(sql);
  return rows || [];
}

function asMarkdownTable(headers, rows) {
  const head = `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map(r => `| ${r.join(' | ')} |`).join('\n');
  return `${head}\n${body}`;
}

// API: RAG and actions (as before)
app.post('/rag/query', async (req, res) => {
  try {
    const { query, topK = 8, station = 'ALL', week = '2025-29' } = req.body || {};
    if (!query) return res.status(400).json({ error: 'query required' });

    const qLower = String(query).toLowerCase();
    let dataContextBlocks = [];

    // Lightweight intent detection for DB-backed analytics
    if (qLower.includes('speeding') && (qLower.includes('top') || qLower.includes('highest') || qLower.includes('worst'))) {
      const top = await getTopSpeedingWithMetrics(5);
      if (top.length) {
        const rows = top.map(r => [r.station_code, r.transporter_id, Number(r.speeding_event_rate).toFixed(3), Number(r.dcr).toFixed(3), Number(r.swc_pod).toFixed(3)]);
        const md = [
          '### Data: Top 5 by Speeding Event Rate (latest per driver)',
          asMarkdownTable(['Station', 'Driver (Transporter ID)', 'Speeding rate', 'DCR', 'SWC-POD'], rows)
        ].join('\n');
        dataContextBlocks.push(md);
      }
    }
    if (qLower.includes('executive') && qLower.includes('snapshot') && qLower.includes('station')) {
      const snap = await getExecutiveStationSnapshot();
      if (snap.length) {
        const rows = snap.map(r => [r.station_code, String(r.drivers), Number(r.avg_dcr).toFixed(3), Number(r.avg_swc_pod).toFixed(3), Number(r.avg_cdf_dpmo).toFixed(3)]);
        const md = [
          '### Data: Executive Station Snapshot (latest per driver)',
          asMarkdownTable(['Station', 'Drivers', 'Avg DCR', 'Avg SWC-POD', 'Avg CDF DPMO'], rows)
        ].join('\n');
        dataContextBlocks.push(md);
      }
    }

    // Use 768-compatible embeddings for current index; adapt if different
    const embed = await openai.embeddings.create({ model: 'text-embedding-ada-002', input: query });
    let vector = embed.data[0].embedding;
    if (vector.length !== pcTargetDim) vector = downProject(vector, pcTargetDim);

    const filter = {};
    if (station && station !== 'ALL') filter.station = station;
    if (week) filter.week = week;
    const idx = pinecone.index(pcIndexName);
    const results = await idx.query({ vector, topK, includeMetadata: true, filter });
    const ragBlocks = (results.matches || []).map((m) => `Source:${m.id} Score:${m.score}\n${m.metadata?.text || ''}`).slice(0, topK);

    const allContexts = [...dataContextBlocks, ...ragBlocks];
    const system = `You are a DSP ops analyst. Answer precisely using the provided context. If insufficient, say what is missing. Provide numeric summaries and call out WHC, CDF, DCR, SWC-POD, safety signals when relevant.`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini', temperature: 0.2, max_tokens: 1200,
      messages: [ { role: 'system', content: system }, { role: 'user', content: `Context:\n${allContexts.join('\n\n')}\n\nQuestion: ${query}` } ]
    });
    res.json({ answer: completion.choices?.[0]?.message?.content || '', contexts: allContexts });
  } catch (err) { console.error(err); res.status(500).json({ error: 'rag_error', detail: String(err) }); }
});

app.post('/api/violations/:id/ack', async (req, res) => {
  const { id } = req.params; const { user_id = 'system', transporter_id, metric_key } = req.body || {};
  try {
    await pool.query(
      `UPDATE driver_violations SET status='acknowledged', updated_at=NOW()
       WHERE id::text=$1 OR (COALESCE($2,'')<>'' AND transporter_id=$2 AND metric_key=$3)`,
      [id, transporter_id || null, metric_key || null]
    );
    await pool.query(`INSERT INTO api_sync_log (api_source, sync_type, sync_status, records_synced, error_message, started_at, completed_at) VALUES ('amazon_logistics','violation_ack','success',1,NULL,NOW(),NOW())`);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'ack_failed' }); }
});

app.post('/api/violations/:id/resolve', async (req, res) => {
  const { id } = req.params; const { user_id = 'system', reason_code='resolved', notes='', transporter_id, metric_key } = req.body || {};
  try {
    await pool.query(
      `UPDATE driver_violations SET status='resolved', updated_at=NOW()
       WHERE id::text=$1 OR (COALESCE($2,'')<>'' AND transporter_id=$2 AND metric_key=$3)`,
      [id, transporter_id || null, metric_key || null]
    );
    await pool.query(`INSERT INTO api_sync_log (api_source, sync_type, sync_status, records_synced, error_message, started_at, completed_at) VALUES ('amazon_logistics','violation_resolve','success',1,NULL,NOW(),NOW())`);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'resolve_failed' }); }
});

app.post('/api/violations/:id/escalate', async (req, res) => {
  const { id } = req.params; const { level='L2', user_id='system', transporter_id, metric_key } = req.body || {};
  try {
    await pool.query(
      `UPDATE driver_violations SET status='escalated', updated_at=NOW()
       WHERE id::text=$1 OR (COALESCE($2,'')<>'' AND transporter_id=$2 AND metric_key=$3)`,
      [id, transporter_id || null, metric_key || null]
    );
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'escalate_failed' }); }
});

app.post('/api/whc/:driver/:date/note', async (req, res) => {
  const { driver, date } = req.params; const { note='' } = req.body || {};
  try {
    await pool.query(`UPDATE work_hours_audit_daily SET reasons = COALESCE(reasons, ARRAY[]::text[]) || $1 WHERE work_date=$2 AND driver_name=$3`, [note, date, driver]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'note_failed' }); }
});

// Static hosting for built frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const port = process.env.PORT || 10000;
app.listen(port, () => { console.log(`Express server listening on ${port}`); }); 
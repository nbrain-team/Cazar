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

const openai = new OpenAI({ apiKey: process.envOPENAI_API_KEY || process.env.OPENAI_API_KEY });
// Pinecone v3: no environment property; index is resolved by name
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const pcIndexName = process.env.PINECONE_INDEX_NAME || 'nbrain';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// API: RAG and actions (as before)
app.post('/rag/query', async (req, res) => {
  try {
    const { query, topK = 8, station = 'ALL', week = '2025-29' } = req.body || {};
    if (!query) return res.status(400).json({ error: 'query required' });
    const embed = await openai.embeddings.create({ model: 'text-embedding-3-large', input: query });
    const vector = embed.data[0].embedding;
    const filter = {};
    if (station && station !== 'ALL') filter.station = station;
    if (week) filter.week = week;
    const idx = pinecone.index(pcIndexName);
    const results = await idx.query({ vector, topK, includeMetadata: true, filter });
    const contexts = (results.matches || []).map((m) => `Source:${m.id} Score:${m.score}\n${m.metadata?.text || ''}`).slice(0, topK);
    const system = `You are a DSP ops analyst. Answer precisely using the provided context. If insufficient, say what is missing. Provide numeric summaries and call out WHC, CDF, DCR, SWC-POD, safety signals when relevant.`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini', temperature: 0.2, max_tokens: 1200,
      messages: [ { role: 'system', content: system }, { role: 'user', content: `Context:\n${contexts.join('\n\n')}\n\nQuestion: ${query}` } ]
    });
    res.json({ answer: completion.choices?.[0]?.message?.content || '', contexts });
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
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import pg from 'pg';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY, environment: process.env.PINECONE_ENVIRONMENT });
const pcIndexName = process.env.PINECONE_INDEX_NAME || 'nbrain';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// RAG endpoint
app.post('/rag/query', async (req, res) => {
  try {
    const { query, topK = 8, station = 'ALL', week = '2025-29' } = req.body || {};
    if (!query) return res.status(400).json({ error: 'query required' });
    const embed = await openai.embeddings.create({ model: 'text-embedding-3-large', input: query });
    const vector = embed.data[0].embedding;
    const filter = {};
    if (station && station !== 'ALL') filter.station = station;
    if (week) filter.week = week;
    const idx = pinecone.Index(pcIndexName);
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

// Violations lifecycle
app.post('/api/violations/:id/ack', async (req, res) => {
  const { id } = req.params; const { user_id = 'system', note } = req.body || {};
  try {
    await pool.query(`UPDATE driver_violations SET status='acknowledged', updated_at=NOW() WHERE id::text=$1 OR id=$1`, [id]);
    await pool.query(`INSERT INTO api_sync_log (api_source, sync_type, sync_status, records_synced, error_message, started_at, completed_at) VALUES ('amazon_logistics','violation_ack','success',1,NULL,NOW(),NOW())`);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'ack_failed' }); }
});

app.post('/api/violations/:id/resolve', async (req, res) => {
  const { id } = req.params; const { user_id = 'system', reason_code='resolved', notes='' } = req.body || {};
  try {
    await pool.query(`UPDATE driver_violations SET status='resolved', occurred_at=occurred_at WHERE id::text=$1 OR id=$1`, [id]);
    await pool.query(`UPDATE driver_violations SET severity=severity WHERE id::text=$1 OR id=$1`); // no-op placeholder
    await pool.query(`INSERT INTO api_sync_log (api_source, sync_type, sync_status, records_synced, error_message, started_at, completed_at) VALUES ('amazon_logistics','violation_resolve','success',1,NULL,NOW(),NOW())`);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'resolve_failed' }); }
});

app.post('/api/violations/:id/escalate', async (req, res) => {
  const { id } = req.params; const { level='L2', user_id='system' } = req.body || {};
  try {
    await pool.query(`UPDATE driver_violations SET status='escalated' WHERE id::text=$1 OR id=$1`, [id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'escalate_failed' }); }
});

// WHC case notes
app.post('/api/whc/:driver/:date/note', async (req, res) => {
  const { driver, date } = req.params; const { note='' } = req.body || {};
  try {
    await pool.query(`UPDATE work_hours_audit_daily SET reasons = COALESCE(reasons, ARRAY[]::text[]) || $1 WHERE work_date=$2 AND driver_name=$3`, [note, date, driver]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'note_failed' }); }
});

const port = process.env.PORT || 8080;
app.listen(port, () => { console.log(`API listening on ${port}`); }); 
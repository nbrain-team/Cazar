import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const pcIndexName = process.env.PINECONE_INDEX_NAME || 'nbrain2025-clean';

// Chunk transcript into smaller segments for better embedding
function chunkTranscript(transcript, maxChunkSize = 1000) {
  const chunks = [];
  const segments = transcript.split(/\n+/); // Split by paragraphs/speaker changes
  
  let currentChunk = '';
  let currentSpeaker = null;
  
  for (const segment of segments) {
    // Check if this is a speaker change
    const speakerMatch = segment.match(/^([^:]+):\s*(.+)/);
    
    if (speakerMatch) {
      const [, speaker, text] = speakerMatch;
      
      // If chunk is getting too large or speaker changed, start new chunk
      if (currentChunk.length + text.length > maxChunkSize || 
          (currentSpeaker && currentSpeaker !== speaker && currentChunk.length > 200)) {
        if (currentChunk.trim()) {
          chunks.push({
            text: currentChunk.trim(),
            speaker: currentSpeaker,
          });
        }
        currentChunk = `${speaker}: ${text}`;
        currentSpeaker = speaker;
      } else {
        currentChunk += `\n${speaker}: ${text}`;
        currentSpeaker = speaker;
      }
    } else {
      currentChunk += `\n${segment}`;
    }
  }
  
  // Add final chunk
  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      speaker: currentSpeaker,
    });
  }
  
  return chunks;
}

// Extract action items from transcript using GPT
async function extractActionItems(transcript) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      temperature: 0.3,
      max_tokens: 1000,
      messages: [
        {
          role: 'system',
          content: 'Extract all action items from this meeting transcript. Return as JSON array with: {task, assigned_to, due_date, priority}. If no explicit assignment or date, use null.'
        },
        {
          role: 'user',
          content: transcript
        }
      ],
      response_format: { type: 'json_object' }
    });
    
    const result = JSON.parse(completion.choices[0].message.content);
    return result.action_items || [];
  } catch (error) {
    console.error('Error extracting action items:', error);
    return [];
  }
}

// Extract topics/themes from transcript
async function extractTopics(transcript) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      temperature: 0.3,
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content: 'Extract the main topics/themes discussed in this meeting. Return as JSON array of topic strings. Focus on business topics like "driver scheduling", "compliance", "payroll", etc.'
        },
        {
          role: 'user',
          content: transcript.substring(0, 4000) // First part for topic detection
        }
      ],
      response_format: { type: 'json_object' }
    });
    
    const result = JSON.parse(completion.choices[0].message.content);
    return result.topics || [];
  } catch (error) {
    console.error('Error extracting topics:', error);
    return [];
  }
}

// Generate meeting summary
async function generateSummary(transcript) {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      temperature: 0.3,
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content: 'Create a concise 2-3 paragraph summary of this meeting, highlighting key decisions, discussions, and outcomes.'
        },
        {
          role: 'user',
          content: transcript
        }
      ]
    });
    
    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error generating summary:', error);
    return 'Summary generation failed';
  }
}

// Store meeting in PostgreSQL
export async function storeMeetingInDatabase(pool, meetingData) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Create table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS meeting_transcripts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        read_ai_meeting_id VARCHAR UNIQUE,
        title VARCHAR,
        meeting_date TIMESTAMPTZ,
        duration_minutes INTEGER,
        participants JSONB,
        recording_url TEXT,
        transcript_url TEXT,
        transcript_text TEXT,
        summary TEXT,
        action_items JSONB,
        topics JSONB,
        sentiment_score FLOAT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS meeting_speakers (
        id SERIAL PRIMARY KEY,
        meeting_id UUID REFERENCES meeting_transcripts(id) ON DELETE CASCADE,
        speaker_name VARCHAR,
        speaker_email VARCHAR,
        speaking_time_seconds INTEGER,
        word_count INTEGER,
        key_points JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_meeting_date ON meeting_transcripts(meeting_date);
      CREATE INDEX IF NOT EXISTS idx_participants ON meeting_transcripts USING GIN (participants);
      CREATE INDEX IF NOT EXISTS idx_topics ON meeting_transcripts USING GIN (topics);
      CREATE INDEX IF NOT EXISTS idx_meeting_speakers ON meeting_speakers(meeting_id);
    `);
    
    // Insert meeting
    const { rows } = await client.query(
      `INSERT INTO meeting_transcripts 
       (read_ai_meeting_id, title, meeting_date, duration_minutes, participants, 
        recording_url, transcript_url, transcript_text, summary, action_items, topics, sentiment_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (read_ai_meeting_id) 
       DO UPDATE SET 
         title = EXCLUDED.title,
         transcript_text = EXCLUDED.transcript_text,
         summary = EXCLUDED.summary,
         action_items = EXCLUDED.action_items,
         topics = EXCLUDED.topics,
         updated_at = NOW()
       RETURNING id`,
      [
        meetingData.read_ai_meeting_id,
        meetingData.title,
        meetingData.meeting_date,
        meetingData.duration_minutes,
        JSON.stringify(meetingData.participants || []),
        meetingData.recording_url,
        meetingData.transcript_url,
        meetingData.transcript_text,
        meetingData.summary,
        JSON.stringify(meetingData.action_items || []),
        JSON.stringify(meetingData.topics || []),
        meetingData.sentiment_score || null
      ]
    );
    
    const meetingId = rows[0].id;
    
    // Insert speakers
    if (meetingData.speakers && meetingData.speakers.length > 0) {
      for (const speaker of meetingData.speakers) {
        await client.query(
          `INSERT INTO meeting_speakers 
           (meeting_id, speaker_name, speaker_email, speaking_time_seconds, word_count, key_points)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            meetingId,
            speaker.name,
            speaker.email || null,
            speaker.speaking_time_seconds || 0,
            speaker.word_count || 0,
            JSON.stringify(speaker.key_points || [])
          ]
        );
      }
    }
    
    await client.query('COMMIT');
    return meetingId;
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Store meeting chunks in Pinecone
export async function storeMeetingInPinecone(meetingData, chunks) {
  try {
    const idx = pinecone.index(pcIndexName);
    const vectors = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Generate embedding for this chunk
      const embed = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: chunk.text
      });
      
      const vector = embed.data[0].embedding;
      
      // Prepare vector for Pinecone
      vectors.push({
        id: `meeting_${meetingData.read_ai_meeting_id}_chunk_${i}`,
        values: vector,
        metadata: {
          meeting_id: meetingData.read_ai_meeting_id,
          meeting_title: meetingData.title,
          meeting_date: meetingData.meeting_date,
          speaker: chunk.speaker || 'Unknown',
          chunk_text: chunk.text.substring(0, 1000), // Pinecone metadata limit
          chunk_index: i,
          topics: meetingData.topics || [],
          type: 'meeting_transcript',
          source: 'read_ai'
        }
      });
    }
    
    // Upsert vectors in batches of 100
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await idx.upsert(batch);
    }
    
    console.log(`Stored ${vectors.length} chunks in Pinecone for meeting ${meetingData.read_ai_meeting_id}`);
    return vectors.length;
    
  } catch (error) {
    console.error('Error storing in Pinecone:', error);
    throw error;
  }
}

// Main processing function
export async function processMeetingTranscript(pool, webhookData) {
  try {
    console.log('Processing Read.AI webhook:', webhookData.meeting_id);
    
    // Extract data from Read.AI webhook
    const transcript = webhookData.transcript || webhookData.transcript_text || '';
    
    if (!transcript) {
      throw new Error('No transcript found in webhook data');
    }
    
    // Extract insights using AI
    const [actionItems, topics, summary] = await Promise.all([
      extractActionItems(transcript),
      extractTopics(transcript),
      generateSummary(transcript)
    ]);
    
    // Prepare meeting data
    const meetingData = {
      read_ai_meeting_id: webhookData.meeting_id || webhookData.id,
      title: webhookData.title || webhookData.meeting_name || 'Untitled Meeting',
      meeting_date: webhookData.scheduled_at || webhookData.start_time || new Date().toISOString(),
      duration_minutes: Math.floor((webhookData.duration || 0) / 60),
      participants: webhookData.participants || [],
      recording_url: webhookData.recording_url || webhookData.video_url,
      transcript_url: webhookData.transcript_url,
      transcript_text: transcript,
      summary,
      action_items: actionItems,
      topics,
      speakers: webhookData.speakers || [],
      sentiment_score: webhookData.sentiment_score
    };
    
    // Chunk the transcript
    const chunks = chunkTranscript(transcript);
    console.log(`Created ${chunks.length} chunks from transcript`);
    
    // Store in both PostgreSQL and Pinecone
    const [meetingId, vectorCount] = await Promise.all([
      storeMeetingInDatabase(pool, meetingData),
      storeMeetingInPinecone(meetingData, chunks)
    ]);
    
    console.log(`✅ Meeting processed successfully: ${meetingId}`);
    console.log(`   - Stored in PostgreSQL: ${meetingId}`);
    console.log(`   - Stored in Pinecone: ${vectorCount} vectors`);
    console.log(`   - Action items: ${actionItems.length}`);
    console.log(`   - Topics: ${topics.join(', ')}`);
    
    return {
      success: true,
      meeting_id: meetingId,
      chunks_stored: vectorCount,
      action_items: actionItems.length,
      topics: topics.length
    };
    
  } catch (error) {
    console.error('Error processing meeting transcript:', error);
    throw error;
  }
}

// Search meetings in PostgreSQL
export async function searchMeetings(pool, query, filters = {}) {
  try {
    const conditions = [];
    const params = [];
    let paramCount = 1;
    
    // Text search in title, summary, or transcript
    if (query) {
      conditions.push(`(
        title ILIKE $${paramCount} OR 
        summary ILIKE $${paramCount} OR 
        transcript_text ILIKE $${paramCount}
      )`);
      params.push(`%${query}%`);
      paramCount++;
    }
    
    // Date filters
    if (filters.start_date) {
      conditions.push(`meeting_date >= $${paramCount}`);
      params.push(filters.start_date);
      paramCount++;
    }
    
    if (filters.end_date) {
      conditions.push(`meeting_date <= $${paramCount}`);
      params.push(filters.end_date);
      paramCount++;
    }
    
    // Topic filter
    if (filters.topic) {
      conditions.push(`topics @> $${paramCount}::jsonb`);
      params.push(JSON.stringify([filters.topic]));
      paramCount++;
    }
    
    // Participant filter
    if (filters.participant) {
      conditions.push(`participants::text ILIKE $${paramCount}`);
      params.push(`%${filters.participant}%`);
      paramCount++;
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const { rows } = await pool.query(
      `SELECT 
        id,
        read_ai_meeting_id,
        title,
        meeting_date,
        duration_minutes,
        participants,
        summary,
        action_items,
        topics,
        created_at
       FROM meeting_transcripts
       ${whereClause}
       ORDER BY meeting_date DESC
       LIMIT ${filters.limit || 10}`,
      params
    );
    
    return rows;
  } catch (error) {
    console.error('Error searching meetings:', error);
    return [];
  }
}


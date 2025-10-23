# Microsoft Teams Agent - Integration Guide

## Overview

The Microsoft Teams Agent has been successfully integrated into your platform as a standalone module. This integration provides the same functionality as the MCP Teams Server but adapted for your web platform.

## What Was Done

### 1. **Created Standalone Microsoft Agent Page**
- **Location**: `/src/pages/MicrosoftAgentPage.tsx`
- **Route**: `/microsoft-agent`
- **Sidebar**: Added "Microsoft Agent" link with MessagesSquare icon

### 2. **Backend API Service**
- **Location**: `/server/lib/teamsService.mjs`
- **API Routes**: Added to `/server/index.mjs`

The service provides these capabilities:
- ✅ List all Teams
- ✅ List channels in a team
- ✅ List team members
- ✅ Read channel messages/threads
- ✅ Create new threads with optional @mentions
- ✅ Reply to existing threads with optional @mentions
- ✅ Get message replies

## Important: LLM/API Requirements

### **NO ADDITIONAL LLM API NEEDED!**

The MCP Teams Server code you provided is **NOT an LLM itself**. Here's what you need to understand:

#### What is MCP (Model Context Protocol)?
- MCP is a **protocol** that allows desktop AI applications (like Claude Desktop, Cursor, Cline) to use external tools
- The `mcp-teams-server` is a **tool server** that desktop LLMs can connect to
- It provides Teams functionality as tools that the LLM can call

#### For Your Web Platform:
Your existing environment variables are **perfect** and sufficient:

```env
# You already have these in Render environment - NO CHANGES NEEDED:
OPENAI_API_KEY=<your-existing-openai-key>

# Microsoft credentials (already configured in Render):
MICROSOFT_CLIENT_ID=<your-microsoft-client-id>
MICROSOFT_CLIENT_SECRET=<your-microsoft-client-secret>
MICROSOFT_TENANT_ID=<your-microsoft-tenant-id>

# ✅ These are already set in Render's environment variables
# ✅ No changes needed - the app will work automatically
```

**Your OpenAI API key** will power any AI features you want to add to the Teams Agent (like AI-assisted message drafting, summarization, etc.).

## Microsoft Graph API Permissions Required

Your Microsoft app registration needs these permissions:

### Currently Required:
- `Team.ReadBasic.All` - Read team information
- `Channel.ReadBasic.All` - Read channel information  
- `ChannelMessage.Read.All` - Read channel messages
- `ChannelMessage.Send` - Send messages to channels
- `TeamMember.Read.All` - Read team member information

### How to Verify/Add Permissions:

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to: **Azure Active Directory** → **App registrations**
3. Find your app: Search for your MICROSOFT_CLIENT_ID (in Render env vars)
4. Click: **API permissions**
5. Check if the permissions above are listed
6. If missing, click **Add a permission** → **Microsoft Graph** → **Application permissions**
7. Add the required permissions
8. Click: **Grant admin consent for [Your Organization]**
9. Wait 5-10 minutes for changes to propagate

## Features Available in the Microsoft Agent

### User Interface
The Microsoft Agent page provides:

1. **Team & Channel Selector**
   - Select which Team to work with
   - Select which Channel to view/post to
   - View all team members

2. **Create New Threads**
   - Add a title (subject)
   - Write content
   - Optionally @mention team members
   - Post to selected channel

3. **View Channel Messages**
   - See all recent messages in the channel
   - View message details (author, timestamp, content)
   - Refresh to get latest messages

4. **Reply to Threads**
   - Click "Reply" on any message
   - Write your response
   - Optionally @mention team members
   - Post reply

### API Endpoints Created

```javascript
// List teams
GET /api/microsoft/teams

// List channels in a team
GET /api/microsoft/teams/:teamId/channels

// List team members
GET /api/microsoft/teams/:teamId/members

// List channel messages
GET /api/microsoft/teams/:teamId/channels/:channelId/messages

// Get message replies
GET /api/microsoft/teams/:teamId/channels/:channelId/messages/:messageId/replies

// Create new message/thread
POST /api/microsoft/teams/:teamId/channels/:channelId/messages
Body: { subject, content, mentionMember }

// Reply to message
POST /api/microsoft/teams/:teamId/channels/:channelId/messages/:messageId/replies
Body: { content, mentionMember }
```

## Comparison: MCP Teams Server vs Our Integration

### MCP Teams Server (Python)
- **Purpose**: Desktop LLM tool server
- **Use Case**: Claude Desktop, Cursor IDE, Cline can use it
- **Communication**: stdio/sse protocol
- **Environment**: Runs separately, LLM connects to it
- **Language**: Python

### Our Integration (JavaScript/TypeScript)
- **Purpose**: Web-based Teams interface
- **Use Case**: Direct user interaction through browser
- **Communication**: REST API
- **Environment**: Integrated into your existing platform
- **Language**: JavaScript/TypeScript (Node.js + React)

## Optional: Using the Python MCP Server

If you still want to use the Python MCP Teams Server with desktop AI tools:

### Environment Variables Needed:
```env
# Map your existing Render credentials:
TEAMS_APP_ID=<same-as-MICROSOFT_CLIENT_ID>
TEAMS_APP_PASSWORD=<same-as-MICROSOFT_CLIENT_SECRET>
TEAMS_APP_TYPE=SingleTenant
TEAMS_APP_TENANT_ID=<same-as-MICROSOFT_TENANT_ID>

# You'll need to get these from Microsoft Teams:
TEAM_ID=<your-team-id>
TEAMS_CHANNEL_ID=<your-channel-id>
```

### How to Get Team ID and Channel ID:

1. **Get Team ID:**
   - Go to Microsoft Teams
   - Click on your team name → "..." → "Get link to team"
   - The URL contains the Team ID
   - Or use the web interface at `/microsoft-agent` - it shows all teams with their IDs

2. **Get Channel ID:**
   - In Teams, click channel → "..." → "Get link to channel"
   - The URL contains the Channel ID (URL encoded)
   - Or use the web interface - select a team to see channel IDs

### Installation (Optional):
```bash
cd mcp-teams-server-master
uv venv
uv sync --frozen --all-extras
uv run mcp-teams-server
```

## Testing the Integration

### 1. Test via Render Shell:
```bash
# Test if Microsoft credentials work
node test_ms_final.mjs
```

### 2. Test via Web Interface:
1. Start your server: `npm start` or deploy to Render
2. Navigate to `/microsoft-agent`
3. You should see:
   - List of teams loading automatically
   - Channels loading when you select a team
   - Team members displaying
   - Ability to view messages
   - Forms to create threads and replies

### 3. Common Issues:

**"Failed to list teams"**
- Check Microsoft Graph API permissions
- Ensure admin consent is granted
- Verify credentials in environment variables

**"No teams found"**
- Make sure your app has access to teams
- Check if Teams licenses are active
- Verify the app is installed in Teams

**"Cannot post messages"**
- Ensure `ChannelMessage.Send` permission is granted
- Check that the bot/app is added to the team
- Verify admin consent was granted

## Architecture

```
User Browser
    ↓
React Frontend (/microsoft-agent)
    ↓
Express API (/api/microsoft/teams/...)
    ↓
teamsService.mjs (Microsoft Graph API)
    ↓
Microsoft Teams (via Graph API)
```

## Next Steps

1. ✅ **Integration Complete** - The Microsoft Agent is now accessible via sidebar
2. 🔧 **Test Permissions** - Run the test script to verify access
3. 🚀 **Deploy to Render** - Push changes and deploy
4. 📊 **Monitor Usage** - Check logs for any permission issues
5. 🤖 **Optional AI Enhancement** - Use OpenAI to add smart features like:
   - Message summarization
   - AI-assisted reply drafting
   - Sentiment analysis
   - Thread categorization

## Summary

✅ **No new LLM API needed** - Your existing OpenAI key is sufficient  
✅ **Uses existing Microsoft credentials** - Already configured  
✅ **Standalone module** - Accessible via sidebar  
✅ **Same functionality** - Matches MCP Teams Server capabilities  
✅ **Web-based UI** - No Python/desktop requirements  

The integration is complete and ready to use!


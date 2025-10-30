# MCP Render Integration Setup

## 🎯 Purpose
Enable Cursor AI to access Render directly to:
- View deployment logs
- Check environment variables
- Monitor service status
- Verify deployments
- Troubleshoot issues in real-time

## 🔑 Your Render API Key
```
rnd_gWJ2mQQZLTpRjYstqD5cjdoLc5jQ
```

## 📝 MCP Configuration for Cursor

Add this to your Cursor MCP settings file:

### Location of MCP Settings File:
- **macOS:** `~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Or access via: Cursor → Settings → Extensions → MCP Settings

### Configuration to Add:

```json
{
  "mcpServers": {
    "render": {
      "command": "npx",
      "args": [
        "-y",
        "@render/mcp-server-render"
      ],
      "env": {
        "RENDER_API_KEY": "rnd_gWJ2mQQZLTpRjYstqD5cjdoLc5jQ"
      }
    }
  }
}
```

## 🚀 Alternative: Direct Installation

If you prefer to install the Render MCP server globally:

```bash
# Install globally
npm install -g @render/mcp-server-render

# Then use this configuration
{
  "mcpServers": {
    "render": {
      "command": "mcp-server-render",
      "env": {
        "RENDER_API_KEY": "rnd_gWJ2mQQZLTpRjYstqD5cjdoLc5jQ"
      }
    }
  }
}
```

## 📋 Step-by-Step Setup

### Option 1: Via Cursor Settings UI
1. Open Cursor
2. Go to: **Settings** → **Extensions** → **Claude Dev** or **MCP Settings**
3. Look for "MCP Servers" configuration
4. Add the Render server configuration above
5. Restart Cursor

### Option 2: Via Settings File
1. Quit Cursor completely
2. Open the settings file:
   ```bash
   code ~/Library/Application\ Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json
   ```
3. Add the configuration above
4. Save the file
5. Restart Cursor

### Option 3: Create New Settings File
If the file doesn't exist yet:

```bash
# Create directory if needed
mkdir -p ~/Library/Application\ Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/

# Create the settings file
cat > ~/Library/Application\ Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json << 'EOF'
{
  "mcpServers": {
    "render": {
      "command": "npx",
      "args": [
        "-y",
        "@render/mcp-server-render"
      ],
      "env": {
        "RENDER_API_KEY": "rnd_gWJ2mQQZLTpRjYstqD5cjdoLc5jQ"
      }
    }
  }
}
EOF
```

## ✅ What You'll Be Able to Do

Once configured, I'll be able to:

### 1. Check Deployment Logs
```
View real-time logs for cazar-main service
See deployment progress
Check for errors during deployment
```

### 2. View Environment Variables
```
List all environment variables
Verify ANTHROPIC_API_KEY is set
Check DATABASE_URL configuration
Confirm Microsoft credentials
```

### 3. Monitor Services
```
Check service status (running/deploying/failed)
View deployment history
See recent deploys
```

### 4. Manage Deployments
```
Trigger manual deploys
Check build status
View deploy logs
```

## 🧪 Test the Configuration

After setup, test by asking me:
- "Check the Render logs for cazar-main"
- "What environment variables are set in Render?"
- "Is the deployment complete?"
- "Show me recent deployment history"

## 📊 Your Render Services

Based on your setup, you have:
- **Service:** cazar-main
- **Type:** Web Service
- **Region:** Oregon (US West)
- **Plan:** Free/Starter tier
- **Auto-deploy:** Enabled from GitHub main branch

## 🔒 Security Notes

- ✅ API key is scoped to your account only
- ✅ Read/write access to your services
- ✅ Can view but not expose sensitive env vars
- ⚠️  Keep this API key private
- ⚠️  Don't commit to public repos

## 🐛 Troubleshooting

### "MCP server not found"
Try installing explicitly:
```bash
npm install -g @render/mcp-server-render
```

### "Permission denied"
Make sure the settings directory exists:
```bash
mkdir -p ~/Library/Application\ Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/
```

### "API key invalid"
Verify the key in Render dashboard:
1. Go to https://dashboard.render.com/u/settings/api-keys
2. Confirm the key is: `rnd_gWJ2mQQZLTpRjYstqD5cjdoLc5jQ`

## 📚 Available MCP Commands

Once connected, I can use:
- `render.services.list` - List all services
- `render.services.get` - Get service details
- `render.deploys.list` - List deployments
- `render.deploys.get` - Get deploy details
- `render.logs.get` - Fetch service logs
- `render.env.list` - List environment variables
- `render.env.get` - Get specific env var (obfuscated)

## 🎯 Next Steps

1. **Add the configuration** to Cursor MCP settings
2. **Restart Cursor** to load the MCP server
3. **Test it** by asking me to check Render status
4. **Monitor deployment** of the email fix we just pushed

---

**Ready to use once configured!** Let me know when you've added it and I'll verify the connection.




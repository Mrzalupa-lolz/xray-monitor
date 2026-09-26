# Infrastructure-Agnostic Configuration Guide

This project has been fully refactored to remove all hardcoded infrastructure assumptions. It now works with **any** network topology through tag-based configuration in your Remnawave panel.

## Overview of Changes

All hardcoded assumptions about specific countries, node names, or network architecture have been removed:
- ❌ No more Iran/Germany/Finland assumptions
- ❌ No more IR1/DE1/FI1 fallback names
- ❌ No more `LIKE '%IR%'` pattern matching
- ✅ Pure tag-based role detection
- ✅ Dynamic node discovery via Remnawave API
- ✅ Configurable through panel tags only

## How It Works Now

### Node Role Detection

Nodes are classified purely by **tags** in your Remnawave panel:

| Tag | Role | Purpose |
|-----|------|---------|
| `tunnel` | TUNNEL | Entry point that forwards traffic to bridge nodes |
| `bridge` or `core` | BRIDGE | Core gateway handling traffic analysis and routing |
| `outbound` or `exit` | OUTBOUND | Exit node for final egress routing |
| (no tag) | OTHER | Managed node with unspecified role |

### Configuration Requirements

1. **Tag your nodes in Remnawave panel** with appropriate role tags
2. **Set NODE_ROLE in agent docker-compose.yml** to match the node's actual function
3. **Ensure NODE_NAME matches** the exact node name from Remnawave panel

### Example Configurations

#### Example 1: Netherlands Bridge Node (Direct + Tunneled)
```yaml
# In your NL node's docker-compose.yml
environment:
  NODE_NAME: nl-bridge-1        # Must match Remnawave panel name
  NODE_ROLE: BRIDGE             # This node handles both direct and tunneled
  COLLECTOR_URL: https://monitor.yourdomain.com/api/ingest
  INGEST_SECRET: your_secret
```

**In Remnawave panel**: Tag this node with `bridge` or `core`

#### Example 2: Poland Tunnel Node
```yaml
environment:
  NODE_NAME: pl-tunnel-1
  NODE_ROLE: TUNNEL
  COLLECTOR_URL: https://monitor.yourdomain.com/api/ingest
  INGEST_SECRET: your_secret
```

**In Remnawave panel**: Tag this node with `tunnel`

#### Example 3: Finland Exit Node
```yaml
environment:
  NODE_NAME: fi-exit-1
  NODE_ROLE: OUTBOUND
  COLLECTOR_URL: https://monitor.yourdomain.com/api/ingest
  INGEST_SECRET: your_secret
```

**In Remnawave panel**: Tag this node with `outbound` or `exit`

## Topology Auto-Discovery

The system automatically builds your network topology from Remnawave API:

1. **Fetches all nodes** from `/api/nodes` endpoint
2. **Maps roles** based on tags
3. **Detects local node** by matching IP addresses
4. **Builds routing map** from Xray config profiles
5. **Resolves traffic paths** dynamically (e.g., PL → NL → FI)

## Traffic Path Resolution

The system now intelligently detects traffic paths without hardcoded patterns:

### Tunneled Traffic Detection
- Checks if user's `connected_node` matches any node with role `TUNNEL`
- Uses shortName matching: if user connected to a node with shortName "PL", looks for TUNNEL nodes containing "PL"
- No more hardcoded "IR" substring checks

### Bridge Detection
- Identifies which tunnel inbounds forward to which bridge inbounds
- Matches by WebSocket path or tag patterns in Xray config
- Dynamically maps tunnel → bridge → outbound chains

### Direct vs Tunneled Calculation
For bridge nodes:
```
direct_traffic = total_bridge_traffic - sum(feeding_tunnel_traffic)
```

No assumptions about node names or locations.

## Migration from Hardcoded Setup

If you were using the original hardcoded version:

### Step 1: Tag Your Nodes
Go to your Remnawave panel and tag each node:
- Entry/relay nodes: add `tunnel` tag
- Core routing nodes: add `bridge` or `core` tag
- Exit nodes: add `outbound` or `exit` tag

### Step 2: Update Agent Configs
For each xray-monitor-node agent, ensure:
```yaml
NODE_NAME: <exact-name-from-remnawave-panel>
NODE_ROLE: <TUNNEL|BRIDGE|OUTBOUND>
```

### Step 3: Verify
1. Restart xray-monitor-node agents
2. Check collector logs for: `Dynamic local node set from Remnawave API: <name>`
3. Visit dashboard `/api/remna/sessions` to see detected roles
4. Check that "Unmonitored" status is resolved

## Troubleshooting

### "Unmonitored — No telemetry agent reporting"

**Cause**: NODE_NAME mismatch between agent config and Remnawave panel

**Fix**:
1. Check exact node name in Remnawave panel
2. Update `NODE_NAME` in docker-compose.yml to match exactly
3. Restart agent: `docker compose up -d xray-monitor-node`

### Wrong Node Role Detected

**Cause**: Missing or incorrect tags in Remnawave panel

**Fix**:
1. Go to Remnawave panel → Nodes
2. Add appropriate tag: `tunnel`, `bridge`, `core`, `outbound`, or `exit`
3. Wait for next sync (5 minutes) or restart monitor

### Direct/Tunneled Traffic Shows Zero

**Cause**: Xray routing rules not detected or feeding tunnels not mapped

**Fix**:
1. Ensure config profiles are properly set in Remnawave
2. Check that tunnel outbounds have `bridge-*` tag prefix
3. Verify WebSocket paths match between tunnel outbound and bridge inbound

### Node Shows as "unknown" or "OTHER"

**Cause**: No recognized tags on the node

**Fix**: Add at least one role tag (`tunnel`, `bridge`, `core`, `outbound`, or `exit`) in Remnawave panel

## API Environment Variables

```bash
# Required: Your Remnawave panel API endpoint
REMNAWAVE_API_URL=https://panel.yourdomain.com/api

# Required: Bearer token for Remnawave API
REMNAWAVE_API_TOKEN=your_token_here

# Required: Shared secret for agent→collector authentication
INGEST_SECRET=your_secure_random_secret

# Optional: Server port (default: 9922)
PORT=9922

# Optional: Data directory (default: ./data or /app/data)
DATA_DIR=/app/data

# Optional: Exclude specific user IDs from analytics
EXCLUDED_USER_IDS=104,105
```

## Benefits of This Approach

✅ **Portable**: Works with any country, any provider, any topology
✅ **Maintainable**: No code changes needed when adding/removing nodes
✅ **Scalable**: Add new nodes by tagging them in Remnawave panel
✅ **Accurate**: No fallback hardcoded names masking real issues
✅ **Self-documenting**: Node roles visible in panel tags

## Architecture Flexibility

This refactored version supports:
- Simple topologies: Single bridge node
- Tunneled topologies: Tunnel → Bridge → Direct
- Multi-hop: Tunnel → Bridge → Outbound exit
- Hybrid: Mix of direct and tunneled on same bridge
- Custom: Any combination via tags and routing rules

No code changes required for any of these architectures.

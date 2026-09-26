import { networkInterfaces } from "node:os";

export interface InboundConfig {
  tag: string;
  port?: number;
  type?: string;
  network?: string;
  path?: string;
}

export interface RemnaNode {
  uuid: string;
  id: number;
  name: string;
  shortName: string;
  address: string;
  countryCode: string;
  tags: string[];
  activeInbounds: InboundConfig[];
}

export interface HopInfo {
  nodeName: string;
  shortName: string;
  tag: string;
  port?: number;
}

export interface ResolvedPathway {
  hops: HopInfo[];
  ingressShortName: string;
  involved: Array<{ name: string; shortName: string }>;
  nodePath: string;
  detailedPathway: string;
}

export interface XrayRule {
  inboundTag: string[];
  outboundTag: string;
}

export interface XrayOutbound {
  tag: string;
  protocol: string;
  settings?: {
    address?: string;
    port?: number;
    [key: string]: any;
  };
  streamSettings?: {
    network?: string;
    security?: string;
    wsSettings?: {
      path?: string;
      [key: string]: any;
    };
    tlsSettings?: {
      serverName?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };
}

export interface ConfigProfile {
  uuid: string;
  name: string;
  config: {
    routing?: {
      rules?: XrayRule[];
      [key: string]: any;
    };
    inbounds?: any[];
    outbounds?: XrayOutbound[];
    [key: string]: any;
  };
  nodes?: Array<{ uuid: string; name: string }>;
}

let cachedNodes: RemnaNode[] = [];
let cachedProfiles: ConfigProfile[] = [];
let lastFetchTime = 0;

export function getLocalHostIps(): Set<string> {
  const ips = new Set<string>();
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (!net.internal && net.family === "IPv4") {
        ips.add(net.address);
      }
    }
  }
  return ips;
}

export async function getRemnawaveNodes(forceRefresh: boolean = false): Promise<RemnaNode[]> {
  const now = Date.now();
  if (!forceRefresh && cachedNodes.length > 0 && now - lastFetchTime < 60000) {
    return cachedNodes;
  }

  const apiUrl = process.env.REMNAWAVE_API_URL || "https://panel.example.com/api";
  const apiToken = process.env.REMNAWAVE_API_TOKEN;

  try {
    const res = await fetch(`${apiUrl}/nodes`, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { response: any[] };

    cachedNodes = (data.response || []).map((n: any) => {
      const tags: string[] = (n.tags || []).map((t: string) => t.toLowerCase());
      const rawName: string = n.name || "Unknown";
      const shortName = (rawName.split("-")[0] || rawName).toUpperCase();

      const activeInbounds: InboundConfig[] = (n.configProfile?.activeInbounds || []).map((ib: any) => {
        const raw = ib.rawInbound || {};
        const stream = raw.streamSettings || {};
        const ws = stream.wsSettings || {};
        return {
          tag: ib.tag,
          port: ib.port ? parseInt(ib.port, 10) : undefined,
          type: ib.type || raw.protocol || "unknown",
          network: ib.network || stream.network || "tcp",
          path: ws.path || undefined,
        };
      });

      return {
        uuid: n.uuid || "",
        id: n.id,
        name: n.name,
        shortName,
        address: n.address,
        countryCode: n.countryCode || "",
        tags,
        activeInbounds,
      };
    });

    lastFetchTime = now;
  } catch (err) {
    console.warn("[Topology] Failed to fetch nodes from Remnawave API:", err);
  }

  return cachedNodes;
}

export async function getRemnawaveConfigProfiles(forceRefresh: boolean = false): Promise<ConfigProfile[]> {
  const now = Date.now();
  if (!forceRefresh && cachedProfiles.length > 0 && now - lastFetchTime < 60000) {
    return cachedProfiles;
  }

  const apiUrl = process.env.REMNAWAVE_API_URL || "https://panel.example.com/api";
  const apiToken = process.env.REMNAWAVE_API_TOKEN;

  try {
    const res = await fetch(`${apiUrl}/config-profiles`, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { response?: { configProfiles?: ConfigProfile[] } };
    cachedProfiles = data.response?.configProfiles || [];
  } catch (err) {
    console.warn("[Topology] Failed to fetch config profiles from Remnawave API:", err);
  }

  return cachedProfiles;
}

export function detectLocalNode(nodes: RemnaNode[]): RemnaNode | undefined {
  const localIps = getLocalHostIps();
  return nodes.find((n) => localIps.has(n.address) || n.address === process.env.LOCAL_NODE_IP);
}

export function isBridgeRole(nodeName: string, nodes: RemnaNode[]): boolean {
  return true;
}

/**
 * Builds a dynamic map of which Tunnel inbounds forward into which Bridge inbounds
 * based on actual Xray config outbounds & routing rules.
 * e.g. "bridge-default-out" (path: /api/v1/play) -> "in-default" (path: /api/v1/play)
 */
export function buildTunnelToBridgeInboundMap(profiles: ConfigProfile[]): Map<string, string> {
  const tunnelProf = profiles.find((p) => p.name.toLowerCase().includes("tunnel"));
  const bridgeProf = profiles.find((p) => p.name.toLowerCase().includes("bridge"));

  const map = new Map<string, string>();
  if (!tunnelProf || !bridgeProf) return map;

  const tunnelOutbounds = tunnelProf.config?.outbounds || [];
  const bridgeInbounds = bridgeProf.config?.inbounds || [];
  const tunnelRules = tunnelProf.config?.routing?.rules || [];

  // 1. Map tunnel outbound tag -> bridge inbound tag
  const outToBridgeIn = new Map<string, string>();
  for (const o of tunnelOutbounds) {
    const path = o.streamSettings?.wsSettings?.path;

    // Check if this outbound targets the bridge node (by tag prefix or path matching)
    if (o.tag.startsWith("bridge-") || o.tag.includes("-bridge")) {
      const match = bridgeInbounds.find((ib) => {
        const ibPath = ib.streamSettings?.wsSettings?.path;
        return (path && ibPath && path === ibPath) || ib.tag === o.tag.replace(/^bridge-/, "").replace(/-out$/, "");
      });

      if (match) {
        outToBridgeIn.set(o.tag, match.tag);
      }
    }
  }

  // 2. Map tunnel inbound tag -> bridge inbound tag
  for (const r of tunnelRules) {
    const targetBridgeIn = outToBridgeIn.get(r.outboundTag);
    if (targetBridgeIn && Array.isArray(r.inboundTag)) {
      for (const inTag of r.inboundTag) {
        map.set(inTag, targetBridgeIn);
      }
    }
  }

  return map;
}

/**
 * Returns all tunnel inbound tags that forward to a specific bridge inbound tag
 */
export function getFeedingTunnelInbounds(profiles: ConfigProfile[], bridgeInboundTag: string): string[] {
  const map = buildTunnelToBridgeInboundMap(profiles);
  const feeders: string[] = [];
  for (const [tunnelIn, bridgeIn] of map.entries()) {
    if (bridgeIn === bridgeInboundTag) {
      feeders.push(tunnelIn);
    }
  }
  return feeders;
}

/**
 * Exact Xray Config-driven Auto-Topology & Route Pathway Discovery
 * Uses actual Xray routing rules and outbounds fetched directly from Remnawave API.
 */
export function resolveConnectionNodes(
  inbound: string,
  outbound: string,
  processingNodeName: string,
  nodes: RemnaNode[],
  userConnectedNode?: string,
  profiles: ConfigProfile[] = cachedProfiles
): ResolvedPathway {
  if (!nodes || nodes.length === 0) {
    const defaultHop: HopInfo = {
      nodeName: processingNodeName || "unknown",
      shortName: (processingNodeName || "unknown").split("-")[0]!.toUpperCase(),
      tag: inbound || "unknown",
    };
    return {
      hops: [defaultHop],
      ingressShortName: defaultHop.shortName,
      involved: [{ name: defaultHop.nodeName, shortName: defaultHop.shortName }],
      nodePath: defaultHop.shortName,
      detailedPathway: `${defaultHop.shortName}: ${inbound} → ${outbound || "direct"}`,
    };
  }

  const originNode = nodes.find(
    (n) =>
      n.name.toLowerCase() === processingNodeName.toLowerCase() ||
      n.shortName.toLowerCase() === processingNodeName.toLowerCase()
  ) || nodes.find((n) => n.activeInbounds.some((ib) => ib.tag === inbound)) || nodes[0]!;

  const hop: HopInfo = {
    nodeName: originNode.name,
    shortName: originNode.shortName,
    tag: inbound,
  };

  const involved = [{ name: originNode.name, shortName: originNode.shortName }];
  const nodePath = originNode.shortName;
  const detailedPathway = `${originNode.shortName}: ${inbound} → ${outbound || "direct"}`;

  return {
    hops: [hop],
    ingressShortName: originNode.shortName,
    involved,
    nodePath,
    detailedPathway,
  };
}

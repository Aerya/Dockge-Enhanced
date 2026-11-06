import type { TopologyContainer, TopologySnapshot } from "../../common/docker-topology";
import { parseDockerPortLink, resolveEndpointHostname } from "../../common/util-common";
export function topologyPortUrl(port: TopologyContainer["ports"][number], snapshot: TopologySnapshot, endpoint: string, agentUrl: string | undefined, hostname: string, protocol: string) {
    if (port.protocol !== "tcp" || !Number.isInteger(port.published) || port.published < 1 || port.published > 65535) {
        return "";
    }
    // Loopback on a remote host is not the browser's loopback.
    let loopbackV6 = false;
    try {
        loopbackV6 = new URL(`http://[${port.address}]`).hostname === "[::1]";
    } catch {
        // IPv4 and wildcard addresses do not parse as IPv6.
    }
    if (loopbackV6 || port.address.startsWith("127.")) {
        return "";
    }
    const host = resolveEndpointHostname(endpoint, agentUrl, hostname, protocol, snapshot.primaryHostname, snapshot.portLinkAddressMode, snapshot.portLinkIp);
    if (!host) {
        return "";
    }
    const url = parseDockerPortLink(String(port.published) + ":" + port.target + "/tcp", host, snapshot.portLinkAddressMode).url;
    try {
        const parsed = new URL(url);
        return [ "http:", "https:" ].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.toString() : "";
    } catch {
        return "";
    }
}
export function topologyRoute(container: TopologyContainer, endpoint: string, details = false) {
    if (!container.stack) {
        return null;
    }
    const suffix = endpoint ? "/" + encodeURIComponent(endpoint) : "";
    return details ? "/container/" + encodeURIComponent(container.stack) + "/" + encodeURIComponent(container.id) + suffix
        : "/compose/" + encodeURIComponent(container.stack) + suffix;
}

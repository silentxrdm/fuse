const os = require('node:os');
const dns = require('node:dns').promises;
const { exec } = require('node:child_process');

function getPrivateInterface() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
            if (iface.internal || iface.family !== 'IPv4') {
                continue;
            }
            if (isPrivateAddress(iface.address)) {
                return iface;
            }
        }
    }
    return null;
}

function isPrivateAddress(address) {
    return (
        address.startsWith('10.') ||
        address.startsWith('192.168.') ||
        (address.startsWith('172.') && (() => {
            const second = Number(address.split('.')[1]);
            return second >= 16 && second <= 31;
        })())
    );
}

function ipToInt(ip) {
    return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function intToIp(int) {
    return [int >>> 24, (int >>> 16) & 255, (int >>> 8) & 255, int & 255].join('.');
}

function deriveSubnet(baseAddress, netmask) {
    const baseInt = ipToInt(baseAddress);
    const maskInt = netmask ? ipToInt(netmask) : 0xffffff00; // default /24
    const networkInt = baseInt & maskInt;
    const cidr = 32 - Math.clz32(maskInt ^ 0xffffffff);
    return { network: intToIp(networkInt), cidr: cidr || 24 };
}

function buildRange(network, cidr) {
    if (cidr > 30) return [];
    const mask = cidr === 0 ? 0 : 0xffffffff << (32 - cidr);
    const networkInt = ipToInt(network) & mask;
    const hostCount = Math.max(2, Math.min(254, Math.pow(2, 32 - cidr) - 2));
    const range = [];
    for (let i = 1; i <= hostCount; i++) {
        range.push(intToIp(networkInt + i));
    }
    return range;
}

function ping(ip) {
    return new Promise((resolve) => {
        exec(`ping -c 1 -W 1 ${ip}`, (error) => {
            resolve(!error);
        });
    });
}

async function resolveHostname(ip) {
    try {
        const [hostname] = await dns.reverse(ip);
        return hostname;
    } catch (error) {
        return null;
    }
}

async function scan(subnetInput) {
    const iface = getPrivateInterface();
    const fallback = { network: '192.168.1.0', cidr: 24 };

    let subnet = fallback;
    if (iface) {
        const derived = deriveSubnet(iface.address, iface.netmask);
        subnet = derived.cidr ? derived : fallback;
    }

    if (subnetInput) {
        const [network, maybeCidr] = subnetInput.split('/');
        const cidr = Number(maybeCidr) || subnet.cidr;
        subnet = { network, cidr };
    }

    const hosts = buildRange(subnet.network, subnet.cidr);
    const reachable = [];
    const concurrency = 20;
    let index = 0;

    async function worker() {
        while (index < hosts.length) {
            const current = hosts[index++];
            const alive = await ping(current);
            if (alive) {
                const hostname = await resolveHostname(current);
                reachable.push({ ip: current, hostname: hostname || null });
            }
        }
    }

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);

    return { subnet: `${subnet.network}/${subnet.cidr}`, hosts: reachable.sort((a, b) => a.ip.localeCompare(b.ip)) };
}

module.exports = { scan };

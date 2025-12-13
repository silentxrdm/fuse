import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

export interface NetworkHost {
    ip: string;
    hostname: string | null;
    id?: number;
    label?: string | null;
    note?: string | null;
    tags?: string[];
    source?: string;
    lastSeen?: string | null;
    services?: NetworkServiceInfo[];
}

export interface NetworkScanResult {
    subnet: string;
    hosts: NetworkHost[];
}

export interface NetworkServiceInfo {
    port: number;
    protocol?: string;
    service?: string | null;
    note?: string | null;
    url?: string | null;
    lastSeen?: string | null;
}

@Injectable({ providedIn: 'root' })
export class NetworkService {
    constructor(private readonly http: HttpClient) {}

    scan(subnet?: string): Observable<NetworkScanResult> {
        const params = subnet ? { subnet } : {};
        return this.http.get<NetworkScanResult>('/api/network/scan', { params }).pipe(map((response) => response));
    }

    listServers(): Observable<NetworkHost[]> {
        return this.http.get<{ hosts: NetworkHost[] }>('/api/network/servers').pipe(map((response) => response.hosts));
    }

    addServer(payload: Partial<NetworkHost>): Observable<NetworkHost> {
        return this.http.post<NetworkHost>('/api/network/servers', payload);
    }

    importServers(hosts: Partial<NetworkHost>[]): Observable<NetworkHost[]> {
        return this.http
            .post<{ hosts: NetworkHost[] }>('/api/network/servers/import', { hosts })
            .pipe(map((response) => response.hosts));
    }

    addService(hostId: number, service: NetworkServiceInfo): Observable<NetworkHost> {
        return this.http.post<NetworkHost>(`/api/network/servers/${hostId}/services`, service);
    }

    scanPorts(hostId: number, ports?: number[]): Observable<{ host: NetworkHost; openPorts: NetworkServiceInfo[] }> {
        return this.http.post<{ host: NetworkHost; openPorts: NetworkServiceInfo[] }>(
            `/api/network/servers/${hostId}/scan-ports`,
            { ports },
        );
    }
}

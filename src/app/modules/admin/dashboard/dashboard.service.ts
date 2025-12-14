import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { NetworkHost } from 'app/core/network/network.service';

export interface DashboardTotals {
    entities: number;
    contacts: number;
    cases: number;
    networkHosts: number;
    remoteServers: number;
}

export interface DashboardSummary {
    totals: DashboardTotals;
    entities: { id: number; name: string; displayName?: string | null }[];
    recentContacts: Record<string, unknown>[];
    recentCases: Record<string, unknown>[];
    remoteServers: RemoteServer[];
    networkHosts: NetworkHost[];
}

export interface RemoteServer {
    id?: number;
    name: string;
    ip: string;
    sshPort?: number;
    webAdminUrl?: string | null;
    services?: { port: number; service?: string | null; url?: string | null }[];
    notes?: string | null;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
    constructor(private readonly http: HttpClient) {}

    loadSummary(): Observable<DashboardSummary> {
        return this.http.get<DashboardSummary>('/api/dashboard/summary').pipe(map((response) => response));
    }
}

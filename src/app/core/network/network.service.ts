import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

export interface NetworkHost {
    ip: string;
    hostname: string | null;
}

export interface NetworkScanResult {
    subnet: string;
    hosts: NetworkHost[];
}

@Injectable({ providedIn: 'root' })
export class NetworkService {
    constructor(private readonly http: HttpClient) {}

    scan(subnet?: string): Observable<NetworkScanResult> {
        const params = subnet ? { subnet } : {};
        return this.http.get<NetworkScanResult>('/api/network/scan', { params }).pipe(map((response) => response));
    }
}

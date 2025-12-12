import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

export type AuthType = 'none' | 'apiKeyHeader' | 'bearer' | 'basic';

export interface ApiSource {
    id: number;
    name: string;
    baseUrl: string;
    authType: AuthType;
    hasCredentials?: boolean;
}

export interface ApiField {
    name: string;
    type: string;
    example: unknown;
}

export interface CreateSourcePayload {
    name: string;
    baseUrl: string;
    authType: AuthType;
    credentials?: Record<string, unknown>;
}

export interface PreviewRequest {
    path: string;
    method?: string;
    payload?: unknown;
}

export interface PreviewResponse {
    url: string;
    preview: unknown;
    fields: ApiField[];
}

export interface ApiView {
    id: number;
    sourceId: number;
    name: string;
    path: string;
    method: string;
    fields: string[];
    payload?: unknown;
    createdAt?: string;
}

export interface CreateViewPayload {
    sourceId: number;
    name: string;
    path: string;
    method?: string;
    fields: string[];
    payload?: unknown;
}

export interface ViewDataResponse {
    url: string;
    data: unknown;
    fields: ApiField[];
}

export interface SubmitViewPayload {
    payload: unknown;
    method?: string;
    path?: string;
}

@Injectable({ providedIn: 'root' })
export class ApiSourcesService {
    private readonly baseUrl = '/api';

    constructor(private readonly http: HttpClient) {}

    listSources(): Observable<ApiSource[]> {
        return this.http
            .get<{ sources: ApiSource[] }>(`${this.baseUrl}/sources`)
            .pipe(map((response) => response.sources));
    }

    createSource(payload: CreateSourcePayload): Observable<ApiSource> {
        return this.http
            .post<{ source: ApiSource }>(`${this.baseUrl}/sources`, payload)
            .pipe(map((response) => response.source));
    }

    previewSource(id: number, payload: PreviewRequest): Observable<PreviewResponse> {
        return this.http.post<PreviewResponse>(`${this.baseUrl}/sources/${id}/preview`, payload);
    }

    listViews(): Observable<ApiView[]> {
        return this.http.get<{ views: ApiView[] }>(`${this.baseUrl}/views`).pipe(map((response) => response.views));
    }

    createView(payload: CreateViewPayload): Observable<ApiView> {
        return this.http
            .post<{ view: ApiView }>(`${this.baseUrl}/views`, payload)
            .pipe(map((response) => response.view));
    }

    getViewData(id: number): Observable<ViewDataResponse> {
        return this.http.get<ViewDataResponse>(`${this.baseUrl}/views/${id}/data`);
    }

    submitView(id: number, payload: SubmitViewPayload): Observable<unknown> {
        return this.http.post(`${this.baseUrl}/views/${id}/submit`, payload);
    }
}

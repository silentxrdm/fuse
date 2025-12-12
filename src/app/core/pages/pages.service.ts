import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

export interface PageDefinition {
    id: number;
    title: string;
    slug: string;
    viewId: number;
    tableFields: string[];
    formFields: string[];
    submitMethod: string;
    submitPath?: string;
}

export interface CreatePagePayload {
    title: string;
    slug: string;
    viewId: number;
    tableFields: string[];
    formFields: string[];
    submitMethod?: string;
    submitPath?: string;
}

@Injectable({ providedIn: 'root' })
export class PagesService {
    private readonly baseUrl = '/api/pages';

    constructor(private readonly http: HttpClient) {}

    listPages(): Observable<PageDefinition[]> {
        return this.http.get<{ pages: PageDefinition[] }>(this.baseUrl).pipe(map((response) => response.pages));
    }

    createPage(payload: CreatePagePayload): Observable<PageDefinition> {
        return this.http.post<{ page: PageDefinition }>(this.baseUrl, payload).pipe(map((response) => response.page));
    }

    getBySlug(slug: string): Observable<PageDefinition> {
        return this.http.get<{ page: PageDefinition }>(`${this.baseUrl}/${slug}`).pipe(map((response) => response.page));
    }
}

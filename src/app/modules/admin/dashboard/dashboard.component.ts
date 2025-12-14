import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { RouterModule } from '@angular/router';
import { DashboardService, DashboardSummary, RemoteServer } from './dashboard.service';

@Component({
    selector: 'app-dashboard',
    standalone: true,
    imports: [CommonModule, MatButtonModule, MatCardModule, MatIconModule, MatTableModule, RouterModule],
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss'],
    encapsulation: ViewEncapsulation.None,
})
export class DashboardComponent implements OnInit {
    summary: DashboardSummary | null = null;
    loading = false;

    constructor(private readonly dashboard: DashboardService) {}

    ngOnInit(): void {
        this.loadSummary();
    }

    loadSummary(): void {
        this.loading = true;
        this.dashboard
            .loadSummary()
            .subscribe({
                next: (result) => (this.summary = result),
                error: (error) => console.error(error),
            })
            .add(() => (this.loading = false));
    }

    get recentContacts(): Record<string, unknown>[] {
        return this.summary?.recentContacts || [];
    }

    get recentCases(): Record<string, unknown>[] {
        return this.summary?.recentCases || [];
    }

    get remoteServers(): RemoteServer[] {
        return this.summary?.remoteServers || [];
    }
}

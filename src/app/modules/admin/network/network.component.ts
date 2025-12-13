import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
    NetworkHost,
    NetworkService,
    NetworkServiceInfo,
    NetworkScanResult,
} from 'app/core/network/network.service';

@Component({
    selector: 'network-scan',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatButtonModule,
        MatCardModule,
        MatFormFieldModule,
        MatInputModule,
        MatProgressBarModule,
        MatTableModule,
        MatChipsModule,
        MatIconModule,
        MatDividerModule,
        MatTooltipModule,
    ],
    templateUrl: './network.component.html',
    styleUrls: ['./network.component.scss'],
    encapsulation: ViewEncapsulation.None,
})
export class NetworkComponent implements OnInit {
    scanResult: NetworkScanResult | null = null;
    knownHosts: NetworkHost[] = [];
    loading = false;
    saving = false;
    portScan: Record<number, boolean> = {};

    form = this.fb.group({ subnet: [''] });
    addForm = this.fb.group({
        ip: ['', Validators.required],
        hostname: [''],
        label: [''],
        note: [''],
        tags: [''],
    });
    serviceForm = this.fb.group({
        hostId: [null as number | null, Validators.required],
        port: [3389, Validators.required],
        service: [''],
        url: [''],
        note: [''],
    });

    constructor(private readonly fb: FormBuilder, private readonly network: NetworkService) {}

    ngOnInit(): void {
        this.loadHosts();
    }

    loadHosts(): void {
        this.network.listServers().subscribe((hosts) => {
            this.knownHosts = hosts;
            if (!this.serviceForm.value.hostId && hosts.length > 0) {
                this.serviceForm.patchValue({ hostId: hosts[0].id });
            }
        });
    }

    scan(): void {
        this.loading = true;
        this.scanResult = null;
        const subnet = this.form.value.subnet?.trim() || undefined;
        this.network
            .scan(subnet)
            .subscribe({
                next: (result) => {
                    this.scanResult = result;
                },
                error: (error) => {
                    console.error(error);
                },
            })
            .add(() => (this.loading = false));
    }

    addHost(): void {
        if (this.addForm.invalid) return;
        this.saving = true;
        const tags = (this.addForm.value.tags || '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
        this.network
            .addServer({ ...this.addForm.value, tags })
            .subscribe({
                next: () => {
                    this.addForm.reset({ ip: '' });
                    this.loadHosts();
                },
                error: (error) => console.error(error),
            })
            .add(() => (this.saving = false));
    }

    importScanned(): void {
        if (!this.scanResult?.hosts?.length) return;
        this.saving = true;
        this.network
            .importServers(this.scanResult.hosts)
            .subscribe({
                next: () => this.loadHosts(),
                error: (error) => console.error(error),
            })
            .add(() => (this.saving = false));
    }

    addService(): void {
        if (this.serviceForm.invalid) return;
        const value = this.serviceForm.value;
        this.saving = true;
        const hostId = value.hostId as number;
        const service: NetworkServiceInfo = {
            port: Number(value.port),
            service: value.service || undefined,
            url: value.url || undefined,
            note: value.note || undefined,
        };
        this.network
            .addService(hostId, service)
            .subscribe({
                next: () => {
                    this.loadHosts();
                    this.serviceForm.patchValue({ note: '', url: '' });
                },
                error: (error) => console.error(error),
            })
            .add(() => (this.saving = false));
    }

    triggerPortScan(host: NetworkHost): void {
        if (!host.id) return;
        this.portScan[host.id] = true;
        this.network
            .scanPorts(host.id)
            .subscribe({
                next: (result) => {
                    this.knownHosts = this.knownHosts.map((existing) =>
                        existing.id === result.host.id ? result.host : existing,
                    );
                },
                error: (error) => console.error(error),
            })
            .add(() => (this.portScan[host.id as number] = false));
    }

    displayHost(host: NetworkHost): string {
        return host.label || host.hostname || host.ip;
    }
}

import { CommonModule } from '@angular/common';
import { Component, ViewEncapsulation } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { NetworkHost, NetworkService } from 'app/core/network/network.service';

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
    ],
    templateUrl: './network.component.html',
    styleUrls: ['./network.component.scss'],
    encapsulation: ViewEncapsulation.None,
})
export class NetworkComponent {
    hosts: NetworkHost[] = [];
    subnet = '';
    loading = false;
    form = this.fb.group({ subnet: [''] });

    constructor(private readonly fb: FormBuilder, private readonly network: NetworkService) {}

    scan(): void {
        this.loading = true;
        this.subnet = '';
        this.hosts = [];
        const subnet = this.form.value.subnet?.trim() || undefined;
        this.network
            .scan(subnet)
            .subscribe({
                next: (result) => {
                    this.subnet = result.subnet;
                    this.hosts = result.hosts;
                },
                error: (error) => {
                    console.error(error);
                },
            })
            .add(() => (this.loading = false));
    }
}

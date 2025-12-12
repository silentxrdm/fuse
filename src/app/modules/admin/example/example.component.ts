import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import {
    ApiField,
    ApiSource,
    ApiView,
    ApiSourcesService,
    AuthType,
    PreviewResponse,
    ViewDataResponse,
} from 'app/core/api-sources/api-sources.service';
import { CreatePagePayload, PageDefinition, PagesService } from 'app/core/pages/pages.service';

@Component({
    selector: 'example',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        MatButtonModule,
        MatCardModule,
        MatCheckboxModule,
        MatDividerModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatListModule,
        MatProgressBarModule,
        MatSelectModule,
    ],
    templateUrl: './example.component.html',
    styleUrls: ['./example.component.scss'],
    encapsulation: ViewEncapsulation.None,
})
export class ExampleComponent implements OnInit {
    sources: ApiSource[] = [];
    views: ApiView[] = [];
    pages: PageDefinition[] = [];
    availableFields: ApiField[] = [];
    selectedFields = new Set<string>();
    previewResult: PreviewResponse | null = null;
    previewError = '';
    viewData: ViewDataResponse | null = null;
    loadingPreview = false;
    loadingViewData = false;
    savingView = false;
    addingSource = false;

    readonly authTypes: { value: AuthType; label: string }[] = [
        { value: 'none', label: 'None' },
        { value: 'apiKeyHeader', label: 'API Key (Header)' },
        { value: 'bearer', label: 'Bearer Token' },
        { value: 'basic', label: 'Basic Auth' },
    ];

    readonly methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

    sourceForm = this.fb.group({
        name: ['', Validators.required],
        baseUrl: ['', Validators.required],
        authType: ['none' as AuthType, Validators.required],
        apiKeyHeader: [''],
        apiKeyValue: [''],
        bearerToken: [''],
        username: [''],
        password: [''],
    });

    previewForm = this.fb.group({
        sourceId: [null as number | null, Validators.required],
        path: ['', Validators.required],
        method: ['GET'],
        payload: [''],
        viewName: [''],
    });

    pageForm = this.fb.group({
        title: ['', Validators.required],
        slug: ['', Validators.required],
        listViewId: [null as number | null, Validators.required],
        editViewId: [null as number | null, Validators.required],
        tableFields: [[] as string[]],
        formFields: [[] as string[]],
        listFields: [[] as string[]],
        editFields: [[] as string[]],
        submitMethod: ['PUT'],
        submitPath: [''],
        editSubmitMethod: ['PUT'],
        editSubmitPath: [''],
    });

    constructor(
        private readonly fb: FormBuilder,
        private readonly api: ApiSourcesService,
        private readonly pagesService: PagesService,
    ) {}

    ngOnInit(): void {
        this.loadSources();
        this.loadViews();
        this.loadPages();
    }

    loadSources(): void {
        this.api.listSources().subscribe((sources) => (this.sources = sources));
    }

    loadViews(): void {
        this.api.listViews().subscribe((views) => (this.views = views));
    }

    loadPages(): void {
        this.pagesService.listPages().subscribe((pages) => (this.pages = pages));
    }

    submitSource(): void {
        if (this.sourceForm.invalid) {
            this.sourceForm.markAllAsTouched();
            return;
        }

        this.addingSource = true;
        const credentials = this.extractCredentials();
        this.api
            .createSource({
                name: this.sourceForm.value.name!,
                baseUrl: this.sourceForm.value.baseUrl!,
                authType: this.sourceForm.value.authType!,
                credentials,
            })
            .subscribe({
                next: (source) => {
                    this.sources = [source, ...this.sources];
                    this.sourceForm.reset({ authType: 'none' });
                },
                error: (error) => {
                    console.error(error);
                },
            })
            .add(() => {
                this.addingSource = false;
            });
    }

    extractCredentials(): Record<string, unknown> | undefined {
        const authType = this.sourceForm.value.authType;
        switch (authType) {
            case 'apiKeyHeader':
                return {
                    header: this.sourceForm.value.apiKeyHeader?.trim(),
                    value: this.sourceForm.value.apiKeyValue,
                };
            case 'bearer':
                return { token: this.sourceForm.value.bearerToken };
            case 'basic':
                return {
                    username: this.sourceForm.value.username,
                    password: this.sourceForm.value.password,
                };
            default:
                return undefined;
        }
    }

    preview(): void {
        this.previewError = '';
        if (this.previewForm.invalid) {
            this.previewForm.markAllAsTouched();
            return;
        }

        const payloadText = this.previewForm.value.payload?.trim();
        let parsedPayload: unknown;

        if (payloadText) {
            try {
                parsedPayload = JSON.parse(payloadText);
            } catch (error) {
                this.previewError = 'Payload must be valid JSON';
                return;
            }
        }

        this.loadingPreview = true;
        this.api
            .previewSource(this.previewForm.value.sourceId!, {
                path: this.previewForm.value.path!,
                method: this.previewForm.value.method || 'GET',
                payload: parsedPayload,
            })
            .subscribe({
                next: (response) => {
                    this.previewResult = response;
                    this.availableFields = response.fields || [];
                    this.selectedFields = new Set(this.availableFields.map((field) => field.name));
                    this.previewError = '';
                },
                error: (error) => {
                    console.error(error);
                    this.previewError = error?.error?.message || 'Unable to preview the endpoint.';
                },
            })
            .add(() => {
                this.loadingPreview = false;
            });
    }

    toggleField(field: string, checked: boolean): void {
        if (checked) {
            this.selectedFields.add(field);
        } else {
            this.selectedFields.delete(field);
        }
    }

    saveView(): void {
        if (!this.previewResult) {
            this.previewError = 'Preview an endpoint before saving a view.';
            return;
        }

        const viewName = this.previewForm.value.viewName?.trim();
        if (this.previewForm.invalid) {
            this.previewForm.markAllAsTouched();
            return;
        }

        if (!viewName) {
            this.previewError = 'Enter a view name before saving a view.';
            this.previewForm.controls.viewName.markAsTouched();
            return;
        }

        this.savingView = true;
        this.api
            .createView({
                sourceId: this.previewForm.value.sourceId!,
                name: viewName,
                path: this.previewForm.value.path!,
                method: this.previewForm.value.method || 'GET',
                fields: Array.from(this.selectedFields),
            })
            .subscribe({
                next: (view) => {
                    this.views = [view, ...this.views];
                },
                error: (error) => {
                    console.error(error);
                    this.previewError = error?.error?.message || 'Unable to save view.';
                },
            })
            .add(() => {
                this.savingView = false;
            });
    }

    loadViewData(view: ApiView): void {
        this.loadingViewData = true;
        this.viewData = null;
        this.api
            .getViewData(view.id)
            .subscribe({
                next: (result) => {
                    this.viewData = result;
                },
                error: (error) => {
                    console.error(error);
                },
            })
            .add(() => {
                this.loadingViewData = false;
            });
    }

    savePage(): void {
        if (this.pageForm.invalid) {
            this.pageForm.markAllAsTouched();
            return;
        }

        const payload: CreatePagePayload = {
            title: this.pageForm.value.title!,
            slug: this.pageForm.value.slug!,
            listViewId: this.pageForm.value.listViewId!,
            editViewId: this.pageForm.value.editViewId!,
            tableFields: this.pageForm.value.tableFields || [],
            formFields: this.pageForm.value.formFields || [],
            listFields: this.pageForm.value.listFields || [],
            editFields: this.pageForm.value.editFields || [],
            submitMethod: this.pageForm.value.submitMethod || 'PUT',
            submitPath: this.pageForm.value.submitPath || '',
            editSubmitMethod: this.pageForm.value.editSubmitMethod || 'PUT',
            editSubmitPath: this.pageForm.value.editSubmitPath || '',
        };

        this.pagesService.createPage(payload).subscribe({
            next: (page) => {
                this.pages = [page, ...this.pages];
                this.pageForm.reset({ submitMethod: 'PUT' });
            },
            error: (error) => console.error(error),
        });
    }

    asRows(data: unknown): Record<string, unknown>[] {
        if (Array.isArray(data)) {
            return data as Record<string, unknown>[];
        }

        if (data && typeof data === 'object') {
            return [data as Record<string, unknown>];
        }

        return [];
    }

    displayColumns(rows: Record<string, unknown>[], fields: ApiField[]): string[] {
        if (fields?.length) {
            return fields.map((field) => field.name);
        }

        if (rows.length > 0) {
            return Object.keys(rows[0]);
        }

        return [];
    }

    pageFieldOptions(viewId: number | null): string[] {
        const view = this.views.find((v) => v.id === viewId);
        if (view?.fields?.length) {
            return view.fields;
        }

        if (this.availableFields?.length) {
            return this.availableFields.map((field) => field.name);
        }

        return [];
    }

    updatePageFields(): void {
        if (!this.pageForm.value.editViewId && this.pageForm.value.listViewId) {
            this.pageForm.patchValue({ editViewId: this.pageForm.value.listViewId });
        }
        const listFields = this.pageFieldOptions(this.pageForm.value.listViewId);
        const editFields = this.pageFieldOptions(this.pageForm.value.editViewId);

        this.pageForm.patchValue({
            tableFields: listFields,
            listFields,
            formFields: editFields,
            editFields,
        });
    }
}

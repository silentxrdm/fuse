import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { ApiSourcesService, ViewDataResponse } from 'app/core/api-sources/api-sources.service';
import { PageDefinition, PagesService } from 'app/core/pages/pages.service';

@Component({
    selector: 'page-view',
    standalone: true,
    templateUrl: './page-view.component.html',
    styleUrls: ['./page-view.component.scss'],
    encapsulation: ViewEncapsulation.None,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatCardModule,
        MatButtonModule,
        MatFormFieldModule,
        MatInputModule,
        MatProgressBarModule,
        MatTableModule,
    ],
})
export class PageViewComponent implements OnInit {
    page: PageDefinition | null = null;
    data: ViewDataResponse | null = null;
    loading = false;
    submitting = false;
    form: FormGroup;
    editMode = false;

    constructor(
        private readonly pages: PagesService,
        private readonly api: ApiSourcesService,
        private readonly route: ActivatedRoute,
        private readonly router: Router,
        private readonly fb: FormBuilder,
    ) {
        this.form = this.fb.group({});
    }

    ngOnInit(): void {
        this.route.url.subscribe(() => {
            this.editMode = this.route.snapshot.routeConfig?.path?.includes('edit') ||
                this.route.snapshot.url.some((segment) => segment.path === 'edit');
        });
        this.route.paramMap.subscribe((params) => {
            const slug = params.get('slug');
            if (slug) {
                this.loadPage(slug);
            }
        });
    }

    loadPage(slug: string): void {
        this.loading = true;
        this.pages
            .getBySlug(slug)
            .subscribe({
                next: (page) => {
                    this.page = page;
                    this.prepareForm();
                    this.loadData();
                    this.applyNavigationState();
                },
                error: (error) => {
                    console.error(error);
                },
            })
            .add(() => (this.loading = false));
    }

    prepareForm(): void {
        if (!this.page) return;
        const controls: Record<string, unknown> = {};
        const fields = this.page.editFields?.length ? this.page.editFields : this.page.formFields;
        fields.forEach((field) => {
            controls[field] = [''];
        });
        this.form = this.fb.group(controls);
    }

    loadData(): void {
        if (!this.page) return;
        const viewId = this.editMode ? this.page.editViewId : this.page.listViewId;
        if (!viewId) return;
        this.loading = true;
        this.api
            .getViewData(viewId)
            .subscribe({
                next: (result) => {
                    this.data = result;
                },
                error: (error) => console.error(error),
            })
            .add(() => (this.loading = false));
    }

    selectRow(row: Record<string, unknown>): void {
        if (!this.page) return;
        const patched: Record<string, unknown> = {};
        const fields = this.page.editFields?.length ? this.page.editFields : this.page.formFields;
        fields.forEach((field) => {
            if (field in row) {
                patched[field] = row[field] ?? '';
            }
        });
        this.form.patchValue(patched);
    }

    submit(): void {
        if (!this.page) return;
        this.submitting = true;
        this.api
            .submitView(this.page.editViewId || this.page.viewId, {
                payload: this.form.value,
                method: this.page.editSubmitMethod || this.page.submitMethod,
                path: this.page.editSubmitPath || this.page.submitPath,
            })
            .subscribe({
                next: () => this.loadData(),
                error: (error) => console.error(error),
            })
            .add(() => (this.submitting = false));
    }

    applyNavigationState(): void {
        if (!this.editMode || !this.page) return;
        const state = this.router.getCurrentNavigation()?.extras?.state as { record?: Record<string, unknown> };
        if (state?.record) {
            this.selectRow(state.record);
        }
    }

    openEdit(row: Record<string, unknown>): void {
        if (!this.page) return;
        this.router.navigate([`/pages/${this.page.slug}/edit`], { state: { record: row } });
    }

    rows(): Record<string, unknown>[] {
        if (!this.data?.data) return [];
        if (Array.isArray(this.data.data)) return this.data.data as Record<string, unknown>[];
        if (typeof this.data.data === 'object') return [this.data.data as Record<string, unknown>];
        return [];
    }

    displayedColumns(): string[] {
        if (this.data?.fields?.length) {
            const fields =
                (this.editMode ? this.page?.editFields : this.page?.listFields)?.length
                    ? this.editMode
                        ? this.page?.editFields!
                        : this.page?.listFields!
                    : this.data.fields.map((f) => f.name);
            return fields;
        }
        const [first] = this.rows();
        return first ? Object.keys(first) : [];
    }

    displayedColumnsWithActions(): string[] {
        const cols = this.displayedColumns();
        if (this.editMode) return cols;
        return [...cols, 'actions'];
    }
}

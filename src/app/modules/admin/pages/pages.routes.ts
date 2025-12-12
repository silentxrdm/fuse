import { Route } from '@angular/router';
import { PageViewComponent } from './page-view.component';

export default [
    {
        path: '',
        children: [
            {
                path: ':slug',
                component: PageViewComponent,
            },
            {
                path: ':slug/edit',
                component: PageViewComponent,
            },
        ],
    },
] satisfies Route[];

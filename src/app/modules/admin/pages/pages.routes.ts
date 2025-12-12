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
        ],
    },
] satisfies Route[];

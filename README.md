# Fuse - Admin template and Starter project for Angular

This project was generated with [Angular CLI](https://github.com/angular/angular-cli)

## Development server

Run `ng serve` for a dev server. Navigate to `http://localhost:4200/`. The application will automatically reload if you change any of the source files.

## Code scaffolding

Run `ng generate component component-name` to generate a new component. You can also use `ng generate directive|pipe|service|class|guard|interface|enum|module`.

## Build

Run `ng build` to build the project. The build artifacts will be stored in the `dist/` directory.

## API bridge server

The `server` folder contains a lightweight Node.js backend that can:

- Store encrypted API source definitions in a local SQLite database (using the built-in `node:sqlite`).
- Proxy and preview external endpoints while applying your chosen authentication method.
- Serve the Angular production build from the `dist/` folder so the UI and backend run together.

### Configuration

1. Copy `.env.example` to `.env` and set a strong `APP_SECRET` to encrypt credentials at rest. You can also override the `PORT`
   if needed (defaults to `4000`).
2. Build the Angular app with `npm run build` so the backend can serve the generated assets from `dist/`.

### Running

```bash
node server/server.js
```

REST endpoints exposed by the backend:

- `GET /api/sources` — list saved API sources without exposing secrets.
- `POST /api/sources` — add a source with `{ name, baseUrl, authType, credentials }` (supports `apiKeyHeader`, `bearer`, and
  `basic` for now).
- `GET /api/sources/:id` — fetch a single source definition.
- `POST /api/sources/:id/preview` — call an endpoint from the saved source with `{ path, method, payload }` and receive a data
  preview plus a derived field list to help build UI widgets.
- `GET /api/views` — list saved view definitions that reference a source and specific endpoint.
- `POST /api/views` — create a view with `{ sourceId, name, path, method, fields }`.
- `GET /api/views/:id/data` — execute a view through the backend and return filtered data for rendering in the Angular app.

If the `dist/` folder is present the backend will also serve the Angular app, enabling a single deployable bundle.

### Frontend data-source page

The default `example` route now surfaces a UI to:

- Add API sources and credential details
- Preview endpoints through the backend bridge and inspect detected fields
- Save previews as reusable views and load their data into a table

### Auth & dynamic pages

- The backend now issues JWTs for sign-up/sign-in and persists users in the local SQLite database (seeded with a default admin).
- The Angular app uses the live backend endpoints (mock API disabled) for auth, navigation, and user profile data.
- You can create pages backed by saved views; they automatically show up in the navigation and render tables at `/pages/:slug` with a dedicated edit screen at `/pages/:slug/edit` for record updates.
- Network utilities are exposed at `GET /api/network/scan` and the `/network` route in the Angular app to probe your local subnet and list responsive hosts with reverse DNS lookups when available.

## Running unit tests

Run `ng test` to execute the unit tests via [Karma](https://karma-runner.github.io).

## Running end-to-end tests

Run `ng e2e` to execute the end-to-end tests via a platform of your choice. To use this command, you need to first add a package that implements end-to-end testing capabilities.

## Further help

To get more help on the Angular CLI use `ng help` or go check out the [Angular CLI Overview and Command Reference](https://angular.io/cli) page.

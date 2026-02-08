---
name: angular-from-design
description: Convert design artifacts (HTML, images, Figma exports, or written specs) into a production-ready Angular app with component architecture, routing, styling, and tests.
argument-hint: "[design source or feature]"
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
metadata:
  short-description: Build Angular apps from design artifacts
---

# Angular From Design

Convert AI-generated designs (HTML, images, Figma exports) into production-ready Angular applications following modern best practices.

## When to use

Use this skill when the task is to turn static UI outputs into an Angular app with
proper structure, routing, components, and styling conventions.

## Inputs supported

- Raw HTML/CSS (e.g., from generators)
- Screenshots/images (vision-derived structure)
- Figma export URLs (component hierarchy)
- Design descriptions (natural language specs)

## Output structure (default)

Generated projects follow this structure:

```
src/
├── app/
│   ├── core/                    # Singleton services, guards, interceptors
│   │   ├── services/
│   │   │   └── api.service.ts   # Base HTTP client
│   │   ├── interceptors/
│   │   └── guards/
│   ├── shared/                  # Reusable dumb components
│   │   ├── components/
│   │   ├── directives/
│   │   └── pipes/
│   ├── features/                # Feature modules (lazy loaded)
│   │   └── [feature-name]/
│   │       ├── components/      # Feature-specific components
│   │       ├── services/        # Feature-specific services
│   │       ├── models/          # Interfaces and types
│   │       └── [feature].routes.ts
│   ├── app.component.ts
│   ├── app.config.ts
│   └── app.routes.ts
├── assets/
├── styles/
│   ├── _variables.css           # CSS custom properties / design tokens
│   └── styles.css               # Global styles + Tailwind imports
└── environments/
```

## Architecture patterns

### Component Classification

**Smart Components (Containers)**
- Located in `features/[name]/` or as route components
- Inject services, manage state
- Handle side effects and API calls
- Pass data down via inputs, receive events via outputs

**Dumb Components (Presentational)**
- Located in `shared/components/` or feature `components/`
- Pure inputs/outputs only
- No injected services (except rarely for UI utilities)
- Fully testable in isolation

### Signal usage guidelines

```typescript
// Prefer signals for component state
export class UserCardComponent {
  // Input signals (Angular 17.1+)
  user = input.required<User>();
  showActions = input(true);
  
  // Computed signals for derived state
  fullName = computed(() => `${this.user().firstName} ${this.user().lastName}`);
  
  // Output for events
  edit = output<User>();
  delete = output<string>();
  
  // Local state as signals
  isExpanded = signal(false);
  
  toggle() {
    this.isExpanded.update(v => !v);
  }
}
```

### Reactive forms note

- For radio inputs bound with `formControlName`, ensure the HTML `name` attribute matches the control name (Angular throws NG01202 otherwise).

### When to use services vs signals

| Use Case | Approach |
|----------|----------|
| Component-local UI state | `signal()` |
| Derived/computed values | `computed()` |
| Cross-component state | Service with signals |
| API data caching | Service with signals + RxJS for HTTP |
| Complex async flows | RxJS in services |

### Tailwind conventions

**Class Organization** (follow this order):
1. Layout (flex, grid, position)
2. Sizing (w-, h-, max-w-)
3. Spacing (p-, m-, gap-)
4. Typography (text-, font-)
5. Colors (bg-, text-, border-)
6. Effects (shadow-, opacity-)
7. States (hover:, focus:, disabled:)

**Component Styling Pattern:**
```typescript
@Component({
  selector: 'app-button',
  standalone: true,
  template: `
    <button 
      [class]="buttonClasses()"
      [disabled]="disabled()"
    >
      <ng-content />
    </button>
  `
})
export class ButtonComponent {
  variant = input<'primary' | 'secondary' | 'ghost'>('primary');
  size = input<'sm' | 'md' | 'lg'>('md');
  disabled = input(false);
  
  buttonClasses = computed(() => {
    const base = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2';
    
    const variants = {
      primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300',
      secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 disabled:bg-gray-50',
      ghost: 'hover:bg-gray-100 disabled:opacity-50'
    };
    
    const sizes = {
      sm: 'h-8 px-3 text-sm',
      md: 'h-10 px-4 text-base',
      lg: 'h-12 px-6 text-lg'
    };
    
    return `${base} ${variants[this.variant()]} ${sizes[this.size()]}`;
  });
}
```

### Spring Boot integration (optional)

**API Service Pattern:**
```typescript
// core/services/api.service.ts
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = inject(API_BASE_URL);
  
  get<T>(endpoint: string, params?: HttpParams): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}${endpoint}`, { params });
  }
  
  post<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${endpoint}`, body);
  }
  
  // ... put, patch, delete
}

// features/users/services/user.service.ts
@Injectable({ providedIn: 'root' })
export class UserService {
  private api = inject(ApiService);
  
  // Cached state as signals
  private usersCache = signal<User[]>([]);
  private loading = signal(false);
  private error = signal<string | null>(null);
  
  // Public readonly signals
  users = this.usersCache.asReadonly();
  isLoading = this.loading.asReadonly();
  
  loadUsers(): void {
    this.loading.set(true);
    this.api.get<User[]>('/api/users').pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: users => this.usersCache.set(users),
      error: err => this.error.set(err.message)
    });
  }
}
```

**DTO Alignment:**
Keep Angular interfaces aligned with Spring Boot DTOs. Consider OpenAPI codegen for large projects:
```bash
npx @openapitools/openapi-generator-cli generate \
  -i http://localhost:8080/v3/api-docs \
  -g typescript-angular \
  -o src/app/core/api
```

## Conversion Process

### Step 1: Analyze Design Input

When given HTML/image input:
1. Identify the page/screen purpose
2. Map visual hierarchy to component tree
3. Identify repeating patterns → shared components
4. Note interactive elements → determine state needs
5. Identify data requirements → model interfaces

### Step 2: Define Component Hierarchy

Create a component tree before generating code:
```
PageComponent (smart)
├── HeaderComponent (dumb)
│   ├── LogoComponent (dumb)
│   └── NavComponent (dumb)
├── HeroSectionComponent (dumb)
├── FeatureListComponent (smart - if needs data)
│   └── FeatureCardComponent (dumb, repeated)
└── FooterComponent (dumb)
```

### Step 3: Generate Scaffolding

For each component, generate:
1. Component file with proper signals/inputs/outputs
2. Spec file with basic test structure
3. Add to appropriate barrel export (index.ts)
4. Add route if it's a page component

### Step 4: Extract Styles to Tailwind

Convert inline/CSS styles:
1. Map CSS properties to Tailwind utilities
2. Extract repeated patterns to @apply classes if needed
3. Define design tokens as CSS variables
4. Ensure responsive breakpoints are handled

### Step 5: Wire Up Data Flow

1. Create model interfaces matching expected data shape
2. Create services for API integration
3. Connect smart components to services
4. Pass data through component tree via inputs

## File Templates

### Component Template
See: `templates/component.ts.tmpl`

### Service Template  
See: `templates/service.ts.tmpl`

### Route Configuration Template
See: `templates/routes.ts.tmpl`

## Usage Examples

### Example 1: Convert Stitch HTML Output

```
Input: Raw HTML from Google Stitch for a landing page
Output: 
- src/app/features/landing/
- src/app/shared/components/button/
- src/app/shared/components/card/
- Tailwind config with extracted design tokens
```

### Example 2: Screenshot to Dashboard

```
Input: Screenshot of admin dashboard design
Output:
- src/app/features/dashboard/
- src/app/features/dashboard/components/stats-card/
- src/app/features/dashboard/components/data-table/
- src/app/features/dashboard/services/dashboard.service.ts
```

## Quality Checklist

Before considering conversion complete:

- [ ] All components are standalone
- [ ] Smart/dumb separation is clear
- [ ] Signals used appropriately (not over-engineered)
- [ ] Tailwind classes follow ordering convention
- [ ] No inline styles (all converted to Tailwind)
- [ ] Routes are lazy-loaded
- [ ] Models/interfaces defined for all data shapes
- [ ] Services follow the API integration pattern
- [ ] Basic test files generated
- [ ] Barrel exports (index.ts) in place
- [ ] Environment configuration set up

## Playwright Template (optional)

```ts
// playwright.config.ts
const headed = process.env.PW_HEADED === '1';

export default defineConfig({
  use: {
    headless: !headed,
    launchOptions: headed ? { slowMo: 100 } : undefined,
  },
  timeout: headed ? 60000 : 30000,
});
```

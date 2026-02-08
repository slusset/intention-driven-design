# API Integration Pattern

This pattern describes how to integrate Angular frontends with Spring Boot backends, ensuring type safety and clean separation of concerns.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Angular Frontend                         │
├─────────────────────────────────────────────────────────────┤
│  Components ──► Feature Services ──► ApiService ──► HTTP    │
│       ▲              │                    │                  │
│       │              ▼                    ▼                  │
│    Signals      Models/DTOs         Interceptors            │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Spring Boot Backend                        │
├─────────────────────────────────────────────────────────────┤
│  Controllers ──► Services ──► Repositories ──► Database     │
│       │                                                      │
│       ▼                                                      │
│     DTOs                                                     │
└─────────────────────────────────────────────────────────────┘
```

## Base API Service

```typescript
// core/services/api.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  get<T>(
    endpoint: string, 
    params?: Record<string, string | number | boolean>
  ): Observable<T> {
    const httpParams = this.buildParams(params);
    return this.http.get<T>(`${this.baseUrl}${endpoint}`, { params: httpParams });
  }

  post<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${endpoint}`, body);
  }

  put<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}${endpoint}`, body);
  }

  patch<T>(endpoint: string, body: unknown): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}${endpoint}`, body);
  }

  delete<T>(endpoint: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${endpoint}`);
  }

  private buildParams(
    params?: Record<string, string | number | boolean>
  ): HttpParams {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          httpParams = httpParams.set(key, String(value));
        }
      });
    }
    return httpParams;
  }
}
```

## HTTP Interceptors

### Auth Interceptor
```typescript
// core/interceptors/auth.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  if (token && !req.url.includes('/auth/')) {
    const cloned = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    return next(cloned);
  }

  return next(req);
};
```

### Error Interceptor
```typescript
// core/interceptors/error.interceptor.ts
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const toast = inject(ToastService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      switch (error.status) {
        case 401:
          router.navigate(['/auth/login']);
          break;
        case 403:
          toast.error('You do not have permission to perform this action');
          break;
        case 404:
          toast.error('Resource not found');
          break;
        case 422:
          // Validation errors - let the calling code handle
          break;
        case 500:
          toast.error('An unexpected error occurred. Please try again.');
          break;
        default:
          toast.error(error.error?.message || 'Something went wrong');
      }
      return throwError(() => error);
    })
  );
};
```

### Register Interceptors
```typescript
// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(
      withInterceptors([authInterceptor, errorInterceptor])
    ),
    // ... other providers
  ]
};
```

## Model/DTO Alignment

### Spring Boot DTO
```java
// UserDTO.java
public record UserDTO(
    String id,
    String email,
    String firstName,
    String lastName,
    String role,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {}
```

### Angular Model
```typescript
// models/user.model.ts
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  createdAt: string;  // ISO date string
  updatedAt: string;
}

export type UserRole = 'admin' | 'manager' | 'member' | 'guest';

// For create/update operations (omit server-generated fields)
export type CreateUserDto = Omit<User, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateUserDto = Partial<CreateUserDto>;
```

## OpenAPI Code Generation

For larger projects, generate TypeScript interfaces from Spring Boot's OpenAPI spec:

### Spring Boot Setup
```java
// Add to pom.xml
<dependency>
    <groupId>org.springdoc</groupId>
    <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
    <version>2.3.0</version>
</dependency>
```

### Generate Angular Types
```bash
# Install generator
npm install -D @openapitools/openapi-generator-cli

# Add to package.json scripts
{
  "scripts": {
    "api:generate": "openapi-generator-cli generate -i http://localhost:8080/v3/api-docs -g typescript-angular -o src/app/core/api-generated --additional-properties=ngVersion=17"
  }
}

# Run (with backend running)
npm run api:generate
```

## Feature Service Pattern

```typescript
// features/users/services/user.service.ts
import { Injectable, inject, signal, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ApiService } from '@core/services/api.service';
import { User, CreateUserDto, UpdateUserDto } from '../models/user.model';
import { Observable, Subject, switchMap, startWith, shareReplay } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class UserService {
  private api = inject(ApiService);
  
  // Refresh trigger
  private refresh$ = new Subject<void>();
  
  // API data as observable (auto-refreshes)
  private users$ = this.refresh$.pipe(
    startWith(undefined),
    switchMap(() => this.api.get<User[]>('/api/users')),
    shareReplay(1)
  );
  
  // Convert to signal for template usage
  users = toSignal(this.users$, { initialValue: [] });
  
  // Local UI state
  private _selectedId = signal<string | null>(null);
  private _loading = signal(false);
  
  readonly selectedId = this._selectedId.asReadonly();
  readonly loading = this._loading.asReadonly();
  
  // Computed
  selectedUser = computed(() => {
    const id = this._selectedId();
    return id ? this.users().find(u => u.id === id) : null;
  });
  
  // Actions
  select(id: string | null): void {
    this._selectedId.set(id);
  }
  
  refresh(): void {
    this.refresh$.next();
  }
  
  create(dto: CreateUserDto): Observable<User> {
    return this.api.post<User>('/api/users', dto);
  }
  
  update(id: string, dto: UpdateUserDto): Observable<User> {
    return this.api.patch<User>(`/api/users/${id}`, dto);
  }
  
  delete(id: string): Observable<void> {
    return this.api.delete<void>(`/api/users/${id}`);
  }
}
```

## Pagination Pattern

### Spring Boot PageResponse
```java
public record PageResponse<T>(
    List<T> content,
    int page,
    int size,
    long totalElements,
    int totalPages,
    boolean first,
    boolean last
) {}
```

### Angular Pagination
```typescript
// models/pagination.model.ts
export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export interface PageRequest {
  page: number;
  size: number;
  sort?: string;
}

// In service
loadPage(request: PageRequest): Observable<PageResponse<User>> {
  return this.api.get<PageResponse<User>>('/api/users', {
    page: request.page,
    size: request.size,
    ...(request.sort && { sort: request.sort })
  });
}
```

## Environment Configuration

```typescript
// environments/environment.ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8080'
};

// environments/environment.prod.ts
export const environment = {
  production: true,
  apiUrl: '/api'  // Relative URL when served together or via proxy
};
```

## CORS Configuration (Spring Boot)

```java
@Configuration
public class CorsConfig {
    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/api/**")
                    .allowedOrigins("http://localhost:4200")
                    .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE")
                    .allowedHeaders("*")
                    .allowCredentials(true);
            }
        };
    }
}
```

## Proxy Configuration (Development)

```json
// proxy.conf.json
{
  "/api": {
    "target": "http://localhost:8080",
    "secure": false,
    "changeOrigin": true
  }
}
```

```json
// angular.json (under architect.serve.options)
{
  "proxyConfig": "proxy.conf.json"
}
```

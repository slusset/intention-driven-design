# Smart Component Pattern

Smart components (also called container components) are responsible for:
- Fetching and managing data
- Coordinating between services and child components
- Handling side effects
- Managing feature-level state

## Characteristics

1. **Injects services** - Has dependencies on data/API services
2. **Manages state** - Owns the data that child components display
3. **Handles events** - Responds to outputs from child components
4. **Minimal template logic** - Delegates display concerns to dumb components

## Example: User List Page

```typescript
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UserService } from '../../services/user.service';
import { UserCardComponent } from '../user-card/user-card.component';
import { LoadingSpinnerComponent } from '@shared/components/loading-spinner';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-user-list-page',
  standalone: true,
  imports: [CommonModule, UserCardComponent, LoadingSpinnerComponent],
  template: `
    <div class="container mx-auto px-4 py-8">
      <header class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900">Users</h1>
        <p class="mt-2 text-gray-600">Manage your team members</p>
      </header>

      @if (userService.loading()) {
        <app-loading-spinner />
      } @else if (userService.error()) {
        <div class="rounded-md bg-red-50 p-4">
          <p class="text-red-800">{{ userService.error() }}</p>
          <button 
            (click)="loadUsers()"
            class="mt-2 text-red-600 underline"
          >
            Try again
          </button>
        </div>
      } @else {
        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          @for (user of userService.users(); track user.id) {
            <app-user-card 
              [user]="user"
              (edit)="onEditUser($event)"
              (delete)="onDeleteUser($event)"
            />
          } @empty {
            <p class="col-span-full text-center text-gray-500">
              No users found
            </p>
          }
        </div>
      }
    </div>
  `
})
export class UserListPageComponent implements OnInit {
  protected userService = inject(UserService);
  
  ngOnInit(): void {
    this.loadUsers();
  }
  
  loadUsers(): void {
    this.userService.loadAll();
  }
  
  onEditUser(user: User): void {
    // Navigate to edit page or open modal
    console.log('Edit user:', user);
  }
  
  onDeleteUser(userId: string): void {
    if (confirm('Are you sure you want to delete this user?')) {
      this.userService.delete(userId).subscribe({
        next: () => this.userService.removeItem(userId),
        error: (err) => console.error('Delete failed:', err)
      });
    }
  }
}
```

## When to Use

Use a smart component when:
- The component is a route/page entry point
- It needs to fetch data from an API
- It coordinates multiple child components
- It handles complex user interactions with side effects

## Testing Strategy

Smart components are tested with:
- Service mocks/spies
- Integration tests that verify data flow
- Router testing utilities for navigation

```typescript
describe('UserListPageComponent', () => {
  let component: UserListPageComponent;
  let userServiceSpy: jasmine.SpyObj<UserService>;
  
  beforeEach(() => {
    userServiceSpy = jasmine.createSpyObj('UserService', ['loadAll', 'delete'], {
      users: signal([]),
      loading: signal(false),
      error: signal(null)
    });
    
    TestBed.configureTestingModule({
      imports: [UserListPageComponent],
      providers: [
        { provide: UserService, useValue: userServiceSpy }
      ]
    });
    
    component = TestBed.createComponent(UserListPageComponent).componentInstance;
  });
  
  it('should load users on init', () => {
    component.ngOnInit();
    expect(userServiceSpy.loadAll).toHaveBeenCalled();
  });
});
```

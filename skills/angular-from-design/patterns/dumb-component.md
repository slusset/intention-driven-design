# Dumb Component Pattern

Dumb components (also called presentational components) are responsible for:
- Displaying data passed via inputs
- Emitting events via outputs
- Encapsulating visual/UI logic only
- Being highly reusable

## Characteristics

1. **No injected services** - Receives all data through inputs
2. **Pure rendering** - Same inputs always produce same output
3. **Event emission only** - Never handles side effects directly
4. **Self-contained styles** - All styling is internal (Tailwind classes)

## Example: User Card

```typescript
import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-user-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article 
      class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm 
             transition-shadow hover:shadow-md"
    >
      <div class="flex items-start gap-4">
        <img 
          [src]="user().avatarUrl || defaultAvatar"
          [alt]="fullName()"
          class="h-12 w-12 rounded-full object-cover"
        />
        
        <div class="flex-1 min-w-0">
          <h3 class="truncate text-lg font-semibold text-gray-900">
            {{ fullName() }}
          </h3>
          <p class="text-sm text-gray-500">{{ user().email }}</p>
          
          @if (user().role) {
            <span class="mt-2 inline-block rounded-full px-2 py-1 text-xs"
                  [class]="roleClasses()">
              {{ user().role }}
            </span>
          }
        </div>
      </div>
      
      @if (showActions()) {
        <div class="mt-4 flex justify-end gap-2 border-t border-gray-100 pt-4">
          <button 
            type="button"
            (click)="edit.emit(user())"
            class="rounded-md px-3 py-1.5 text-sm font-medium text-blue-600 
                   hover:bg-blue-50 focus:outline-none focus:ring-2 
                   focus:ring-blue-500 focus:ring-offset-2"
          >
            Edit
          </button>
          <button 
            type="button"
            (click)="delete.emit(user().id)"
            class="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 
                   hover:bg-red-50 focus:outline-none focus:ring-2 
                   focus:ring-red-500 focus:ring-offset-2"
          >
            Delete
          </button>
        </div>
      }
    </article>
  `
})
export class UserCardComponent {
  // === Inputs ===
  user = input.required<User>();
  showActions = input(true);
  
  // === Outputs ===
  edit = output<User>();
  delete = output<string>();
  
  // === Constants ===
  protected readonly defaultAvatar = '/assets/default-avatar.png';
  
  // === Computed ===
  fullName = computed(() => {
    const u = this.user();
    return `${u.firstName} ${u.lastName}`.trim() || u.email;
  });
  
  roleClasses = computed(() => {
    const roleStyles: Record<string, string> = {
      admin: 'bg-purple-100 text-purple-800',
      manager: 'bg-blue-100 text-blue-800',
      member: 'bg-gray-100 text-gray-800',
      guest: 'bg-yellow-100 text-yellow-800'
    };
    return roleStyles[this.user().role?.toLowerCase() ?? 'member'] ?? roleStyles['member'];
  });
}
```

## When to Use

Use a dumb component when:
- Building reusable UI elements (buttons, cards, modals)
- Creating feature-specific display components
- The component only needs to render data and emit events
- You want maximum testability and reusability

## Design Guidelines

### Input Design
- Use `input.required<T>()` for mandatory data
- Use `input(defaultValue)` for optional configuration
- Keep inputs focused - don't pass entire objects if only one property is needed

### Output Design
- Emit domain events, not UI events (`userSelected` not `cardClicked`)
- Include necessary data in the event payload
- Let parent decide what to do with the event

### Styling
- All styles via Tailwind classes in template
- Use computed signals for dynamic class combinations
- Extract common patterns to shared components, not utility CSS

## Testing Strategy

Dumb components are tested with:
- Input/output verification
- Snapshot testing for visual regression
- No mocking required (pure functions of inputs)

```typescript
describe('UserCardComponent', () => {
  let component: UserCardComponent;
  let fixture: ComponentFixture<UserCardComponent>;
  
  const mockUser: User = {
    id: '1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    role: 'admin'
  };
  
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [UserCardComponent]
    });
    
    fixture = TestBed.createComponent(UserCardComponent);
    component = fixture.componentInstance;
    
    // Set required input
    fixture.componentRef.setInput('user', mockUser);
    fixture.detectChanges();
  });
  
  it('should display user full name', () => {
    expect(component.fullName()).toBe('John Doe');
  });
  
  it('should emit edit event with user', () => {
    const editSpy = jasmine.createSpy('editSpy');
    component.edit.subscribe(editSpy);
    
    const editButton = fixture.nativeElement.querySelector('button');
    editButton.click();
    
    expect(editSpy).toHaveBeenCalledWith(mockUser);
  });
  
  it('should hide actions when showActions is false', () => {
    fixture.componentRef.setInput('showActions', false);
    fixture.detectChanges();
    
    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });
});
```

## Comparison: Smart vs Dumb

| Aspect | Smart Component | Dumb Component |
|--------|-----------------|----------------|
| Services | Yes, injected | No |
| State | Manages its own | Derived from inputs |
| Side effects | Handles them | Emits events only |
| Reusability | Low (feature-specific) | High (generic) |
| Testing | Needs mocks | Pure input/output |
| Location | `features/[name]/` | `shared/` or feature `components/` |

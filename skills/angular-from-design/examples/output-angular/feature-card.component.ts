import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface Feature {
  icon?: string;
  title: string;
  description: string;
}

@Component({
  selector: 'app-feature-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article 
      class="rounded-xl bg-white p-8 shadow-md transition-shadow hover:shadow-lg"
    >
      <div 
        class="mb-4 flex h-12 w-12 items-center justify-center 
               rounded-xl bg-indigo-50"
      >
        @if (feature().icon) {
          <img 
            [src]="feature().icon" 
            [alt]="feature().title"
            class="h-6 w-6"
          />
        } @else {
          <svg 
            class="h-6 w-6 text-indigo-500" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              stroke-linecap="round" 
              stroke-linejoin="round" 
              stroke-width="2" 
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        }
      </div>
      
      <h3 class="mb-2 text-xl font-semibold text-gray-900">
        {{ feature().title }}
      </h3>
      
      <p class="leading-relaxed text-gray-600">
        {{ feature().description }}
      </p>
    </article>
  `
})
export class FeatureCardComponent {
  feature = input.required<Feature>();
}

import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-hero-section',
  standalone: true,
  template: `
    <section 
      class="bg-gradient-to-br from-indigo-500 to-purple-600 
             px-5 py-20 text-center text-white"
    >
      <h1 class="mb-4 text-5xl font-bold">
        {{ title() }}
      </h1>
      
      <p class="mb-8 text-xl opacity-90">
        {{ subtitle() }}
      </p>
      
      <button 
        type="button"
        (click)="ctaClick.emit()"
        class="rounded-lg bg-white px-8 py-4 font-semibold text-indigo-500 
               transition-transform hover:scale-105 focus:outline-none 
               focus:ring-2 focus:ring-white focus:ring-offset-2 
               focus:ring-offset-indigo-500"
      >
        {{ ctaText() }}
      </button>
    </section>
  `
})
export class HeroSectionComponent {
  // Content inputs
  title = input('Build Faster with AI');
  subtitle = input('Transform your designs into production-ready code in minutes');
  ctaText = input('Get Started Free');
  
  // Events
  ctaClick = output<void>();
}

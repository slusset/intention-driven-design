import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { HeroSectionComponent } from '@shared/components/hero-section';
import { FeatureCardComponent, Feature } from '@shared/components/feature-card';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [HeroSectionComponent, FeatureCardComponent],
  template: `
    <main>
      <app-hero-section
        title="Build Faster with AI"
        subtitle="Transform your designs into production-ready code in minutes"
        ctaText="Get Started Free"
        (ctaClick)="onGetStarted()"
      />
      
      <section class="mx-auto max-w-7xl px-5 py-20">
        <div class="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          @for (feature of features; track feature.title) {
            <app-feature-card [feature]="feature" />
          }
        </div>
      </section>
    </main>
  `
})
export class LandingPageComponent {
  features: Feature[] = [
    {
      title: 'Lightning Fast',
      description: 'Convert designs to code in seconds, not hours. Our AI understands your intent.'
    },
    {
      title: 'Production Ready',
      description: 'Generated code follows best practices and is ready for your codebase.'
    },
    {
      title: 'Framework Agnostic',
      description: 'Export to React, Angular, Vue, or vanilla HTML/CSS. Your choice.'
    }
  ];
  
  constructor(private router: Router) {}
  
  onGetStarted(): void {
    this.router.navigate(['/signup']);
  }
}

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

describe('web index SEO metadata', () => {
  it('defines the production document title', () => {
    expect(html).toContain('<title>Event Radar — AI-Powered Stock Market Event Intelligence</title>');
  });

  it('defines the production description meta tag', () => {
    expect(html).toContain('content="Real-time market event detection from 13 sources. AI-classified severity. Historical outcome tracking. $39/month."');
  });

  it('defines open graph metadata for social sharing', () => {
    expect(html).toContain('property="og:title" content="Event Radar — Know What Moves Markets"');
    expect(html).toMatch(/property="og:description"\s+content="AI-powered stock market event intelligence\. 13 real-time sources, outcome tracking, earnings calendar\."/);
    expect(html).toContain('property="og:type" content="website"');
    expect(html).toContain('property="og:url" content="https://eventradar.app"');
  });

  it('defines twitter card metadata', () => {
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('name="twitter:title" content="Event Radar"');
    expect(html).toMatch(/name="twitter:description"\s+content="AI-powered stock market event intelligence"/);
  });
});

export function Privacy() {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="text-2xl font-bold text-text-primary">Privacy Policy</h1>

      <section className="mt-6 space-y-4 text-sm leading-relaxed text-text-secondary">
        <p>
          Event Radar respects your privacy. This policy explains what data we collect and how
          we use it.
        </p>

        <h2 className="text-lg font-semibold text-text-primary">Data We Collect</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>No personally identifiable information (PII) is collected.</li>
          <li>We use cookies solely for storing user preferences (theme, notification settings).</li>
          <li>All market data is sourced from publicly available sources.</li>
        </ul>

        <h2 className="text-lg font-semibold text-text-primary">Third-Party Services</h2>
        <p>
          We do not sell or share your data with third parties. Analytics, if any, are
          aggregated and anonymous.
        </p>

        <h2 className="text-lg font-semibold text-text-primary">Contact</h2>
        <p>
          If you have questions about this policy, please reach out via our GitHub repository.
        </p>
      </section>
    </div>
  );
}

import { TESTIMONIALS } from '../config/products';

/**
 * Social proof — renders only genuinely sourced, permission-granted feedback
 * from src/config/products.ts (TESTIMONIALS). With an empty array the section
 * renders nothing, so the site never shows fabricated endorsements. When real
 * beta feedback or creator reviews exist, add them to the config array and
 * this section appears automatically.
 */
const TestimonialSection = () => {
  if (TESTIMONIALS.length === 0) return null;

  return (
    <section className="mt-16">
      <h2 className="font-['Space_Grotesk'] font-semibold text-[28px] text-white mb-6">
        What users say
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TESTIMONIALS.map((t, i) => (
          <figure
            key={i}
            className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] p-6"
          >
            <blockquote className="font-['Inter'] text-[15px] text-[#CBD5E1] leading-[1.7]">
              “{t.quote}”
            </blockquote>
            <figcaption className="mt-4">
              <p className="font-['Inter'] font-medium text-[14px] text-white">{t.name}</p>
              {(t.role || t.org) && (
                <p className="font-['Inter'] text-[13px] text-[#64748B]">
                  {[t.role, t.org].filter(Boolean).join(' · ')}
                </p>
              )}
              {t.source && (
                <a
                  href={t.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block font-['Inter'] text-[12px] text-[#00D4FF] hover:underline"
                >
                  View source
                </a>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
};

export default TestimonialSection;

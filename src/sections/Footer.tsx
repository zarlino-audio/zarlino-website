/**
 * Static footer — no JS, no GSAP. Only real, working links are shown
 * (dead "#" placeholders were removed).
 */
const footerColumns = [
  {
    title: 'Products',
    links: [
      { label: 'ZTame', href: '/plugins/ztame' },
      { label: 'ZScorch', href: '/plugins/zscorch' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'ZTame Documentation', href: '/plugins/ztame' },
      { label: 'ZScorch FAQ', href: '/plugins/zscorch#faq' },
      { label: 'Report a Bug or Suggestion', href: '/report' },
      { label: 'Affiliate Program', href: '/affiliates' },
    ],
  },
];

const Footer = () => {
  return (
    <footer className="relative z-[1] bg-[#050505] border-t border-[rgba(255,255,255,0.06)] pt-16 pb-8 px-6 md:px-10">
      <div className="max-w-[1200px] mx-auto">
        {/* Top Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-2">
            <img
              src="/images/zarlino-logo.svg"
              alt="Zarlino Audio"
              className="h-7 w-auto mb-1"
              width={140}
              height={28}
            />
            <p className="mt-3 font-['Inter'] text-[14px] text-[#64748B] leading-[1.6] max-w-[280px]">
              Zarlino Audio makes Windows VST3 plugins for mixing and mastering
              engineers.
            </p>
          </div>

          {/* Link Columns */}
          {footerColumns.map((col) => (
            <div key={col.title}>
              <h4 className="font-['Inter'] font-semibold text-[14px] text-white mb-4">
                {col.title}
              </h4>
              <ul className="flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="font-['Inter'] text-[14px] text-[#64748B] hover:text-white transition-colors duration-300"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Row */}
        <div className="mt-12 pt-6 border-t border-[rgba(255,255,255,0.06)] flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-['Inter'] text-[13px] text-[#475569]">
            © 2026 Zarlino Audio. All rights reserved.
          </p>
          <p className="font-['Inter'] text-[13px] text-[#475569]">
            Support:{' '}
            <a
              href="mailto:support@zarlinoaudio.com"
              className="text-[#64748B] hover:text-white transition-colors"
            >
              support@zarlinoaudio.com
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

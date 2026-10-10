/**
 * Vee Properties — site content & configuration.
 *
 * ⚠️  PLACEHOLDERS TO REPLACE BEFORE GOING LIVE:
 *   - CONTACT details below (WhatsApp number, phone, email) are placeholders.
 *   - LISTINGS mirror the sample Accra portfolio used in the realestate-os
 *     demo seed. Swap in real inventory (or point this at the OS API later).
 *   - Imagery in /public/images/vee is placeholder stock photography.
 */

export const CONTACT = {
  /** wa.me format: country code + number, digits only, no "+". TODO: real number. */
  whatsappIntl: '233200000000',
  phoneDisplay: '+233 20 000 0000',
  email: 'hello@veeproperties.com',
  city: 'Accra, Ghana',
  hours: 'Daily · 08:00–20:00 GMT',
  promise: 'Every enquiry gets a human reply within 15 minutes, 08:00–20:00 GMT.',
};

export type Listing = {
  code: string;
  title: string;
  kind: string;
  area: string;
  areaKey: string;
  intent: 'sale' | 'rent';
  price: number;
  priceLabel: string;
  beds: number;
  baths: number;
  sqm: number;
  tags: string[];
  img: string;
  status: 'Available' | 'Reserved' | 'New';
};

export const LISTINGS: Listing[] = [
  {
    code: 'EL-1001',
    title: '4-Bedroom House',
    kind: 'House',
    area: 'East Legon',
    areaKey: 'east-legon',
    intent: 'sale',
    price: 320000,
    priceLabel: '$320,000',
    beds: 4,
    baths: 4,
    sqm: 420,
    tags: ['Pool', 'Gated security', 'Backup power', 'Garden'],
    img: '/images/vee/listing-el1001.jpg',
    status: 'Available',
  },
  {
    code: 'CN-3001',
    title: '3-Bedroom Townhouse',
    kind: 'Townhouse',
    area: 'Cantonments',
    areaKey: 'cantonments',
    intent: 'sale',
    price: 410000,
    priceLabel: '$410,000',
    beds: 3,
    baths: 3,
    sqm: 260,
    tags: ['Gated security', 'Garden', 'Staff quarters'],
    img: '/images/vee/listing-cn3001.jpg',
    status: 'Available',
  },
  {
    code: 'AP-2001',
    title: '2-Bedroom Apartment',
    kind: 'Apartment',
    area: 'Airport Residential',
    areaKey: 'airport',
    intent: 'sale',
    price: 230000,
    priceLabel: '$230,000',
    beds: 2,
    baths: 2,
    sqm: 120,
    tags: ['Pool', 'Gym', 'Backup power', 'Concierge'],
    img: '/images/vee/listing-ap2001.jpg',
    status: 'New',
  },
  {
    code: 'EL-1002',
    title: '3-Bedroom Apartment',
    kind: 'Apartment',
    area: 'East Legon',
    areaKey: 'east-legon',
    intent: 'sale',
    price: 185000,
    priceLabel: '$185,000',
    beds: 3,
    baths: 3,
    sqm: 160,
    tags: ['Gym', 'Gated security', 'Parking'],
    img: '/images/vee/listing-el1002.jpg',
    status: 'Available',
  },
  {
    code: 'AD-6001',
    title: '4-Bedroom House',
    kind: 'House',
    area: 'Adenta',
    areaKey: 'tema-adenta',
    intent: 'sale',
    price: 150000,
    priceLabel: '$150,000',
    beds: 4,
    baths: 3,
    sqm: 300,
    tags: ['Garden', 'Parking', 'Gated security'],
    img: '/images/vee/listing-ad6001.jpg',
    status: 'Available',
  },
  {
    code: 'OS-4001',
    title: '1-Bedroom Apartment',
    kind: 'Apartment',
    area: 'Osu',
    areaKey: 'labone-osu',
    intent: 'sale',
    price: 95000,
    priceLabel: '$95,000',
    beds: 1,
    baths: 1,
    sqm: 65,
    tags: ['Backup power', 'Gated security'],
    img: '/images/vee/listing-os4001.jpg',
    status: 'Available',
  },
  {
    code: 'RA-8001',
    title: '2-Bedroom Apartment · Furnished',
    kind: 'Apartment',
    area: 'Airport Residential',
    areaKey: 'airport',
    intent: 'rent',
    price: 1500,
    priceLabel: '$1,500/mo',
    beds: 2,
    baths: 2,
    sqm: 130,
    tags: ['Furnished', 'Gym', 'Backup power'],
    img: '/images/vee/listing-ra8001.jpg',
    status: 'Available',
  },
  {
    code: 'RO-8002',
    title: '1-Bedroom Apartment',
    kind: 'Apartment',
    area: 'Osu',
    areaKey: 'labone-osu',
    intent: 'rent',
    price: 700,
    priceLabel: '$700/mo',
    beds: 1,
    baths: 1,
    sqm: 60,
    tags: ['Gated security', 'Unfurnished'],
    img: '/images/vee/listing-ro8002.jpg',
    status: 'Available',
  },
];

export type Neighbourhood = {
  key: string;
  name: string;
  blurb: string;
  from: string;
  img: string;
};

export const NEIGHBOURHOODS: Neighbourhood[] = [
  {
    key: 'east-legon',
    name: 'East Legon',
    blurb: 'Embassy-quiet streets, established compounds and the city\u2019s strongest school belt.',
    from: 'From $175,000',
    img: '/images/vee/nb-east-legon.jpg',
  },
  {
    key: 'cantonments',
    name: 'Cantonments',
    blurb: 'Old-money Accra: wide roads, mature plots, minutes from Osu and the embassies.',
    from: 'From $410,000',
    img: '/images/vee/nb-cantonments.jpg',
  },
  {
    key: 'airport',
    name: 'Airport Residential',
    blurb: 'Executive living beside Kotoka International \u2014 the first stop for returnees.',
    from: 'From $230,000',
    img: '/images/vee/nb-airport.jpg',
  },
  {
    key: 'labone-osu',
    name: 'Labone & Osu',
    blurb: 'Walkable, social and beach-close. The city\u2019s deepest rental demand.',
    from: 'From $95,000',
    img: '/images/vee/nb-labone-osu.jpg',
  },
  {
    key: 'tema-adenta',
    name: 'Adenta & Tema',
    blurb: 'Space and value for families \u2014 gardens, garages and room to grow.',
    from: 'From $150,000',
    img: '/images/vee/nb-tema-adenta.jpg',
  },
];

export const SERVICES = [
  {
    title: 'Buy with confidence',
    body: 'A curated shortlist matched to your budget, timeline and must-haves \u2014 only verified, available inventory.',
    icon: 'key',
  },
  {
    title: 'Sell & let',
    body: 'Positioning, market-true pricing and qualified buyers driven by our own campaigns \u2014 not just a listing.',
    icon: 'tag',
  },
  {
    title: 'Investment advisory',
    body: 'Yield-focused guidance on units, neighbourhoods and payment structures for rental and resale return.',
    icon: 'chart',
  },
  {
    title: 'Diaspora concierge',
    body: 'Buy from abroad with confidence: video viewings, document packs for your lawyer and one contact on the ground.',
    icon: 'globe',
  },
  {
    title: 'Property management',
    body: 'Tenant sourcing, rent collection and maintenance coordination for owners who live far away.',
    icon: 'building',
  },
  {
    title: 'Documentation & due diligence',
    body: 'Structured checks on title, permits and encumbrances before you commit \u2014 with your lawyer in the loop.',
    icon: 'shield',
  },
];

export const PRINCIPLES = [
  {
    title: 'Honest inventory',
    body: 'If a home is not genuinely available, it is not shown. Reservations and sales update the list the same day.',
  },
  {
    title: 'Numbers, not adjectives',
    body: 'Prices, square metres, service charges, commute times. Facts you can compare \u2014 not words you have to trust.',
  },
  {
    title: '15-minute first response',
    body: 'Every enquiry reaches a human within 15 minutes between 08:00 and 20:00 GMT. No queues, no bots.',
  },
  {
    title: 'One consultant, start to keys',
    body: 'The person who takes your first message stays with you through viewing, offer, documents and handover.',
  },
];

export const STEPS = [
  {
    title: 'Tell us the brief',
    body: 'One WhatsApp message is enough: buy or rent, budget, area, timeline and must-haves.',
  },
  {
    title: 'Curated shortlist',
    body: 'Within 24 hours you get 3\u20135 matched options \u2014 with the trade-offs spelled out, not buried.',
  },
  {
    title: 'Viewings on your schedule',
    body: 'In person or on live video, grouped so a single trip covers everything worth seeing.',
  },
  {
    title: 'Close with confidence',
    body: 'Offer, documents, payment structure and handover \u2014 coordinated end-to-end on your behalf.',
  },
];

export const FAQS = [
  {
    q: 'I live abroad. Can I buy in Ghana without flying in?',
    a: 'Yes. We run live video viewings, share document packs for your lawyer\u2019s review, and coordinate with a representative or power of attorney if you appoint one. Many clients complete a purchase remotely and walk through the door on their next trip home.',
  },
  {
    q: 'How do you verify a property before listing it?',
    a: 'A consultant has seen every listing in person or on live video, and availability is confirmed before it appears here. Where the seller provides documents, we review title and permits and tell you plainly what has been verified \u2014 and what still needs your lawyer\u2019s check.',
  },
  {
    q: 'What are your fees?',
    a: 'Buyer representation is typically paid by the seller\u2019s side. Any fee that involves you is put in writing and confirmed before you commit to anything \u2014 no surprises at the closing table.',
  },
  {
    q: 'Do you help with payment plans or mortgages?',
    a: 'We work with mortgage partners and can structure deposit + instalment plans where the seller supports them. You see the full numbers before deciding \u2014 and we will tell you when a plan does not make sense.',
  },
  {
    q: 'How quickly can I see a property?',
    a: 'Most viewings are arranged within 48 hours; urgent cases can be same-day. Tell us your window and we group properties into one efficient trip.',
  },
  {
    q: 'How do I start?',
    a: 'Send one WhatsApp message with what you are looking for. During working hours you will have a reply within 15 minutes \u2014 from a person, not an autoresponder.',
  },
];

/** Builds a WhatsApp deep link with a prefilled message. */
export function waLink(message: string): string {
  return `https://wa.me/${CONTACT.whatsappIntl}?text=${encodeURIComponent(message)}`;
}

/**
 * Tutorial copy and screenshot data, taken verbatim from the "Tutorial" boards.
 * Bracketed text ([1–2], [exact spot], [contact email], [Confirm with SUSS]) is a
 * placeholder in the design itself — replace once SUSS confirms the facts.
 *
 * Marker coordinates are in the design's pixels on the phone screen (260×708 for the
 * main phone, 150×408 for the small one) and are rendered as percentages, so they stay
 * put when the phone is drawn at another size (mobile, lightbox).
 */

export interface Marker {
  /** Which action this marker belongs to (1-based). */
  n: number;
  x: number;
  y: number;
}

export interface Shot {
  id: string;
  src: string;
  alt: string;
  size: "lg" | "sm";
  markers: Marker[];
  /** Caption under a secondary (small) phone, e.g. "Then you’ll see". */
  label?: string;
}

export interface Step {
  n: number;
  title: string;
  intro: string;
  actions: string[];
  tip?: string;
  shots: Shot[];
}

export const STEPS: Step[] = [
  {
    n: 1,
    title: "Create your account",
    intro:
      "Sign up with a few details so the SUSS team knows who is collecting.",
    actions: [
      "Enter your name, email and password",
      "Add your phone number — we’ll send pickup updates on WhatsApp",
      "Tell us briefly how you’ll use the compost (e.g. balcony herbs)",
      "Tap “Create account”",
    ],
    tip: "A clear intended use helps us approve you faster.",
    shots: [
      {
        id: "s1",
        src: "/images/tutorial/1-sign-up.jpg",
        alt: "LoopSoil Sign Up screen with name, phone number, intended use and Create Account button",
        size: "lg",
        markers: [
          { n: 1, x: 18, y: 79 },
          { n: 2, x: 61, y: 218 },
          { n: 3, x: 18, y: 351 },
          { n: 4, x: 69, y: 676 },
        ],
      },
    ],
  },
  {
    n: 2,
    title: "Wait for approval",
    intro:
      "The SUSS team checks each new gardener. You’ll see your status on your Profile.",
    actions: [
      "Your account shows “Pending approval” while the SUSS team reviews it",
      "You can already browse available compost",
      "We’ll message you on WhatsApp once you’re approved (usually [1–2] working days)",
    ],
    shots: [
      {
        id: "s2",
        src: "/images/tutorial/2-pending-approval.jpg",
        alt: "Profile screen showing the Pending approval badge and a note about WhatsApp updates",
        size: "lg",
        markers: [
          { n: 1, x: 37, y: 212 },
          { n: 2, x: 15, y: 303 },
          { n: 3, x: 15, y: 632 },
        ],
      },
    ],
  },
  {
    n: 3,
    title: "Browse available compost",
    intro: "Open the Compost tab to see every batch you can claim from.",
    actions: [
      "See how much compost is available right now",
      "Each batch card shows kg remaining, quality (pH) and the claim-by date",
      "Your allowance shows how much you can still claim from that batch",
      "Tap “Claim compost” on the batch you want",
    ],
    shots: [
      {
        id: "s3",
        src: "/images/tutorial/3-browse.jpg",
        alt: "Browse Compost screen with the available-now total, a batch card, your allowance and the Claim compost button",
        size: "lg",
        markers: [
          { n: 1, x: 18, y: 59 },
          { n: 2, x: 15, y: 468 },
          { n: 3, x: 41, y: 641 },
          { n: 4, x: 62, y: 692 },
        ],
      },
    ],
  },
  {
    n: 4,
    title: "Choose how much you need",
    intro:
      "Pick an amount that suits your plants. You can make more claims later, up to 1kg per batch.",
    actions: [
      "Pick ½kg or 1kg, or tap “Custom” to enter your own amount",
      "You can claim from 0.1kg up to 1kg per batch",
      "Check the summary, then tap “Submit claim”",
    ],
    tip: "100–300g is usually enough to top up a potted plant.",
    shots: [
      {
        id: "s4",
        src: "/images/tutorial/4-claim.jpg",
        alt: "Claim screen with the amount picker, the 0.1kg to 1kg rule and the Submit claim button",
        size: "lg",
        markers: [
          { n: 1, x: 15, y: 334 },
          { n: 2, x: 32, y: 376 },
          { n: 3, x: 77, y: 670 },
        ],
      },
      {
        id: "s4b",
        src: "/images/tutorial/4b-claim-submitted.jpg",
        alt: "Claim submitted confirmation screen",
        size: "sm",
        markers: [],
        label: "Then you’ll see",
      },
    ],
  },
  {
    n: 5,
    title: "Track your claim",
    intro:
      "Everything you’ve claimed lives in My Claims, with its status and next step.",
    actions: [
      "Your claim starts as “Pending” while we review it",
      "Once “Approved”, you’ll see a “Book your pickup” button and a deadline",
      "If a claim is declined, you’ll see the reason here",
      "Changed your mind? Tap “Cancel claim” and tell us why",
    ],
    shots: [
      {
        id: "s5",
        src: "/images/tutorial/5-my-claims.jpg",
        alt: "My Claims screen with an approved claim, the Book your pickup button, the History tab and Cancel claim",
        size: "lg",
        markers: [
          { n: 2, x: 53, y: 458 },
          { n: 3, x: 121, y: 162 },
          { n: 4, x: 69, y: 501 },
        ],
      },
      {
        id: "s5b",
        src: "/images/tutorial/5b-pending-claim.jpg",
        alt: "A pending claim card in My Claims",
        size: "sm",
        markers: [{ n: 1, x: 99, y: 230 }],
        label: "A new claim",
      },
    ],
  },
  {
    n: 6,
    title: "Book a pickup time",
    intro: "Choose a time that works for you at the SUSS bin centre.",
    actions: [
      "Choose a date",
      "Pick a time slot that still has space (“Full” slots can’t be chosen)",
      "Tap “Confirm pickup”",
      "Add it to your calendar so you don’t forget",
    ],
    tip: "Can’t make it? Use “Change time” in My Claims — don’t book a second slot.",
    shots: [
      {
        id: "s6",
        src: "/images/tutorial/6-book-pickup.jpg",
        alt: "Book Pickup screen with date chips, time slots and the Confirm pickup button",
        size: "lg",
        markers: [
          { n: 1, x: 94, y: 383 },
          { n: 2, x: 37, y: 500 },
          { n: 3, x: 250, y: 670 },
        ],
      },
      {
        id: "s6b",
        src: "/images/tutorial/6b-pickup-booked.jpg",
        alt: "Pickup booked screen with the Add to calendar button",
        size: "sm",
        markers: [{ n: 4, x: 34, y: 301 }],
        label: "After you confirm",
      },
    ],
  },
  {
    n: 7,
    title: "Collect your compost",
    intro:
      "Head to the bin centre at your booked time. The staff will do the rest.",
    actions: [
      "Go to the SUSS bin centre at your booked time ([exact spot])",
      "Open your pickup pass in My Claims and show your reference or QR code to the staff",
      "Your compost will be weighed and handed over in ½kg/1kg bags or scooped to your amount",
      "That’s it — your claim is marked “Collected”",
    ],
    tip: "Collect before your deadline, or the compost is released to other gardeners.",
    shots: [
      {
        id: "s7",
        // NOTE: the design uses the same image file here as step 6's "Pickup booked"
        // screen — swap in a real Pickup Pass screenshot once the pass is built.
        src: "/images/tutorial/7-pickup-pass.jpg",
        alt: "Pickup pass screen showing location, your reference, what to bring and View my claims",
        size: "lg",
        markers: [
          { n: 1, x: 64, y: 342 },
          { n: 2, x: 72, y: 198 },
          { n: 3, x: 51, y: 402 },
          { n: 4, x: 69, y: 563 },
        ],
      },
    ],
  },
];

export const OVERVIEW = [
  "Sign up",
  "Claim",
  "Book a pickup",
  "Collect",
] as const;

export const RULES = [
  {
    title: "Up to 1kg per batch",
    body: "You can make more than one claim, as long as the total stays within 1kg.",
  },
  { title: "Minimum 0.1kg", body: "Request any amount in 0.1kg steps." },
  {
    title: "Collect on time",
    body: "Missed pickups are released to others after the deadline.",
  },
  {
    title: "Free of charge",
    body: "Compost made from SUSS campus food waste.",
  },
] as const;

export const FAQ = [
  {
    q: "Is the compost really free?",
    a: "Yes. It’s made from SUSS campus food waste and given to gardeners at no cost.",
  },
  {
    q: "How long does approval take?",
    a: "Usually [1–2] working days. We’ll message you on WhatsApp once you’re approved.",
  },
  {
    q: "Can I claim from more than one batch?",
    a: "Yes. You can claim up to 1kg from each batch that’s open, so you can have claims on several batches at once.",
  },
  {
    q: "What if I can’t make my pickup time?",
    a: "Open My Claims and tap “Change time” to pick another slot before your deadline. Please don’t book a second slot.",
  },
  {
    q: "Where exactly is the bin centre?",
    a: "At the SUSS bin centre, [exact spot]. Your pickup pass has a “View on map” link.",
  },
  {
    q: "Do I need to bring my own bag or container?",
    a: "[Confirm with SUSS] We pack compost in ½kg/1kg bags, but you’re welcome to bring your own container.",
  },
  {
    q: "How do I use the compost for potted plants?",
    a: "Mix a handful into the top few centimetres of soil, or blend about one part compost to three parts potting mix. Water well afterwards.",
  },
  {
    q: "I’m part of an organisation — how do I get a larger amount?",
    a: "You don’t need to sign up. Contact the SUSS team at [contact email] and they’ll set up a monthly amount and book pickups for you.",
  },
] as const;

export const ORG_STEPS = [
  "SUSS contacts you",
  "Sets your monthly amount",
  "Books your pickup",
  "You collect at the bin centre",
] as const;

/** Every screenshot in guide order — the lightbox's prev/next walks this list. */
export const ALL_SHOTS = STEPS.flatMap((step) =>
  step.shots.map((shot) => ({ shot, step })),
);

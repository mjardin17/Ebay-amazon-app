import { ItemAnalysis } from "../types";

export interface PresetItem {
  id: string;
  name: string;
  category: string;
  cogs: number;
  imageUrl: string;
  notes: string;
  precomputedAnalysis: ItemAnalysis;
}

export const PRESET_ITEMS: PresetItem[] = [
  {
    id: "preset-1",
    name: "Sony WH-1000XM4 Noise-Canceling Headphones",
    category: "Consumer Electronics",
    cogs: 65.0,
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80",
    notes: "Tested 100% operational. Matte black finish, minimal headband wear. Includes original aux cable and hard travel case.",
    precomputedAnalysis: {
      title: "Sony WH-1000XM4 Wireless Noise-Canceling Headphones Black - Tested Case Included",
      brand: "Sony",
      model: "WH-1000XM4",
      category: "Consumer Electronics > Portable Audio & Headphones > Headphones",
      condition: "Very Good (Pre-owned)",
      cogs: 65.0,
      imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80",
      itemSpecifics: {
        Brand: "Sony",
        Model: "WH-1000XM4",
        Type: "Ear-Cup (Over the Ear)",
        Connectivity: "Bluetooth, 3.5mm Aux Cable",
        Color: "Black",
        Features: "Active Noise Cancellation, Touch Controls, Multipoint Pairing, Built-In Mic",
        MPN: "WH1000XM4/B",
        "Battery Life": "Up to 30 Hours",
      },
      descriptionHtml: `<h3>Item Overview</h3>
<p>Authentic Sony WH-1000XM4 premium noise-canceling headphones in black. Tested extensively for sound fidelity, microphone clarity, and active noise reduction. Connects seamlessly to both iOS and Android via Bluetooth.</p>

<h3>Key Features</h3>
<ul>
  <li>Dual noise sensor technology for superior noise cancelation</li>
  <li>Custom 40mm sound drivers with LDAC high-res audio support</li>
  <li>Quick touch attention mode and speak-to-chat auto-pause</li>
  <li>USB-C quick charge (5 hours playback from 10-minute charge)</li>
</ul>

<h3>Condition & Cosmetic Inspection</h3>
<p>Condition rated Very Good (Pre-owned). Foam earpads are plump and clean without peeling or odor. Headband slider has light hairline surface rub from normal use. Hinge joints are solid and tight.</p>

<h3>Included in Package</h3>
<ul>
  <li>Sony WH-1000XM4 Wireless Headphones</li>
  <li>OEM 3.5mm gold-plated audio cable</li>
  <li>USB-C charging cable</li>
  <li>Rigid ballistic nylon zip protective travel case</li>
</ul>

<h3>Shipping & Handling</h3>
<p>Packaged in bubble wrap and sturdy box. Ships within 1 business day via tracked USPS Ground Advantage.</p>`,
      comps: {
        fastSalePrice: 159.0,
        recommendedPrice: 179.99,
        highProfitPrice: 199.0,
        medianSoldComps: 178.5,
        lowSoldComp: 142.0,
        highSoldComp: 215.0,
        sellThroughRate: 86,
        compNotes: "Consistent high-volume seller. 380+ sold listings in the past 60 days on eBay with median pricing around $175-$180.",
      },
      flawAndInspection: {
        flawsDetected: [
          "Superficial hairline friction mark on upper headband slider (purely cosmetic)",
          "Original retail cardboard packaging not included (protective hard travel case included)",
        ],
        returnRiskLevel: "Low",
        authenticityNotes: "Verified authentic Sony serial number tag located inside headband adjustment track.",
        suggestedDisclaimer: "Pre-owned electronics are cleaned, disinfected, and sound-bench tested. Please review all high-resolution photos prior to purchase.",
      },
      shippingOptimization: {
        estimatedWeightOz: 18,
        packageDimensions: "9 x 7 x 4 in",
        recommendedCarrier: "USPS Ground Advantage (Commercial Base Rate)",
        estimatedShippingCost: 6.45,
        cubicRateEligible: true,
      },
      crossListingPrices: {
        ebay: 179.99,
        mercari: 169.0,
        poshmark: 185.0,
        facebookMarketplace: 155.0,
        amazonFba: 248.0,
      },
      negotiationRules: {
        autoAcceptOfferAbove: 165.0,
        autoDeclineOfferBelow: 145.0,
        counterOfferStrategy: "Counter at $170 shipped, reminding buyer that the hard zip case and OEM cable are included.",
      },
      amazonListing: {
        asin: "B08N5WRWNW",
        sku: "SONY-XM4-BLK-USED-VG",
        fnsku: "X003A4BC89",
        amazonTitle: "Sony WH-1000XM4 Wireless Premium Noise Canceling Overhead Headphones with Mic Phone Control, Black",
        bulletPoints: [
          "INDUSTRY-LEADING NOISE CANCELLATION: Dual Noise Sensor technology powered by HD Noise Cancelling Processor QN1 delivers elite sound isolation.",
          "PREMIUM HI-RES AUDIO: 40mm drivers with Liquid Crystal Polymer diaphragms reproduce a full range of frequencies up to 40kHz via LDAC.",
          "UP TO 30 HOURS BATTERY: Long-lasting battery with fast charge support (10 min charge provides 5 hours of playback).",
          "TOUCH SENSOR CONTROLS: Intuitive touch controls to pause, play, skip tracks, control volume, activate voice assistant, and answer calls.",
          "SMART SPEAK-TO-CHAT: Automatically reduces volume during conversations; includes USB-C cord, aux cable, and hard zip travel case."
        ],
        backendSearchTerms: "wireless bluetooth over ear headphones travel gym noise canceling microphone anc",
        buyBoxPrice: 248.0,
        amazonReferralFee: 19.84,
        fbaFulfillmentFee: 5.48,
        inboundPlacementFee: 0.21,
        netFbaProfit: 157.47,
        fbaRoiPct: 242,
        fbaMarginPct: 63.5,
        bsrRank: 142,
        bsrCategory: "Electronics > Over-Ear Headphones",
        gatingStatus: "Ungated",
        prepCategory: "No Prep Needed",
        suffocationWarningRequired: false,
        labelingOwner: "Seller (FNSKU)",
        upcOrEan: "027242919419",
        sellerCentralAddUrl: "https://sellercentral.amazon.com/product-search/search?q=B08N5WRWNW",
      },
    },
  },
  {
    id: "preset-2",
    name: "Nintendo Game Boy Color - Atomic Purple Edition",
    category: "Retro Video Games",
    cogs: 28.0,
    imageUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80",
    notes: "Authentic OEM shell, fully cleaned motherboard and contacts. Tested with Pokemon Gold. Speaker loud and crisp.",
    precomputedAnalysis: {
      title: "Nintendo Game Boy Color Atomic Purple Console CGB-001 OEM Tested Works Great",
      brand: "Nintendo",
      model: "CGB-001",
      category: "Video Games & Consoles > Video Game Consoles",
      condition: "Very Good (Pre-owned)",
      cogs: 28.0,
      imageUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80",
      itemSpecifics: {
        Brand: "Nintendo",
        Model: "Game Boy Color",
        Platform: "Nintendo Game Boy Color",
        Color: "Atomic Purple (Clear Translucent)",
        MPN: "CGB-001",
        "Region Code": "Region Free",
        "Country of Manufacture": "Japan",
      },
      descriptionHtml: `<h3>Item Overview</h3>
<p>Authentic 1998 Nintendo Game Boy Color handheld system in desirable Atomic Purple (translucent casing). Model CGB-001. 100% original OEM Nintendo hardware that has been carefully inspected and tested.</p>

<h3>Functional Condition</h3>
<ul>
  <li>Screen: Original LCD screen with strong contrast, no dead pixels, no screen cancer</li>
  <li>Sound: Internal speaker is crisp and loud; headphone jack tested clean</li>
  <li>Buttons & D-Pad: Responsive and tactile; start/select membranes firm</li>
  <li>Battery Compartment: Clean with zero battery acid corrosion or residue</li>
  <li>Cartridge Reader: Reads Game Boy and GBC cartridges on first insertion</li>
</ul>

<h3>Cosmetic Details</h3>
<p>Light micro-scratches on front plastic lens consistent with careful retro usage. Original rear barcode and model labels intact.</p>`,
      comps: {
        fastSalePrice: 74.0,
        recommendedPrice: 89.95,
        highProfitPrice: 99.0,
        medianSoldComps: 88.0,
        lowSoldComp: 65.0,
        highSoldComp: 110.0,
        sellThroughRate: 91,
        compNotes: "Exceptional liquidity. Atomic Purple is one of the top-selling Game Boy colorways with ~91% sell-through within 14 days.",
      },
      flawAndInspection: {
        flawsDetected: [
          "Light micro-scratches on original plastic screen lens",
          "Rear serial sticker shows minor edge rub",
        ],
        returnRiskLevel: "Low",
        authenticityNotes: "Authentic OEM motherboard stamping 1998 Nintendo; original tri-wing security screws present.",
        suggestedDisclaimer: "Batteries and test game cartridge shown for functional demonstration only and not included. System is 100% OEM Nintendo.",
      },
      shippingOptimization: {
        estimatedWeightOz: 11,
        packageDimensions: "7 x 5 x 3 in",
        recommendedCarrier: "USPS Ground Advantage (under 12 oz)",
        estimatedShippingCost: 4.85,
        cubicRateEligible: true,
      },
      crossListingPrices: {
        ebay: 89.95,
        mercari: 84.0,
        poshmark: 92.0,
        facebookMarketplace: 75.0,
        amazonFba: 119.0,
      },
      negotiationRules: {
        autoAcceptOfferAbove: 82.0,
        autoDeclineOfferBelow: 70.0,
        counterOfferStrategy: "Counter at $84 citing clean battery terminals and OEM untouched shell.",
      },
      amazonListing: {
        asin: "B00002ST2X",
        sku: "NINT-GBC-PURPLE-USED",
        fnsku: "X005GB99XX",
        amazonTitle: "Nintendo Game Boy Color Handheld Gaming Console - Atomic Purple (Renewed / Inspected)",
        bulletPoints: [
          "RETRO HANDHELD GAMING: Original Nintendo Game Boy Color handheld system in translucent Atomic Purple casing.",
          "BACKWARDS COMPATIBILITY: Plays both Game Boy Color and original classic Game Boy game cartridges.",
          "REFURBISHED & TESTED: Speaker sound volume, headphone audio, D-pad, and button contacts bench tested for reliability.",
          "CLEAN BATTERY TERMINALS: Battery contacts free of corrosion; requires 2 AA batteries (not included).",
          "AUTHENTIC OEM HARDWARE: Original motherboard, authentic casing, and rear model serial labels intact."
        ],
        backendSearchTerms: "nintendo game boy color atomic purple retro handheld console pokemon mario",
        buyBoxPrice: 119.0,
        amazonReferralFee: 9.52,
        fbaFulfillmentFee: 4.15,
        inboundPlacementFee: 0.21,
        netFbaProfit: 77.12,
        fbaRoiPct: 275,
        fbaMarginPct: 64.8,
        bsrRank: 420,
        bsrCategory: "Video Games > Retro Gaming & Consoles",
        gatingStatus: "Auto-Ungated",
        prepCategory: "Bubble Wrap & Tape",
        suffocationWarningRequired: false,
        labelingOwner: "Seller (FNSKU)",
        upcOrEan: "045496711016",
        sellerCentralAddUrl: "https://sellercentral.amazon.com/product-search/search?q=B00002ST2X",
      },
    },
  },
  {
    id: "preset-3",
    name: "Patagonia Classic Retro-X Deep Pile Fleece Jacket",
    category: "Clothing & Outdoor Apparel",
    cogs: 35.0,
    imageUrl: "https://images.unsplash.com/photo-1544441893-675973e31985?w=800&auto=format&fit=crop&q=80",
    notes: "Men's Size Large. Natural beige fleece with classic Navy Blue chest pocket. No matted fleece or cigarette odors.",
    precomputedAnalysis: {
      title: "Patagonia Classic Retro-X Deep Pile Fleece Jacket Mens Size Large Natural Navy",
      brand: "Patagonia",
      model: "Retro-X Windproof Fleece",
      category: "Clothing, Shoes & Accessories > Men > Men's Clothing > Coats, Jackets & Vests",
      condition: "Very Good (Pre-owned)",
      cogs: 35.0,
      imageUrl: "https://images.unsplash.com/photo-1544441893-675973e31985?w=800&auto=format&fit=crop&q=80",
      itemSpecifics: {
        Brand: "Patagonia",
        Size: "L",
        "Size Type": "Regular",
        Type: "Jacket",
        Style: "Fleece Jacket",
        Color: "Natural / Classic Navy",
        "Outer Shell Material": "100% Polyester Fleece (85% Recycled)",
        Features: "Windproof Membrane, Zippered Chest Pocket, Full Zip, Warmer Pocket Lining",
        Season: "Fall, Winter, Spring",
      },
      descriptionHtml: `<h3>Patagonia Retro-X Classic Fleece Jacket</h3>
<p>Authentic Patagonia Classic Retro-X fleece jacket in timeless Natural sherpa fleece with Navy contrast chest pocket and collar trim. Features a windproof barrier bonded between cozy 1/4"-pile sherpa fleece exterior and moisture-wicking mesh lining.</p>

<h3>Measurements (Laying Flat)</h3>
<ul>
  <li>Pit to Pit: 24.5 inches</li>
  <li>Collar Seam to Bottom Hem: 28 inches</li>
  <li>Sleeve Length (Center Back to Cuff): 36 inches</li>
</ul>

<h3>Condition Notes</h3>
<p>Excellent pre-owned condition. Deep-pile fleece is plush and lofty with zero elbow matting. All YKK zippers pull smoothly. Laundered according to Patagonia garment guidelines. Smoke-free, pet-free home.</p>`,
      comps: {
        fastSalePrice: 115.0,
        recommendedPrice: 139.95,
        highProfitPrice: 165.0,
        medianSoldComps: 138.0,
        lowSoldComp: 95.0,
        highSoldComp: 180.0,
        sellThroughRate: 82,
        compNotes: "Seasonal demand spikes September-March. Natural/Navy is the most coveted colorway on secondary resale markets.",
      },
      flawAndInspection: {
        flawsDetected: [
          "Very slight micro-lint on interior mesh lining (cleaned)",
          "No holes, stains, tears, or zipper teeth damage",
        ],
        returnRiskLevel: "Low",
        authenticityNotes: "Interior white fabric care and style code tag verified: Style #23048 FA21. Authentic Patagonia Fitz Roy woven chest label.",
        suggestedDisclaimer: "Please cross-reference flat-lay measurements with your best-fitting jacket to ensure desired fit.",
      },
      shippingOptimization: {
        estimatedWeightOz: 28,
        packageDimensions: "13 x 10 x 4 in (or USPS Padded Flat Rate Envelope)",
        recommendedCarrier: "USPS Priority Mail Padded Flat Rate Envelope",
        estimatedShippingCost: 8.95,
        cubicRateEligible: true,
      },
      crossListingPrices: {
        ebay: 139.95,
        mercari: 130.0,
        poshmark: 149.0,
        facebookMarketplace: 120.0,
        amazonFba: 179.0,
      },
      negotiationRules: {
        autoAcceptOfferAbove: 125.0,
        autoDeclineOfferBelow: 105.0,
        counterOfferStrategy: "Counter at $130, emphasizing the popular Natural/Navy colorway and clean plush fleece condition.",
      },
      amazonListing: {
        asin: "B08K3S99LL",
        sku: "PAT-RETROX-NATNVY-L",
        fnsku: "X008PT41WW",
        amazonTitle: "Patagonia Men's Classic Retro-X Windproof Deep-Pile Fleece Jacket, Natural w/ Classic Navy",
        bulletPoints: [
          "WINDPROOF FLEECE PROTECTION: Windproof barrier bonded between cozy 1/4\"-pile 85% recycled polyester sherpa fleece and breathable mesh lining.",
          "COMFORT FIT & MOBILITY: Y-joint sleeves provide mobility through the shoulders and arms for outdoor trails.",
          "ZIPPERED STORAGE POCKETS: Vertical zippered chest pocket made of durable nylon plus warm brushed-tricot lined handwarmer pockets.",
          "FULL-ZIP WITH WIND FLAP: Full-length front zip with internal wind flap shields against chilling gusts.",
          "SUSTAINABLE CRAFTSMANSHIP: Fair Trade Certified sewn using eco-friendly bluesign approved polyester fleece materials."
        ],
        backendSearchTerms: "patagonia fleece jacket mens retro x outdoor hiking winter coat warm",
        buyBoxPrice: 179.0,
        amazonReferralFee: 26.85,
        fbaFulfillmentFee: 6.1,
        inboundPlacementFee: 0.21,
        netFbaProfit: 110.84,
        fbaRoiPct: 316,
        fbaMarginPct: 61.9,
        bsrRank: 230,
        bsrCategory: "Clothing, Shoes & Jewelry > Men's Fleece Jackets",
        gatingStatus: "Auto-Ungate Available",
        prepCategory: "Polybag (Suffocation Warning)",
        suffocationWarningRequired: true,
        labelingOwner: "Seller (FNSKU)",
        upcOrEan: "194187259114",
        sellerCentralAddUrl: "https://sellercentral.amazon.com/product-search/search?q=B08K3S99LL",
      },
    },
  },
];

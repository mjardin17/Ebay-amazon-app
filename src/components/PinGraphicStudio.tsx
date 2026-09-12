import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles,
  Download,
  Copy,
  Check,
  Image as ImageIcon,
  Tag,
  Share2,
  ExternalLink,
  Layers,
  Palette,
  Sliders,
  CheckCircle,
  Zap,
  ShieldCheck,
  RotateCcw,
  Upload,
  ArrowRight,
} from "lucide-react";
import { ItemAnalysis, PinGraphicConfig, PinCopyData } from "../types";
import { PRESET_ITEMS } from "../data/sampleItems";

interface PinGraphicStudioProps {
  initialItem?: ItemAnalysis | null;
  onClose?: () => void;
}

export const PinGraphicStudio: React.FC<PinGraphicStudioProps> = ({
  initialItem,
  onClose,
}) => {
  // Source item data
  const currentItem = initialItem || PRESET_ITEMS[0].precomputedAnalysis;
  const initialImg =
    initialItem?.imageUrl ||
    PRESET_ITEMS[0].imageUrl;

  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    initialItem ? "custom" : PRESET_ITEMS[0].id
  );

  // Configuration State for 2:3 Pin Graphic
  const [config, setConfig] = useState<PinGraphicConfig>(() => {
    const listPrice = currentItem.comps?.recommendedPrice || 179.99;
    const comparePrice = Math.round((listPrice * 1.55) / 5) * 5;
    const savingsPct = Math.round(((comparePrice - listPrice) / comparePrice) * 100);

    return {
      template: "deal-hunter",
      aspectRatio: "2:3",
      colorTheme: "dark-slate",
      badgeText: "⚡ STEAL DEAL ALERT",
      headline: currentItem.title ? currentItem.title.slice(0, 48) : "Bose QC35 II Wireless Headphones",
      brandText: currentItem.brand || "Verified Brand",
      price: listPrice,
      comparePrice,
      savingsText: `SAVE ${savingsPct}% OFF`,
      bullet1: "Tested & 100% Fully Functional",
      bullet2: "Free USPS Priority Mail (2-3 Days)",
      bullet3: "eBay Cassini Sold Comps Verified",
      ctaText: "👉 TAP TO VIEW LISTING",
      watermarkText: "Top Rated Plus Seller • 100% Positive Feedback",
      imageUrl: initialImg,
      showPriceBadge: true,
      showBullets: true,
      showCta: true,
      showWatermark: true,
    };
  });

  // AI Copy & SEO State
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [pinCopyData, setPinCopyData] = useState<PinCopyData>({
    headlineHooks: [
      `⚡ STEAL DEAL: Save ${config.savingsText} on ${config.brandText}`,
      `🔥 Rare Find! Authentic ${config.brandText} Tested & Ready to Ship`,
      `Don't Pay Full Price! Verified 90-Day eBay Sold Comp Steal`,
      `Priced to Sell Fast: Only 1 Available in This Condition`,
    ],
    pinTitle: `${config.headline} - Verified Deal & Fast Shipping`,
    pinDescription: `Authentic ${config.brandText} in ${currentItem.condition || "Very Good"} condition. Verified against 90-day sold eBay comps. Fast and secure domestic shipping with tracking. Tap the link to view the complete listing and grab it before it sells! #ebayfinds #dealalert #resellersquad #resellercommunity #stealdeal #bargain`,
    suggestedBadge: "⚡ STEAL DEAL ALERT",
    highlightPills: [
      "Tested & 100% Operational",
      "Fast & Free Tracked Shipping",
      "Cassini Sold Comp Verified",
    ],
    hashtags: ["ebayfinds", "dealalert", "resellercommunity", "onlineshopping", "stealdeal", "bargainhunter"],
  });

  const [downloading, setDownloading] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedCopy, setCopiedCopy] = useState(false);
  const [imageUploadLoading, setImageUploadLoading] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync when initialItem changes
  useEffect(() => {
    if (initialItem) {
      const price = initialItem.comps?.recommendedPrice || 149;
      const compare = Math.round((price * 1.5) / 5) * 5;
      const savings = Math.round(((compare - price) / compare) * 100);

      setConfig((prev) => ({
        ...prev,
        headline: initialItem.title ? initialItem.title.slice(0, 52) : prev.headline,
        brandText: initialItem.brand || prev.brandText,
        price,
        comparePrice: compare,
        savingsText: `SAVE ${savings}% OFF`,
        imageUrl: initialItem.imageUrl || prev.imageUrl,
      }));
    }
  }, [initialItem]);

  // Handle Preset Switching
  const handleSelectPreset = (presetItem: typeof PRESET_ITEMS[0]) => {
    setSelectedPresetId(presetItem.id);
    const item = presetItem.precomputedAnalysis;
    const price = item.comps?.recommendedPrice || 100;
    const compare = Math.round((price * 1.55) / 5) * 5;
    const savings = Math.round(((compare - price) / compare) * 100);

    setConfig((prev) => ({
      ...prev,
      headline: item.title.slice(0, 50),
      brandText: item.brand,
      price,
      comparePrice: compare,
      savingsText: `SAVE ${savings}% OFF`,
      imageUrl: presetItem.imageUrl,
    }));
  };

  // Handle File Upload for custom image
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageUploadLoading(true);
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setConfig((prev) => ({ ...prev, imageUrl: base64 }));
        setImageUploadLoading(false);
      };
      reader.readAsDataURL(file);
    }
  };

  // AI Hook & Pin Copy Generator
  const handleGenerateAiPinCopy = async () => {
    setGeneratingCopy(true);
    try {
      const res = await fetch("/api/gemini/generate-pin-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productTitle: config.headline,
          brand: config.brandText,
          price: config.price,
          comparePrice: config.comparePrice,
          condition: currentItem.condition,
          category: currentItem.category,
          keyFeatures: [config.bullet1, config.bullet2, config.bullet3],
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setPinCopyData(json.data);
        if (json.data.headlineHooks?.[0]) {
          // Auto-suggest first hook if desired, or keep user headline
        }
        if (json.data.suggestedBadge) {
          setConfig((prev) => ({ ...prev, badgeText: json.data.suggestedBadge }));
        }
      }
    } catch (err) {
      console.error("Failed to generate pin copy:", err);
    } finally {
      setGeneratingCopy(false);
    }
  };

  // RENDER GRAPHIC TO HTML5 CANVAS
  const renderCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Dimensions: Pinterest Standard 2:3 is 1000 x 1500
    let width = 1000;
    let height = 1500;
    if (config.aspectRatio === "9:16") {
      width = 1080;
      height = 1920;
    } else if (config.aspectRatio === "1:1") {
      width = 1200;
      height = 1200;
    }

    canvas.width = width;
    canvas.height = height;

    // Colors mapping based on theme
    const isEditorial = config.colorTheme === "editorial-ivory";
    const isNeon = config.colorTheme === "electric-neon";
    const isSunset = config.colorTheme === "sunset-orange";
    const isCyber = config.colorTheme === "cyber-violet";
    const isEbay = config.colorTheme === "ebay-bold";

    // 1. Draw Background
    if (isEditorial) {
      // Warm ivory linen
      ctx.fillStyle = "#FAF7F2";
      ctx.fillRect(0, 0, width, height);

      // Elegant double border
      ctx.strokeStyle = "#E7DFD5";
      ctx.lineWidth = 14;
      ctx.strokeRect(28, 28, width - 56, height - 56);
      ctx.strokeStyle = "#8C7B6B";
      ctx.lineWidth = 2;
      ctx.strokeRect(38, 38, width - 76, height - 76);
    } else if (isNeon) {
      // Carbon Dark + Green Glow
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, "#090d16");
      bgGrad.addColorStop(1, "#03140d");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Ambient neon spot
      const spot = ctx.createRadialGradient(width / 2, 400, 50, width / 2, 400, 600);
      spot.addColorStop(0, "rgba(16, 185, 129, 0.18)");
      spot.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, width, height);
    } else if (isSunset) {
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, "#1c0a00");
      bgGrad.addColorStop(0.5, "#2b0f02");
      bgGrad.addColorStop(1, "#0f0502");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      const spot = ctx.createRadialGradient(width / 2, 500, 40, width / 2, 500, 550);
      spot.addColorStop(0, "rgba(249, 115, 22, 0.22)");
      spot.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, width, height);
    } else if (isCyber) {
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, "#130924");
      bgGrad.addColorStop(1, "#0a0614");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      const spot = ctx.createRadialGradient(width / 2, 500, 50, width / 2, 500, 600);
      spot.addColorStop(0, "rgba(168, 85, 247, 0.22)");
      spot.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, width, height);
    } else if (isEbay) {
      // Modern eBay Blue & White studio
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, "#F8FAFC");
      bgGrad.addColorStop(1, "#EEF2F6");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Top color bar
      ctx.fillStyle = "#0053A0"; // eBay Blue
      ctx.fillRect(0, 0, width, 14);
    } else {
      // Dark Slate (Default)
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, "#0f172a");
      bgGrad.addColorStop(0.5, "#1e293b");
      bgGrad.addColorStop(1, "#090d16");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Subtle warm amber spotlight behind photo
      const spot = ctx.createRadialGradient(width / 2, 550, 60, width / 2, 550, 520);
      spot.addColorStop(0, "rgba(245, 158, 11, 0.16)");
      spot.addColorStop(1, "rgba(15, 23, 42, 0)");
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, width, height);
    }

    // Top Header / Badge Ribbon
    let currentY = isEditorial ? 80 : 70;

    if (config.badgeText) {
      ctx.save();
      const badgeText = config.badgeText.toUpperCase();
      ctx.font = "bold 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      const textMetrics = ctx.measureText(badgeText);
      const badgeWidth = textMetrics.width + 56;
      const badgeHeight = 52;
      const badgeX = (width - badgeWidth) / 2;

      // Badge Background Pill
      if (isEditorial) {
        ctx.fillStyle = "#8C7B6B";
        roundRect(ctx, badgeX, currentY, badgeWidth, badgeHeight, 10);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
      } else if (isNeon) {
        ctx.fillStyle = "#10B981";
        roundRect(ctx, badgeX, currentY, badgeWidth, badgeHeight, 26);
        ctx.fill();
        ctx.fillStyle = "#022c22";
      } else if (isSunset) {
        ctx.fillStyle = "#EA580C";
        roundRect(ctx, badgeX, currentY, badgeWidth, badgeHeight, 26);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
      } else if (isCyber) {
        ctx.fillStyle = "#9333EA";
        roundRect(ctx, badgeX, currentY, badgeWidth, badgeHeight, 26);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
      } else if (isEbay) {
        ctx.fillStyle = "#E53238"; // eBay Red
        roundRect(ctx, badgeX, currentY, badgeWidth, badgeHeight, 26);
        ctx.fill();
        ctx.fillStyle = "#FFFFFF";
      } else {
        // Dark Slate with Amber
        ctx.fillStyle = "#F59E0B";
        roundRect(ctx, badgeX, currentY, badgeWidth, badgeHeight, 26);
        ctx.fill();
        ctx.fillStyle = "#0F172A";
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(badgeText, width / 2, currentY + badgeHeight / 2);
      ctx.restore();

      currentY += badgeHeight + 25;
    }

    // Headline Text
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    if (isEditorial) {
      ctx.fillStyle = "#1C1917";
      ctx.font = "italic bold 44px 'Georgia', serif";
    } else if (isEbay) {
      ctx.fillStyle = "#0F172A";
      ctx.font = "900 46px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    } else {
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "800 46px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    }

    // Multi-line word wrap for headline
    const maxHeadlineWidth = width - 120;
    const headlineLines = wrapText(ctx, config.headline, maxHeadlineWidth);
    headlineLines.slice(0, 2).forEach((line) => {
      ctx.fillText(line, width / 2, currentY);
      currentY += 56;
    });
    ctx.restore();

    currentY += 15;

    // 2. Draw Main Product Photo Card
    const cardMarginX = 80;
    const cardWidth = width - cardMarginX * 2;
    // Calculate photo card height based on aspect ratio
    const cardHeight = config.aspectRatio === "9:16" ? 780 : config.aspectRatio === "1:1" ? 480 : 640;
    const cardX = cardMarginX;
    const cardY = currentY;

    // Draw Card Background Frame & Shadow
    ctx.save();
    ctx.shadowColor = isEditorial ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 32;
    ctx.shadowOffsetY = 16;

    ctx.fillStyle = isEditorial ? "#FFFFFF" : isEbay ? "#FFFFFF" : "#020617";
    roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 28);
    ctx.fill();
    ctx.restore();

    // Card border
    ctx.save();
    ctx.strokeStyle = isEditorial
      ? "#E2D8CC"
      : isNeon
      ? "rgba(16, 185, 129, 0.4)"
      : isSunset
      ? "rgba(249, 115, 22, 0.4)"
      : isEbay
      ? "#CBD5E1"
      : "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 3;
    roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 28);
    ctx.stroke();
    ctx.restore();

    // Load & Draw Image inside clipped card with object-fit cover
    if (config.imageUrl) {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";

        // Convert external http url to proxy endpoint to bypass CORS
        let imageSrc = config.imageUrl;
        if (imageSrc.startsWith("http://") || imageSrc.startsWith("https://")) {
          // If on same origin or data: leave as is, else proxy
          imageSrc = `/api/proxy-image?url=${encodeURIComponent(imageSrc)}`;
        }

        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => {
            // fallback attempt without proxy
            const fallbackImg = new Image();
            fallbackImg.crossOrigin = "anonymous";
            fallbackImg.onload = () => {
              drawImageCover(ctx, fallbackImg, cardX, cardY, cardWidth, cardHeight, 28);
              resolve();
            };
            fallbackImg.onerror = () => resolve(); // continue without failing
            fallbackImg.src = config.imageUrl;
          };
          img.src = imageSrc;
        });

        drawImageCover(ctx, img, cardX, cardY, cardWidth, cardHeight, 28);
      } catch (err) {
        console.error("Error drawing pin image:", err);
      }
    }

    // Optional Brand Pill over photo (Top-Left)
    if (config.brandText) {
      ctx.save();
      ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, sans-serif";
      const brandStr = config.brandText.toUpperCase();
      const bMetric = ctx.measureText(brandStr);
      const bW = bMetric.width + 32;
      const bH = 38;
      const bX = cardX + 22;
      const bY = cardY + 22;

      ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
      roundRect(ctx, bX, bY, bW, bH, 12);
      ctx.fill();

      ctx.fillStyle = "#F8FAFC";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(brandStr, bX + bW / 2, bY + bH / 2);
      ctx.restore();
    }

    // Optional Savings Tag over photo (Top-Right)
    if (config.savingsText && config.showPriceBadge) {
      ctx.save();
      ctx.font = "900 22px -apple-system, BlinkMacSystemFont, sans-serif";
      const sMetric = ctx.measureText(config.savingsText);
      const sW = sMetric.width + 36;
      const sH = 44;
      const sX = cardX + cardWidth - sW - 22;
      const sY = cardY + 22;

      ctx.fillStyle = isNeon ? "#10B981" : isSunset ? "#EA580C" : isEbay ? "#0064D2" : "#F59E0B";
      roundRect(ctx, sX, sY, sW, sH, 14);
      ctx.fill();

      ctx.fillStyle = isEbay || isSunset ? "#FFFFFF" : isNeon ? "#022c22" : "#0F172A";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(config.savingsText, sX + sW / 2, sY + sH / 2);
      ctx.restore();
    }

    currentY += cardHeight + 40;

    // 3. Draw Pricing Block
    if (config.showPriceBadge) {
      ctx.save();
      const priceStr = `$${Number(config.price).toFixed(2)}`;
      const hasCompare = config.comparePrice && config.comparePrice > config.price;
      const compareStr = hasCompare ? `MSRP $${Number(config.comparePrice).toFixed(0)}` : "";

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Resale Price
      ctx.font = "900 68px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.fillStyle = isEditorial
        ? "#8C7B6B"
        : isNeon
        ? "#34D399"
        : isSunset
        ? "#FB923C"
        : isEbay
        ? "#0064D2"
        : "#FBBF24";

      const priceMetric = ctx.measureText(priceStr);
      let totalPWidth = priceMetric.width;

      if (hasCompare) {
        ctx.font = "bold 32px -apple-system, BlinkMacSystemFont, sans-serif";
        const cMetric = ctx.measureText(compareStr);
        totalPWidth += cMetric.width + 40;

        // Draw side-by-side
        const startX = (width - totalPWidth) / 2;

        // Draw Resale Price
        ctx.font = "900 68px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillStyle = isEditorial
          ? "#8C7B6B"
          : isNeon
          ? "#34D399"
          : isSunset
          ? "#FB923C"
          : isEbay
          ? "#0064D2"
          : "#FBBF24";
        ctx.textAlign = "left";
        ctx.fillText(priceStr, startX, currentY);

        // Draw Compare Struck-through Price
        const compX = startX + priceMetric.width + 30;
        ctx.font = "bold 30px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillStyle = isEditorial ? "#A8A29E" : "#94A3B8";
        ctx.fillText(compareStr, compX, currentY + 10);

        // Strike-through line
        ctx.strokeStyle = "#EF4444";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(compX - 4, currentY + 10);
        ctx.lineTo(compX + cMetric.width + 4, currentY + 10);
        ctx.stroke();
      } else {
        // Centered single price
        ctx.fillText(priceStr, width / 2, currentY);
      }
      ctx.restore();

      currentY += 55;
    }

    // 4. Feature Bullets / Checklist Pills
    if (config.showBullets) {
      const bullets = [config.bullet1, config.bullet2, config.bullet3].filter(Boolean);
      ctx.save();
      ctx.font = "600 22px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      bullets.forEach((b) => {
        const text = `✓ ${b}`;
        const bMetrics = ctx.measureText(text);
        const pillW = Math.min(bMetrics.width + 40, width - 140);
        const pillH = 38;
        const pillX = (width - pillW) / 2;

        ctx.fillStyle = isEditorial
          ? "rgba(140, 123, 107, 0.12)"
          : isEbay
          ? "rgba(0, 83, 160, 0.08)"
          : "rgba(255, 255, 255, 0.07)";
        roundRect(ctx, pillX, currentY, pillW, pillH, 19);
        ctx.fill();

        ctx.fillStyle = isEditorial ? "#44403C" : isEbay ? "#1E293B" : "#E2E8F0";
        ctx.fillText(text, width / 2, currentY + pillH / 2);

        currentY += pillH + 12;
      });
      ctx.restore();

      currentY += 15;
    }

    // 5. Call To Action Button (Bottom)
    if (config.showCta) {
      ctx.save();
      const ctaW = width - 200;
      const ctaH = 68;
      const ctaX = (width - ctaW) / 2;
      const ctaY = currentY;

      // Glow effect
      ctx.shadowColor = isNeon
        ? "rgba(16, 185, 129, 0.5)"
        : isSunset
        ? "rgba(234, 88, 12, 0.5)"
        : isEbay
        ? "rgba(0, 100, 210, 0.4)"
        : "rgba(245, 158, 11, 0.45)";
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;

      if (isEditorial) {
        ctx.fillStyle = "#1C1917";
      } else if (isNeon) {
        ctx.fillStyle = "#10B981";
      } else if (isSunset) {
        ctx.fillStyle = "#EA580C";
      } else if (isCyber) {
        ctx.fillStyle = "#A855F7";
      } else if (isEbay) {
        ctx.fillStyle = "#0064D2";
      } else {
        ctx.fillStyle = "#F59E0B";
      }

      roundRect(ctx, ctaX, ctaY, ctaW, ctaH, 20);
      ctx.fill();
      ctx.restore();

      // CTA Text
      ctx.save();
      ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = isEditorial || isSunset || isCyber || isEbay ? "#FFFFFF" : "#0F172A";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(config.ctaText, width / 2, ctaY + ctaH / 2);
      ctx.restore();

      currentY += ctaH + 20;
    }

    // 6. Seller Trust Watermark / Verified Footer
    if (config.showWatermark && config.watermarkText) {
      ctx.save();
      ctx.font = "500 18px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = isEditorial ? "#78716C" : isEbay ? "#64748B" : "#64748B";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`🛡️ ${config.watermarkText}`, width / 2, height - (isEditorial ? 45 : 30));
      ctx.restore();
    }
  }, [config]);

  // Re-render canvas whenever config changes
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Helper: Download High-Res PNG
  const handleDownloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setDownloading(true);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      const safeTitle = config.headline.replace(/[^a-z0-9]/gi, "_").toLowerCase().slice(0, 30);
      a.download = `pin_${safeTitle}_${config.aspectRatio.replace(":", "x")}.png`;
      a.href = dataUrl;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Failed to download canvas PNG:", err);
    } finally {
      setTimeout(() => setDownloading(false), 800);
    }
  };

  // Helper: Copy Image to Clipboard
  const handleCopyImageToClipboard = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          setCopiedImage(true);
          setTimeout(() => setCopiedImage(false), 2500);
        } catch (e) {
          console.error("Clipboard copy failed:", e);
          handleDownloadPng();
        }
      });
    } catch (err) {
      console.error("Failed blob conversion:", err);
    }
  };

  // Helper: Copy Pinterest SEO Text
  const handleCopyPinterestCopy = () => {
    const fullText = `📌 PIN TITLE:\n${pinCopyData.pinTitle}\n\n📝 BOARD DESCRIPTION:\n${pinCopyData.pinDescription}\n\n🏷️ HASHTAGS:\n${pinCopyData.hashtags.map((h) => `#${h}`).join(" ")}`;
    navigator.clipboard.writeText(fullText);
    setCopiedCopy(true);
    setTimeout(() => setCopiedCopy(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Studio Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
                <Sparkles className="w-4 h-4" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                2:3 Pinterest Pin & Social Visual Studio
              </h2>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 uppercase tracking-wider">
                2:3 Vertical
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
              Generate pixel-perfect 1000×1500 high-converting Pinterest pins and vertical graphics. Drives viral external buyer traffic straight to your eBay listings and stores.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-ai-generate-pin-copy"
              onClick={handleGenerateAiPinCopy}
              disabled={generatingCopy}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-slate-950 font-bold text-xs shadow-md transition disabled:opacity-60"
            >
              <Sparkles className={`w-4 h-4 ${generatingCopy ? "animate-spin" : ""}`} />
              <span>{generatingCopy ? "Writing AI Hooks..." : "AI Viral Hooks"}</span>
            </button>

            <button
              id="btn-download-highres-pin"
              onClick={handleDownloadPng}
              disabled={downloading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition"
            >
              <Download className="w-4 h-4" />
              <span>{downloading ? "Exporting..." : "Download 2:3 Pin (.PNG)"}</span>
            </button>

            {onClose && (
              <button
                onClick={onClose}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Back to Listing
              </button>
            )}
          </div>
        </div>

        {/* Quick Item Picker */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 font-medium">Load Item:</span>
          {initialItem && (
            <button
              onClick={() => {
                setSelectedPresetId("current");
                setConfig((prev) => ({
                  ...prev,
                  headline: initialItem.title.slice(0, 50),
                  brandText: initialItem.brand || "Brand",
                  price: initialItem.comps?.recommendedPrice || 120,
                  imageUrl: initialItem.imageUrl || prev.imageUrl,
                }));
              }}
              className={`px-2.5 py-1.5 rounded-lg border font-medium transition ${
                selectedPresetId === "current"
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/50"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
              }`}
            >
              ⭐ Current Lister Item ({initialItem.brand || "Analyzed"})
            </button>
          )}

          {PRESET_ITEMS.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelectPreset(p)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-medium transition ${
                selectedPresetId === p.id
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                  : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
              }`}
            >
              <img src={p.imageUrl} alt={p.name} className="w-3.5 h-3.5 rounded-full object-cover" />
              <span className="truncate max-w-[110px]">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Studio Grid: Controls on Left, Live 2:3 Canvas on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Customization Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Template Archetype Selector */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-rose-400" />
                Template Archetype
              </label>
              <span className="text-[11px] text-slate-400">High-Conversion Layouts</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: "deal-hunter", name: "⚡ Viral Deal Hunter", desc: "High CTR, Savings Badge, Strike-through" },
                { id: "boutique-editorial", name: "📜 Editorial Boutique", desc: "Warm Ivory, Serif, Luxury Vibe" },
                { id: "tech-spec", name: "💻 Cyber Spec Card", desc: "Neon Slate, Features, Tested Stamp" },
                { id: "arbitrage-compare", name: "📊 Spread Comparison", desc: "Retail vs eBay Steal" },
                { id: "modern-minimalist", name: "✨ Modern Minimalist", desc: "Clean Studio Card, Focus on Item" },
              ].map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => setConfig((p) => ({ ...p, template: tmpl.id as any }))}
                  className={`text-left p-2.5 rounded-xl border transition flex flex-col justify-between ${
                    config.template === tmpl.id
                      ? "bg-rose-500/15 border-rose-500/60 text-white shadow-sm"
                      : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <span className="font-semibold text-xs block">{tmpl.name}</span>
                  <span className="text-[10px] text-slate-400 mt-1 line-clamp-1">{tmpl.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Color Themes & Aspect Ratio */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Aspect Ratio */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-2">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  Aspect Ratio
                </label>
                <div className="flex gap-2">
                  {[
                    { id: "2:3", label: "2:3 (Pinterest Standard)" },
                    { id: "9:16", label: "9:16 (Story/Reels)" },
                    { id: "1:1", label: "1:1 (Square)" },
                  ].map((ratio) => (
                    <button
                      key={ratio.id}
                      onClick={() => setConfig((p) => ({ ...p, aspectRatio: ratio.id as any }))}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border transition text-center ${
                        config.aspectRatio === ratio.id
                          ? "bg-amber-500 text-slate-950 border-amber-400 shadow-sm"
                          : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
                      }`}
                    >
                      {ratio.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Theme */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-2">
                  <Palette className="w-3.5 h-3.5 text-indigo-400" />
                  Color Palette
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: "dark-slate", label: "Dark Slate", color: "bg-slate-800 text-amber-400" },
                    { id: "editorial-ivory", label: "Ivory Paper", color: "bg-[#f8f7f2] text-stone-900 border-stone-300" },
                    { id: "electric-neon", label: "Neon Green", color: "bg-emerald-950 text-emerald-400" },
                    { id: "sunset-orange", label: "Sunset Heat", color: "bg-orange-950 text-orange-400" },
                    { id: "cyber-violet", label: "Cyber Violet", color: "bg-purple-950 text-purple-400" },
                    { id: "ebay-bold", label: "eBay Studio", color: "bg-sky-950 text-sky-400" },
                  ].map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => setConfig((p) => ({ ...p, colorTheme: theme.id as any }))}
                      className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition truncate ${
                        config.colorTheme === theme.id
                          ? "ring-2 ring-amber-400 border-transparent font-bold " + theme.color
                          : "bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {theme.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Typography & Hook Content */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-rose-400" />
                Pin Content & Viral Hooks
              </label>
              <button
                onClick={handleGenerateAiPinCopy}
                disabled={generatingCopy}
                className="text-[11px] text-amber-400 hover:underline flex items-center gap-1 font-semibold"
              >
                <Sparkles className="w-3 h-3" />
                Refresh AI Hooks
              </button>
            </div>

            {/* AI Suggested Hook Chips */}
            {pinCopyData.headlineHooks.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] text-slate-400">Click any viral hook to apply:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {pinCopyData.headlineHooks.map((hook, idx) => (
                    <button
                      key={idx}
                      onClick={() => setConfig((p) => ({ ...p, headline: hook }))}
                      className="text-left p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs text-slate-200 transition line-clamp-2 hover:border-amber-400/50"
                    >
                      {hook}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Inputs: Top Badge & Headline */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Top Badge Ribbon</label>
                <input
                  type="text"
                  value={config.badgeText}
                  onChange={(e) => setConfig((p) => ({ ...p, badgeText: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                  placeholder="e.g. ⚡ STEAL DEAL"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-300 mb-1">
                  Main Headline (Bold 2:3 Hook)
                </label>
                <input
                  type="text"
                  value={config.headline}
                  onChange={(e) => setConfig((p) => ({ ...p, headline: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                  placeholder="e.g. Rare Find! Authentic Bose QC35 II"
                />
              </div>
            </div>

            {/* Inputs: Pricing, Compare Price & Savings */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Our Resale Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={config.price}
                  onChange={(e) => {
                    const price = parseFloat(e.target.value) || 0;
                    const compare = config.comparePrice || price * 1.5;
                    const savings = compare > price ? Math.round(((compare - price) / compare) * 100) : 0;
                    setConfig((p) => ({
                      ...p,
                      price,
                      savingsText: savings > 0 ? `SAVE ${savings}% OFF` : "FREE SHIPPING",
                    }));
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-emerald-400 font-bold focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">MSRP / Compare ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={config.comparePrice || ""}
                  onChange={(e) => {
                    const compare = parseFloat(e.target.value) || 0;
                    const savings = compare > config.price ? Math.round(((compare - config.price) / compare) * 100) : 0;
                    setConfig((p) => ({
                      ...p,
                      comparePrice: compare,
                      savingsText: savings > 0 ? `SAVE ${savings}% OFF` : "FREE SHIPPING",
                    }));
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Savings / Promo Tag</label>
                <input
                  type="text"
                  value={config.savingsText}
                  onChange={(e) => setConfig((p) => ({ ...p, savingsText: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-amber-300 font-bold focus:border-amber-400 focus:outline-none"
                  placeholder="e.g. SAVE 45% OFF"
                />
              </div>
            </div>

            {/* Inputs: 3 Feature Bullets */}
            <div className="space-y-2">
              <label className="block text-[11px] font-medium text-slate-300">Feature Highlights / Seals</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={config.bullet1}
                  onChange={(e) => setConfig((p) => ({ ...p, bullet1: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                  placeholder="Bullet 1"
                />
                <input
                  type="text"
                  value={config.bullet2}
                  onChange={(e) => setConfig((p) => ({ ...p, bullet2: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                  placeholder="Bullet 2"
                />
                <input
                  type="text"
                  value={config.bullet3}
                  onChange={(e) => setConfig((p) => ({ ...p, bullet3: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                  placeholder="Bullet 3"
                />
              </div>
            </div>

            {/* CTA & Watermark */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Call To Action Button</label>
                <input
                  type="text"
                  value={config.ctaText}
                  onChange={(e) => setConfig((p) => ({ ...p, ctaText: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                  placeholder="e.g. 👉 TAP TO VIEW LISTING"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-300 mb-1">Trust Seal / Watermark</label>
                <input
                  type="text"
                  value={config.watermarkText}
                  onChange={(e) => setConfig((p) => ({ ...p, watermarkText: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-amber-400 focus:outline-none"
                  placeholder="e.g. Top Rated Plus Seller"
                />
              </div>
            </div>

            {/* Image Swap & Upload */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Photo:</span>
                <img src={config.imageUrl} alt="Current" className="w-8 h-8 rounded-lg object-cover border border-slate-700" />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-amber-400 hover:underline font-semibold flex items-center gap-1"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Device Image</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              {/* Toggles */}
              <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showBullets}
                    onChange={(e) => setConfig((p) => ({ ...p, showBullets: e.target.checked }))}
                    className="rounded bg-slate-950 border-slate-700 text-amber-500"
                  />
                  <span>Bullets</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showCta}
                    onChange={(e) => setConfig((p) => ({ ...p, showCta: e.target.checked }))}
                    className="rounded bg-slate-950 border-slate-700 text-amber-500"
                  />
                  <span>CTA</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: High-Res 2:3 Canvas Live Preview & Export Hub (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl sticky top-20">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-rose-400" />
                <span className="font-bold text-xs text-white uppercase tracking-wider">
                  Live 2:3 Pin Preview
                </span>
              </div>
              <span className="text-[11px] font-mono text-emerald-400 font-semibold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/80">
                1000 × 1500 px
              </span>
            </div>

            {/* Canvas Container with strict 2:3 aspect ratio framing */}
            <div className="relative mx-auto w-full max-w-[340px] sm:max-w-[380px] aspect-[2/3] bg-slate-950 rounded-2xl overflow-hidden border-2 border-slate-700/80 shadow-2xl flex items-center justify-center group">
              <canvas
                ref={canvasRef}
                className="w-full h-full object-contain rounded-xl"
              />
              {/* Quick overlay badge */}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/90 backdrop-blur px-2 py-1 rounded text-[10px] text-slate-300 pointer-events-none border border-slate-700">
                True 2:3 Aspect
              </div>
            </div>

            {/* Quick Action Export Buttons */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                onClick={handleDownloadPng}
                disabled={downloading}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 font-extrabold text-xs shadow-md transition"
              >
                <Download className="w-4 h-4" />
                <span>{downloading ? "Saving..." : "Download PNG"}</span>
              </button>

              <button
                onClick={handleCopyImageToClipboard}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 transition"
              >
                {copiedImage ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400">Copied Image!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy to Clipboard</span>
                  </>
                )}
              </button>
            </div>

            {/* Pinterest SEO Copy Box */}
            <div className="mt-4 pt-3 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-rose-400" />
                  Pinterest SEO Copy & Tags
                </span>
                <button
                  onClick={handleCopyPinterestCopy}
                  className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1"
                >
                  {copiedCopy ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied All!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy SEO Text</span>
                    </>
                  )}
                </button>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] space-y-2">
                <div>
                  <span className="text-slate-400 block font-medium">Pin Title:</span>
                  <span className="text-slate-200 font-semibold">{pinCopyData.pinTitle}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Board Description:</span>
                  <p className="text-slate-300 text-[11px] leading-relaxed line-clamp-3">
                    {pinCopyData.pinDescription}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 pt-1">
                  {pinCopyData.hashtags.map((h, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-slate-900 text-rose-300 border border-slate-800 text-[10px]">
                      #{h}
                    </span>
                  ))}
                </div>
              </div>

              <a
                href="https://www.pinterest.com/pin-creation-tool/"
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Pinterest Pin Publisher</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Canvas Helper: Draw Rounded Rectangle
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Canvas Helper: Draw image with object-fit cover inside rounded rectangle
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
) {
  ctx.save();
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();

  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;
  if (!imgW || !imgH) {
    ctx.restore();
    return;
  }

  const imgAspect = imgW / imgH;
  const boxAspect = w / h;

  let renderW = w;
  let renderH = h;
  let offsetX = x;
  let offsetY = y;

  if (imgAspect > boxAspect) {
    renderH = h;
    renderW = h * imgAspect;
    offsetX = x - (renderW - w) / 2;
  } else {
    renderW = w;
    renderH = w / imgAspect;
    offsetY = y - (renderH - h) / 2;
  }

  ctx.drawImage(img, offsetX, offsetY, renderW, renderH);
  ctx.restore();
}

// Canvas Helper: Wrap text into lines
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = words[0] || "";

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + " " + word).width;
    if (width < maxWidth) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

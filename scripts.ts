import { generateJigOpenSCAD, downloadOpenSCAD } from './jig-generator.js';

interface FrameParams {
  windowWidth: number;
  windowHeight: number;
  idealSpacing: number;
  holeDiameter: number; // in mm
  archedTop: boolean;
  archHeight: number; // in inches
}

interface SavedConfig {
  name: string;
  params: FrameParams;
  timestamp: number;
}

interface SideCalculation {
  numLeds: number;
  actualSpacing: number;
}

interface FrameCalculations {
  horizontal: SideCalculation;
  vertical: SideCalculation;
  arch?: ArchCalculation;
  totalLeds: number;
}

interface ArchCalculation {
  radius: number;
  numLeds: number;
  arcLength: number;
  actualSpacing: number;
  cornerAngle: number; // in degrees
}

const CORNER_SIZE = 1; // 1 inch corner pieces

// C9 Christmas light colors
const C9_COLORS = [
  { base: '#ff0000', glow: '#ff6666', name: 'red' },      // Red
  { base: '#ff8800', glow: '#ffbb66', name: 'orange' },   // Orange
  { base: '#ffdd00', glow: '#ffee88', name: 'yellow' },   // Yellow
  { base: '#00ff00', glow: '#66ff66', name: 'green' },    // Green
  { base: '#0088ff', glow: '#66bbff', name: 'blue' },     // Blue
  { base: '#ffffff', glow: '#ffffff', name: 'white' },    // White
];

interface LED {
  x: number;
  y: number;
  color: typeof C9_COLORS[0];
  brightness: number;
  twinkleSpeed: number;
  twinkleOffset: number;
}

let ledPositions: LED[] = [];
let animationId: number | null = null;

function decimalToFraction(decimal: number, denominator: number = 8): string {
  const wholeNumber = Math.floor(decimal);
  const fractionalPart = decimal - wholeNumber;

  // Round to nearest eighth
  const numerator = Math.round(fractionalPart * denominator);

  // Simplify the fraction
  if (numerator === 0) {
    return wholeNumber === 0 ? '0' : `${wholeNumber}`;
  }

  if (numerator === denominator) {
    return `${wholeNumber + 1}`;
  }

  // Simplify common fractions
  let simplifiedNum = numerator;
  let simplifiedDenom = denominator;

  // Find GCD
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(numerator, denominator);

  simplifiedNum = numerator / divisor;
  simplifiedDenom = denominator / divisor;

  if (wholeNumber === 0) {
    return `${simplifiedNum}/${simplifiedDenom}`;
  }

  return `${wholeNumber} ${simplifiedNum}/${simplifiedDenom}`;
}

function calculateSide(length: number, idealSpacing: number): SideCalculation {
  // Distance from center of one corner hole to center of opposite corner hole
  const availableLength = length - CORNER_SIZE;

  // Calculate number of segments (spaces between LEDs)
  const numSegments = Math.round(availableLength / idealSpacing);

  // Ensure at least 1 segment (2 LEDs minimum - the corners)
  const actualSegments = Math.max(1, numSegments);

  // Calculate actual spacing
  const actualSpacing = availableLength / actualSegments;

  // Number of LEDs = segments + 1 (includes both corner LEDs)
  const numLeds = actualSegments + 1;

  return {
    numLeds,
    actualSpacing
  };
}

function calculateArch(width: number, archHeight: number, idealSpacing: number): ArchCalculation {
  // Calculate radius of circular arc using the formula for a circular segment
  // r = (c²/4 + h²) / (2h)
  // where c = chord length (width), h = sagitta (arch height)

  const chord = width - CORNER_SIZE; // Distance between corner centers
  const sagitta = archHeight;

  const radius = (Math.pow(chord, 2) / 4 + Math.pow(sagitta, 2)) / (2 * sagitta);

  // Calculate the central angle (in radians) using the relationship:
  // sin(θ/2) = (c/2) / r
  const halfAngle = Math.asin((chord / 2) / radius);
  const centralAngle = halfAngle * 2;

  // Arc length
  const arcLength = radius * centralAngle;

  // Calculate number of LEDs and spacing along the arc
  const numSegments = Math.round(arcLength / idealSpacing);
  const actualSegments = Math.max(1, numSegments);
  const actualSpacing = arcLength / actualSegments;
  const numLeds = actualSegments + 1; // includes both ends

  // Calculate corner angle (angle between vertical side and the tangent to the arc at the corner)
  // This is the angle the corner piece needs to be cut at
  const cornerAngle = 90 - (halfAngle * 180 / Math.PI); // Convert to degrees

  return {
    radius,
    numLeds,
    arcLength,
    actualSpacing,
    cornerAngle
  };
}

function calculateFrame(params: FrameParams): FrameCalculations {
  const horizontal = calculateSide(params.windowWidth, params.idealSpacing);
  const vertical = calculateSide(params.windowHeight, params.idealSpacing);

  let arch: ArchCalculation | undefined;
  let totalLeds: number;

  if (params.archedTop) {
    arch = calculateArch(params.windowWidth, params.archHeight, params.idealSpacing);
    // Total LEDs = arch + bottom + left + right - 4 corners (counted twice)
    totalLeds = arch.numLeds + horizontal.numLeds + (vertical.numLeds * 2) - 4;
  } else {
    // Total LEDs = top + bottom + left + right - 4 corners (counted twice)
    totalLeds = (horizontal.numLeds * 2) + (vertical.numLeds * 2) - 4;
  }

  return {
    horizontal,
    vertical,
    arch,
    totalLeds
  };
}

function updateResults(params: FrameParams, calculations: FrameCalculations) {
  const inchToMm = 25.4;

  // Helper to format spacing with both units
  const formatSpacing = (inches: number): string => {
    const fraction = decimalToFraction(inches);
    const mm = inches * inchToMm;
    return `${fraction}" / ${mm.toFixed(1)}mm`;
  };

  // Helper to create a side section
  const createSideSection = (title: string, leds: number, spacing: number, length: number, pipeCut: number): string => {
    return `
      <div class="side-section">
        <h3>${title}</h3>
        <div class="side-stats">
          <div class="stat-row">
            <span class="stat-label">LEDs:</span>
            <span class="stat-value">${leds}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Spacing:</span>
            <span class="stat-value stat-dual">${formatSpacing(spacing)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Length:</span>
            <span class="stat-value stat-dual">${formatSpacing(length)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Pipe Cut:</span>
            <span class="stat-value stat-dual">${formatSpacing(pipeCut)}</span>
          </div>
        </div>
      </div>
    `;
  };

  const container = document.getElementById('statsContainer')!;

  if (params.archedTop && calculations.arch) {
    // Show separate sections for arch top
    const archPipeCut = calculations.arch.arcLength - (2 * CORNER_SIZE);
    const bottomPipeCut = params.windowWidth - (2 * CORNER_SIZE);
    const sidePipeCut = params.windowHeight - (2 * CORNER_SIZE);

    container.innerHTML = `
      ${createSideSection('Top Arch', calculations.arch.numLeds, calculations.arch.actualSpacing, calculations.arch.arcLength, archPipeCut)}
      ${createSideSection('Bottom', calculations.horizontal.numLeds, calculations.horizontal.actualSpacing, params.windowWidth, bottomPipeCut)}
      ${createSideSection('Left', calculations.vertical.numLeds, calculations.vertical.actualSpacing, params.windowHeight, sidePipeCut)}
      ${createSideSection('Right', calculations.vertical.numLeds, calculations.vertical.actualSpacing, params.windowHeight, sidePipeCut)}
    `;

    // Show corner angle info
    document.getElementById('cornerAngleInfo')!.style.display = 'block';
    document.getElementById('cornerAngle')!.textContent = `${calculations.arch.cornerAngle.toFixed(1)}°`;

    // Calculate and display arch pipe length
    const archLengthFraction = decimalToFraction(calculations.arch.arcLength);
    const archLengthMm = calculations.arch.arcLength * inchToMm;
    document.getElementById('archPipeLength')!.textContent = `${archLengthFraction}" / ${archLengthMm.toFixed(2)}mm`;
  } else {
    // Group top/bottom and left/right together
    const horizontalPipeCut = params.windowWidth - (2 * CORNER_SIZE);
    const verticalPipeCut = params.windowHeight - (2 * CORNER_SIZE);

    container.innerHTML = `
      ${createSideSection('Top / Bottom', calculations.horizontal.numLeds, calculations.horizontal.actualSpacing, params.windowWidth, horizontalPipeCut)}
      ${createSideSection('Left / Right', calculations.vertical.numLeds, calculations.vertical.actualSpacing, params.windowHeight, verticalPipeCut)}
    `;

    // Hide corner angle info
    document.getElementById('cornerAngleInfo')!.style.display = 'none';
  }

  document.getElementById('totalLeds')!.textContent = calculations.totalLeds.toString();

  // Update jig download buttons
  updateJigButtons(params, calculations);
}

function updateJigButtons(params: FrameParams, calculations: FrameCalculations) {
  const container = document.getElementById('jigButtons');
  if (!container) return;

  container.innerHTML = '';

  const jigs: Array<{name: string, spacing: number, label: string}> = [];

  // Add horizontal jig (top/bottom)
  if (calculations.horizontal.numLeds > 1) {
    jigs.push({
      name: 'Horizontal',
      spacing: calculations.horizontal.actualSpacing,
      label: 'Top/Bottom'
    });
  }

  // Add vertical jig (left/right)
  if (calculations.vertical.numLeds > 1) {
    jigs.push({
      name: 'Vertical',
      spacing: calculations.vertical.actualSpacing,
      label: 'Left/Right'
    });
  }

  // Add arch jig if applicable
  if (params.archedTop && calculations.arch && calculations.arch.numLeds > 1) {
    jigs.push({
      name: 'Arch',
      spacing: calculations.arch.actualSpacing,
      label: 'Arch'
    });
  }

  // Create unique jigs (in case horizontal and vertical are the same)
  const uniqueJigs: {[key: string]: typeof jigs[0]} = {};
  jigs.forEach(jig => {
    const key = jig.spacing.toFixed(4);
    if (!uniqueJigs[key]) {
      uniqueJigs[key] = jig;
    } else {
      // Combine labels if spacing is the same
      uniqueJigs[key].label += '/' + jig.label;
    }
  });

  // Create buttons for each unique jig
  for (const key in uniqueJigs) {
    const jig = uniqueJigs[key];
    const button = document.createElement('button');
    button.className = 'btn-jig';

    const spacingFraction = decimalToFraction(jig.spacing);
    const spacingMm = jig.spacing * 25.4;

    button.innerHTML = `
      <div class="jig-label">${jig.label} Jig</div>
      <div class="jig-spacing">${spacingFraction}" (${spacingMm.toFixed(2)}mm)</div>
    `;

    button.addEventListener('click', () => {
      const scad = generateJigOpenSCAD(jig.spacing, `${jig.label} Jig`);
      const filename = `LED_Jig_${jig.label.replace(/\//g, '_')}_${spacingFraction.replace(/[^0-9]/g, '_')}_${spacingMm.toFixed(1)}mm.scad`;
      downloadOpenSCAD(scad, filename);
    });

    container.appendChild(button);
  }
}

function setupLEDPositions(params: FrameParams, calculations: FrameCalculations, scale: number, offsetX: number, offsetY: number, cornerSize: number) {
  ledPositions = [];
  let colorIndex = 0;

  const topY = offsetY + cornerSize / 2;
  const startX = offsetX + cornerSize / 2;
  const bottomY = offsetY + params.windowHeight * scale - cornerSize / 2;
  const leftX = offsetX + cornerSize / 2;
  const startY = offsetY + cornerSize / 2;
  const rightX = offsetX + params.windowWidth * scale - cornerSize / 2;

  // Top side LEDs (or arch)
  if (params.archedTop && calculations.arch) {
    const arch = calculations.arch;
    const chord = params.windowWidth - CORNER_SIZE;
    const centerX = offsetX + params.windowWidth * scale / 2;

    // The top of the rectangular part is at offsetY
    const rectTopY = offsetY;

    // Calculate the center of the circle for the arch
    const centerY = rectTopY + (arch.radius - params.archHeight) * scale;

    // Calculate the start and end angles
    const halfAngle = Math.asin((chord / 2) / arch.radius);
    const startAngle = Math.PI / 2 + halfAngle; // Left corner
    const endAngle = Math.PI / 2 - halfAngle;   // Right corner

    // Place LEDs along the arc (going from left to right)
    for (let i = 0; i < arch.numLeds; i++) {
      const t = i / (arch.numLeds - 1); // 0 to 1
      // Interpolate angle from startAngle to endAngle
      const angle = startAngle + t * (endAngle - startAngle);
      const x = centerX + arch.radius * scale * Math.cos(angle);
      const y = centerY - arch.radius * scale * Math.sin(angle);

      ledPositions.push({
        x,
        y,
        color: C9_COLORS[colorIndex % C9_COLORS.length],
        brightness: 1,
        twinkleSpeed: 0.5 + Math.random() * 1.5,
        twinkleOffset: Math.random() * Math.PI * 2
      });
      colorIndex++;
    }
  } else {
    // Straight top
    for (let i = 0; i < calculations.horizontal.numLeds; i++) {
      const x = startX + (i * calculations.horizontal.actualSpacing * scale);
      ledPositions.push({
        x,
        y: topY,
        color: C9_COLORS[colorIndex % C9_COLORS.length],
        brightness: 1,
        twinkleSpeed: 0.5 + Math.random() * 1.5,
        twinkleOffset: Math.random() * Math.PI * 2
      });
      colorIndex++;
    }
  }

  // Right side LEDs (excluding top-right corner)
  for (let i = 1; i < calculations.vertical.numLeds; i++) {
    const y = startY + (i * calculations.vertical.actualSpacing * scale);
    ledPositions.push({
      x: rightX,
      y,
      color: C9_COLORS[colorIndex % C9_COLORS.length],
      brightness: 1,
      twinkleSpeed: 0.5 + Math.random() * 1.5,
      twinkleOffset: Math.random() * Math.PI * 2
    });
    colorIndex++;
  }

  // Bottom side LEDs (excluding bottom-right corner, going right to left)
  for (let i = calculations.horizontal.numLeds - 1; i >= 0; i--) {
    const x = startX + (i * calculations.horizontal.actualSpacing * scale);
    if (i === calculations.horizontal.numLeds - 1) continue; // Skip corner
    ledPositions.push({
      x,
      y: bottomY,
      color: C9_COLORS[colorIndex % C9_COLORS.length],
      brightness: 1,
      twinkleSpeed: 0.5 + Math.random() * 1.5,
      twinkleOffset: Math.random() * Math.PI * 2
    });
    colorIndex++;
  }

  // Left side LEDs (excluding both corners, going bottom to top)
  for (let i = calculations.vertical.numLeds - 1; i > 0; i--) {
    const y = startY + (i * calculations.vertical.actualSpacing * scale);
    ledPositions.push({
      x: leftX,
      y,
      color: C9_COLORS[colorIndex % C9_COLORS.length],
      brightness: 1,
      twinkleSpeed: 0.5 + Math.random() * 1.5,
      twinkleOffset: Math.random() * Math.PI * 2
    });
    colorIndex++;
  }
}

function drawFrame(params: FrameParams, calculations: FrameCalculations, timestamp: number = 0) {
  const canvas = document.getElementById('frameCanvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;

  // Set canvas size
  const maxCanvasWidth = canvas.parentElement!.clientWidth - 40;
  const maxCanvasHeight = 600;

  // Calculate total height including arch if present
  const totalHeight = params.archedTop ? params.windowHeight + params.archHeight : params.windowHeight;

  // Calculate scale to fit canvas
  const scaleX = maxCanvasWidth / (params.windowWidth + 4);
  const scaleY = maxCanvasHeight / (totalHeight + 4);
  const scale = Math.min(scaleX, scaleY);

  // Update scale info (only once)
  if (timestamp === 0) {
    document.getElementById('scaleInfo')!.textContent = `1:${(1/scale).toFixed(2)}`;
  }

  // Canvas dimensions
  const canvasWidth = (params.windowWidth + 4) * scale;
  const canvasHeight = (totalHeight + 4) * scale;

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  // Clear canvas with dark background for better light effect
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Center the frame - adjust Y offset if arched to make room for arch at top
  const offsetX = 2 * scale;
  const offsetY = params.archedTop ? (2 + params.archHeight) * scale : 2 * scale;

  // Draw frame outline
  ctx.strokeStyle = '#34495e';
  ctx.lineWidth = 2;

  if (params.archedTop && calculations.arch) {
    const arch = calculations.arch;
    const chord = params.windowWidth - CORNER_SIZE;
    const centerX = offsetX + params.windowWidth * scale / 2;

    // The top of the rectangular part
    const rectTopY = offsetY;

    // Calculate center of circle for the arch
    // The center is BELOW the top of the arch (since we're drawing the top part of a circle)
    const centerY = rectTopY - (arch.radius - params.archHeight) * scale;

    const halfAngle = Math.asin((chord / 2) / arch.radius);

    // For an arch at the top, we want angles in the lower hemisphere
    // 270 degrees (3π/2) is pointing down
    const startAngle = (3 * Math.PI / 2) - halfAngle; // Left corner
    const endAngle = (3 * Math.PI / 2) + halfAngle;   // Right corner

    // Draw left side
    ctx.beginPath();
    ctx.moveTo(offsetX, rectTopY);
    ctx.lineTo(offsetX, offsetY + params.windowHeight * scale);
    ctx.stroke();

    // Draw bottom
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY + params.windowHeight * scale);
    ctx.lineTo(offsetX + params.windowWidth * scale, offsetY + params.windowHeight * scale);
    ctx.stroke();

    // Draw right side
    ctx.beginPath();
    ctx.moveTo(offsetX + params.windowWidth * scale, offsetY + params.windowHeight * scale);
    ctx.lineTo(offsetX + params.windowWidth * scale, rectTopY);
    ctx.stroke();

    // Draw arched top
    ctx.beginPath();
    ctx.arc(centerX, centerY, arch.radius * scale, startAngle, endAngle);
    ctx.stroke();
  } else {
    // Draw rectangular frame
    ctx.strokeRect(
      offsetX,
      offsetY,
      params.windowWidth * scale,
      params.windowHeight * scale
    );
  }

  // Convert hole diameter from mm to inches (1 inch = 25.4mm)
  const holeDiameterInches = params.holeDiameter / 25.4;
  const holeRadius = (holeDiameterInches * scale) / 2;

  // Draw corner pieces
  ctx.fillStyle = '#2c3e50';
  ctx.strokeStyle = '#34495e';
  ctx.lineWidth = 1;

  const cornerSize = CORNER_SIZE * scale;
  const corners = [
    { x: offsetX, y: offsetY }, // Top-left
    { x: offsetX + params.windowWidth * scale - cornerSize, y: offsetY }, // Top-right
    { x: offsetX, y: offsetY + params.windowHeight * scale - cornerSize }, // Bottom-left
    { x: offsetX + params.windowWidth * scale - cornerSize, y: offsetY + params.windowHeight * scale - cornerSize } // Bottom-right
  ];

  corners.forEach(corner => {
    ctx.fillRect(corner.x, corner.y, cornerSize, cornerSize);
    ctx.strokeRect(corner.x, corner.y, cornerSize, cornerSize);
  });

  // Setup LED positions if not already done or if parameters changed
  if (ledPositions.length === 0) {
    setupLEDPositions(params, calculations, scale, offsetX, offsetY, cornerSize);
  }

  // Draw animated LEDs
  const time = timestamp / 1000; // Convert to seconds

  ledPositions.forEach((led, index) => {
    // Calculate twinkle effect
    const twinkle = 0.7 + 0.3 * Math.sin(time * led.twinkleSpeed + led.twinkleOffset);

    // Draw glow
    const gradient = ctx.createRadialGradient(led.x, led.y, 0, led.x, led.y, holeRadius * 2.5);
    const alphaHex = Math.floor(twinkle * 255).toString(16);
    const paddedAlpha = alphaHex.length === 1 ? '0' + alphaHex : alphaHex;
    gradient.addColorStop(0, led.color.glow + paddedAlpha);
    gradient.addColorStop(0.4, led.color.glow + '88');
    gradient.addColorStop(1, led.color.glow + '00');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(led.x, led.y, holeRadius * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Draw LED bulb
    ctx.fillStyle = led.color.base;
    ctx.globalAlpha = twinkle;
    ctx.beginPath();
    ctx.arc(led.x, led.y, holeRadius, 0, Math.PI * 2);
    ctx.fill();

    // Draw bulb outline
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Helper function to draw text with background
  const drawTextWithBackground = (text: string, x: number, y: number, fontSize: number = 16) => {
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize;
    const padding = 6;

    // Draw background
    ctx.fillStyle = 'rgba(26, 26, 46, 0.95)';
    ctx.fillRect(
      x - textWidth / 2 - padding,
      y - textHeight / 2 - padding / 2,
      textWidth + padding * 2,
      textHeight + padding
    );

    // Draw border
    ctx.strokeStyle = '#52c7ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      x - textWidth / 2 - padding,
      y - textHeight / 2 - padding / 2,
      textWidth + padding * 2,
      textHeight + padding
    );

    // Draw text
    ctx.fillStyle = '#52c7ff';
    ctx.fillText(text, x, y);
  };

  // Helper function to draw spacing indicator between LEDs
  const drawSpacingIndicator = (x1: number, y1: number, x2: number, y2: number, spacing: number, isVertical: boolean = false) => {
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);

    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    if (isVertical) {
      // Vertical spacing indicator
      const offset = 25;
      ctx.beginPath();
      ctx.moveTo(x1 - offset, y1);
      ctx.lineTo(x1 + offset, y1);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1, y2);
      ctx.moveTo(x1 - offset, y2);
      ctx.lineTo(x1 + offset, y2);
      ctx.stroke();

      // Draw spacing text
      ctx.save();
      ctx.translate(x1 - offset - 20, midY);
      ctx.rotate(-Math.PI / 2);
      const spacingFraction = decimalToFraction(spacing);
      const spacingMm = spacing * 25.4;
      drawTextWithBackground(`${spacingFraction}" / ${spacingMm.toFixed(1)}mm`, 0, 0, 12);
      ctx.restore();
    } else {
      // Horizontal spacing indicator
      const offset = 25;
      ctx.beginPath();
      ctx.moveTo(x1, y1 + offset);
      ctx.lineTo(x1, y1 - offset);
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.moveTo(x2, y2 + offset);
      ctx.lineTo(x2, y2 - offset);
      ctx.stroke();

      // Draw spacing text
      const spacingFraction = decimalToFraction(spacing);
      const spacingMm = spacing * 25.4;
      drawTextWithBackground(`${spacingFraction}" / ${spacingMm.toFixed(1)}mm`, midX, midY + offset + 20, 12);
    }

    ctx.setLineDash([]);
  };

  // Draw measurements for all sides
  const topY = offsetY + cornerSize / 2;
  const startX = offsetX + cornerSize / 2;
  const startY = offsetY + cornerSize / 2;
  const leftX = offsetX + cornerSize / 2;
  const bottomY = offsetY + params.windowHeight * scale - cornerSize / 2;
  const rightX = offsetX + params.windowWidth * scale - cornerSize / 2;

  ctx.globalAlpha = 1;

  // Top/Arch measurements (inside the frame)
  if (params.archedTop && calculations.arch) {
    const archPipeCut = calculations.arch.arcLength - (2 * CORNER_SIZE);
    const archLengthFraction = decimalToFraction(archPipeCut);
    const archLengthMm = archPipeCut * 25.4;
    const centerX = offsetX + params.windowWidth * scale / 2;
    const measureY = offsetY + 60;

    drawTextWithBackground(
      `${calculations.arch.numLeds} LEDs`,
      centerX,
      measureY,
      14
    );

    drawTextWithBackground(
      `Arch: ${archLengthFraction}" (${archLengthMm.toFixed(1)}mm)`,
      centerX,
      measureY + 30,
      12
    );

    // Draw spacing indicator between first two LEDs on arch
    if (calculations.arch.numLeds > 1 && ledPositions.length >= 2) {
      const led1 = ledPositions[0];
      const led2 = ledPositions[1];
      drawSpacingIndicator(led1.x, led1.y, led2.x, led2.y, calculations.arch.actualSpacing);
    }
  } else {
    // Top side measurement (inside)
    const centerX = offsetX + params.windowWidth * scale / 2;
    const measureY = topY + 50;
    const topLengthFraction = decimalToFraction(params.windowWidth - (2 * CORNER_SIZE));
    const topLengthMm = (params.windowWidth - (2 * CORNER_SIZE)) * 25.4;

    drawTextWithBackground(
      `${calculations.horizontal.numLeds} LEDs`,
      centerX,
      measureY,
      14
    );

    drawTextWithBackground(
      `Top: ${topLengthFraction}" (${topLengthMm.toFixed(1)}mm)`,
      centerX,
      measureY + 30,
      12
    );

    // Draw spacing indicator between first two LEDs on top
    if (calculations.horizontal.numLeds > 1 && ledPositions.length >= 2) {
      const led1 = ledPositions[0];
      const led2 = ledPositions[1];
      drawSpacingIndicator(led1.x, led1.y, led2.x, led2.y, calculations.horizontal.actualSpacing);
    }
  }

  // Bottom side measurement (inside)
  const bottomCenterX = offsetX + params.windowWidth * scale / 2;
  const bottomMeasureY = bottomY - 50;
  const bottomLengthFraction = decimalToFraction(params.windowWidth - (2 * CORNER_SIZE));
  const bottomLengthMm = (params.windowWidth - (2 * CORNER_SIZE)) * 25.4;

  drawTextWithBackground(
    `Bottom: ${bottomLengthFraction}" (${bottomLengthMm.toFixed(1)}mm)`,
    bottomCenterX,
    bottomMeasureY,
    12
  );

  // Draw spacing indicator on bottom (find first two LEDs on bottom side)
  if (calculations.horizontal.numLeds > 1) {
    // Find LEDs on the bottom (y coordinate close to bottomY)
    const bottomLEDs = ledPositions.filter(led => Math.abs(led.y - bottomY) < 5);
    if (bottomLEDs.length >= 2) {
      drawSpacingIndicator(bottomLEDs[0].x, bottomLEDs[0].y, bottomLEDs[1].x, bottomLEDs[1].y, calculations.horizontal.actualSpacing);
    }
  }

  // Left side measurement (inside)
  ctx.save();
  const leftCenterY = offsetY + params.windowHeight * scale / 2;
  const leftMeasureX = leftX + 70;
  const leftLengthFraction = decimalToFraction(params.windowHeight - (2 * CORNER_SIZE));
  const leftLengthMm = (params.windowHeight - (2 * CORNER_SIZE)) * 25.4;

  ctx.translate(leftMeasureX, leftCenterY);
  ctx.rotate(-Math.PI / 2);
  drawTextWithBackground(
    `Left: ${leftLengthFraction}" (${leftLengthMm.toFixed(1)}mm)`,
    0,
    0,
    12
  );
  ctx.restore();

  // Draw spacing indicator on left (find first two LEDs on left side)
  if (calculations.vertical.numLeds > 1) {
    const leftLEDs = ledPositions.filter(led => Math.abs(led.x - leftX) < 5);
    if (leftLEDs.length >= 2) {
      // Sort by Y to get consecutive LEDs
      leftLEDs.sort((a, b) => a.y - b.y);
      drawSpacingIndicator(leftLEDs[0].x, leftLEDs[0].y, leftLEDs[1].x, leftLEDs[1].y, calculations.vertical.actualSpacing, true);
    }
  }

  // Right side measurement (inside)
  ctx.save();
  const rightCenterY = offsetY + params.windowHeight * scale / 2;
  const rightMeasureX = rightX - 70;
  const rightLengthFraction = decimalToFraction(params.windowHeight - (2 * CORNER_SIZE));
  const rightLengthMm = (params.windowHeight - (2 * CORNER_SIZE)) * 25.4;

  ctx.translate(rightMeasureX, rightCenterY);
  ctx.rotate(-Math.PI / 2);
  drawTextWithBackground(
    `Right: ${rightLengthFraction}" (${rightLengthMm.toFixed(1)}mm)`,
    0,
    0,
    12
  );
  ctx.restore();

  ctx.globalAlpha = 1;
}

let currentParams: FrameParams;
let currentCalculations: FrameCalculations;

const STORAGE_KEY = 'led-frame-configs';

function loadConfigsFromStorage(): SavedConfig[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error('Error loading configs:', e);
    return [];
  }
}

function saveConfigsToStorage(configs: SavedConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
}

function updateConfigSelector() {
  const select = document.getElementById('savedConfigs') as HTMLSelectElement;
  const configs = loadConfigsFromStorage();

  // Clear existing options
  select.innerHTML = '';

  if (configs.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.disabled = true;
    option.textContent = 'No saved configs';
    select.appendChild(option);
  } else {
    configs.forEach((config, index) => {
      const option = document.createElement('option');
      option.value = index.toString();
      option.textContent = `${config.name} (${new Date(config.timestamp).toLocaleDateString()})`;
      select.appendChild(option);
    });
  }
}

function saveCurrentConfig() {
  const nameInput = document.getElementById('configName') as HTMLInputElement;
  const name = nameInput.value.trim();

  if (!name) {
    alert('Please enter a config name');
    return;
  }

  const configs = loadConfigsFromStorage();

  // Check if name already exists
  let existingIndex = -1;
  for (let i = 0; i < configs.length; i++) {
    if (configs[i].name === name) {
      existingIndex = i;
      break;
    }
  }

  const newConfig: SavedConfig = {
    name,
    params: currentParams,
    timestamp: Date.now()
  };

  if (existingIndex >= 0) {
    // Update existing
    if (confirm(`Config "${name}" already exists. Overwrite?`)) {
      configs[existingIndex] = newConfig;
    } else {
      return;
    }
  } else {
    // Add new
    configs.push(newConfig);
  }

  saveConfigsToStorage(configs);
  updateConfigSelector();
  alert(`Config "${name}" saved successfully!`);
}

function loadSelectedConfig() {
  const select = document.getElementById('savedConfigs') as HTMLSelectElement;
  const selectedIndex = parseInt(select.value);

  if (isNaN(selectedIndex)) return;

  const configs = loadConfigsFromStorage();
  const config = configs[selectedIndex];

  if (!config) return;

  // Update input fields
  (document.getElementById('windowWidth') as HTMLInputElement).value = config.params.windowWidth.toString();
  (document.getElementById('windowHeight') as HTMLInputElement).value = config.params.windowHeight.toString();
  (document.getElementById('idealSpacing') as HTMLInputElement).value = config.params.idealSpacing.toString();
  (document.getElementById('holeDiameter') as HTMLInputElement).value = config.params.holeDiameter.toString();
  (document.getElementById('archedTop') as HTMLInputElement).checked = config.params.archedTop || false;
  (document.getElementById('archHeight') as HTMLInputElement).value = (config.params.archHeight || 10).toString();
  (document.getElementById('configName') as HTMLInputElement).value = config.name;

  // Toggle arch height visibility
  toggleArchHeightInput();

  // Trigger update
  update();
}

function deleteSelectedConfig() {
  const select = document.getElementById('savedConfigs') as HTMLSelectElement;
  const selectedIndex = parseInt(select.value);

  if (isNaN(selectedIndex)) {
    alert('Please select a config to delete');
    return;
  }

  const configs = loadConfigsFromStorage();
  const config = configs[selectedIndex];

  if (!config) return;

  if (confirm(`Delete config "${config.name}"?`)) {
    configs.splice(selectedIndex, 1);
    saveConfigsToStorage(configs);
    updateConfigSelector();
    (document.getElementById('configName') as HTMLInputElement).value = '';
  }
}

function update() {
  currentParams = {
    windowWidth: parseFloat((document.getElementById('windowWidth') as HTMLInputElement).value),
    windowHeight: parseFloat((document.getElementById('windowHeight') as HTMLInputElement).value),
    idealSpacing: parseFloat((document.getElementById('idealSpacing') as HTMLInputElement).value),
    holeDiameter: parseFloat((document.getElementById('holeDiameter') as HTMLInputElement).value),
    archedTop: (document.getElementById('archedTop') as HTMLInputElement).checked,
    archHeight: parseFloat((document.getElementById('archHeight') as HTMLInputElement).value)
  };

  currentCalculations = calculateFrame(currentParams);
  updateResults(currentParams, currentCalculations);

  // Reset LED positions when parameters change
  ledPositions = [];

  // Cancel existing animation
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
  }

  // Start new animation
  animate(0);
}

function animate(timestamp: number) {
  drawFrame(currentParams, currentCalculations, timestamp);
  animationId = requestAnimationFrame(animate);
}

function toggleArchHeightInput() {
  const archedTop = (document.getElementById('archedTop') as HTMLInputElement).checked;
  const archHeightGroup = document.getElementById('archHeightGroup');
  if (archHeightGroup) {
    archHeightGroup.style.display = archedTop ? 'block' : 'none';
  }
}

// Add event listeners
document.getElementById('windowWidth')?.addEventListener('input', update);
document.getElementById('windowHeight')?.addEventListener('input', update);
document.getElementById('idealSpacing')?.addEventListener('input', update);
document.getElementById('holeDiameter')?.addEventListener('input', update);
document.getElementById('archedTop')?.addEventListener('change', () => {
  toggleArchHeightInput();
  update();
});
document.getElementById('archHeight')?.addEventListener('input', update);

// Config management event listeners
document.getElementById('saveConfig')?.addEventListener('click', saveCurrentConfig);
document.getElementById('deleteConfig')?.addEventListener('click', deleteSelectedConfig);
document.getElementById('savedConfigs')?.addEventListener('change', loadSelectedConfig);

// Handle window resize
window.addEventListener('resize', () => {
  ledPositions = [];
  if (currentParams && currentCalculations) {
    drawFrame(currentParams, currentCalculations, performance.now());
  }
});

// Initial render
updateConfigSelector();
update();


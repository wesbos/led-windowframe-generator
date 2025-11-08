interface FrameParams {
  windowWidth: number;
  windowHeight: number;
  idealSpacing: number;
  holeDiameter: number; // in mm
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
  totalLeds: number;
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

function calculateFrame(params: FrameParams): FrameCalculations {
  const horizontal = calculateSide(params.windowWidth, params.idealSpacing);
  const vertical = calculateSide(params.windowHeight, params.idealSpacing);

  // Total LEDs = top + bottom + left + right - 4 corners (counted twice)
  const totalLeds = (horizontal.numLeds * 2) + (vertical.numLeds * 2) - 4;

  return {
    horizontal,
    vertical,
    totalLeds
  };
}

function updateResults(params: FrameParams, calculations: FrameCalculations) {
  const inchToMm = 25.4;

  // Helper to format spacing with both units
  const formatSpacing = (inches: number): string => {
    const fraction = decimalToFraction(inches);
    const mm = inches * inchToMm;
    return `${fraction}" / ${mm.toFixed(2)}mm`;
  };

  // Update statistics
  document.getElementById('topLeds')!.textContent = calculations.horizontal.numLeds.toString();
  document.getElementById('topSpacing')!.textContent = formatSpacing(calculations.horizontal.actualSpacing);

  document.getElementById('bottomLeds')!.textContent = calculations.horizontal.numLeds.toString();
  document.getElementById('bottomSpacing')!.textContent = formatSpacing(calculations.horizontal.actualSpacing);

  document.getElementById('leftLeds')!.textContent = calculations.vertical.numLeds.toString();
  document.getElementById('leftSpacing')!.textContent = formatSpacing(calculations.vertical.actualSpacing);

  document.getElementById('rightLeds')!.textContent = calculations.vertical.numLeds.toString();
  document.getElementById('rightSpacing')!.textContent = formatSpacing(calculations.vertical.actualSpacing);

  document.getElementById('totalLeds')!.textContent = calculations.totalLeds.toString();
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

  // Top side LEDs
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

  // Calculate scale to fit canvas
  const scaleX = maxCanvasWidth / (params.windowWidth + 4);
  const scaleY = maxCanvasHeight / (params.windowHeight + 4);
  const scale = Math.min(scaleX, scaleY);

  // Update scale info (only once)
  if (timestamp === 0) {
    document.getElementById('scaleInfo')!.textContent = `1:${(1/scale).toFixed(2)}`;
  }

  // Canvas dimensions
  const canvasWidth = (params.windowWidth + 4) * scale;
  const canvasHeight = (params.windowHeight + 4) * scale;

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  // Clear canvas with dark background for better light effect
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Center the frame
  const offsetX = 2 * scale;
  const offsetY = 2 * scale;

  // Draw frame outline
  ctx.strokeStyle = '#34495e';
  ctx.lineWidth = 2;
  ctx.strokeRect(
    offsetX,
    offsetY,
    params.windowWidth * scale,
    params.windowHeight * scale
  );

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

  // Draw spacing indicators on top side
  const topY = offsetY + cornerSize / 2;
  const startX = offsetX + cornerSize / 2;
  const startY = offsetY + cornerSize / 2;
  const leftX = offsetX + cornerSize / 2;

  if (calculations.horizontal.numLeds > 1) {
    ctx.strokeStyle = '#52c7ff';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.globalAlpha = 0.8;

    const y1 = topY + holeRadius + 10;
    const y2 = y1 + 20;
    const x1 = startX;
    const x2 = startX + calculations.horizontal.actualSpacing * scale;

    // Draw dimension line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1, y2);
    ctx.moveTo(x1, (y1 + y2) / 2);
    ctx.lineTo(x2, (y1 + y2) / 2);
    ctx.moveTo(x2, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Draw spacing text
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#52c7ff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    const horizontalMm = calculations.horizontal.actualSpacing * 25.4;
    const horizontalFraction = decimalToFraction(calculations.horizontal.actualSpacing);
    ctx.fillText(
      `${horizontalFraction}"`,
      (x1 + x2) / 2,
      (y1 + y2) / 2 - 10
    );
    ctx.font = '11px sans-serif';
    ctx.fillText(
      `${horizontalMm.toFixed(2)}mm`,
      (x1 + x2) / 2,
      (y1 + y2) / 2 + 5
    );

    ctx.setLineDash([]);
  }

  // Draw spacing indicators on left side
  if (calculations.vertical.numLeds > 1) {
    ctx.strokeStyle = '#52c7ff';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.globalAlpha = 0.8;

    const x1 = leftX - holeRadius - 10;
    const x2 = x1 - 20;
    const y1 = startY;
    const y2 = startY + calculations.vertical.actualSpacing * scale;

    // Draw dimension line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y1);
    ctx.moveTo((x1 + x2) / 2, y1);
    ctx.lineTo((x1 + x2) / 2, y2);
    ctx.moveTo(x1, y2);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Draw spacing text
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#52c7ff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.translate((x1 + x2) / 2 + 5, (y1 + y2) / 2);
    ctx.rotate(-Math.PI / 2);
    const verticalMm = calculations.vertical.actualSpacing * 25.4;
    const verticalFraction = decimalToFraction(calculations.vertical.actualSpacing);
    ctx.fillText(`${verticalFraction}"`, 0, -8);
    ctx.font = '11px sans-serif';
    ctx.fillText(`${verticalMm.toFixed(2)}mm`, 0, 5);
    ctx.restore();

    ctx.setLineDash([]);
  }

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
  (document.getElementById('configName') as HTMLInputElement).value = config.name;

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
    holeDiameter: parseFloat((document.getElementById('holeDiameter') as HTMLInputElement).value)
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

// Add event listeners
document.getElementById('windowWidth')?.addEventListener('input', update);
document.getElementById('windowHeight')?.addEventListener('input', update);
document.getElementById('idealSpacing')?.addEventListener('input', update);
document.getElementById('holeDiameter')?.addEventListener('input', update);

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


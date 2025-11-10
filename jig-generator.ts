// Generate OpenSCAD code for drilling jigs

export function generateJigOpenSCAD(spacing: number, jigName: string): string {
  // PVC ¾" pipe outer diameter = 1.05 inches = 26.67 mm
  const pipeOD = 26.67;
  const pipeRadius = pipeOD / 2;

  // Convert spacing from inches to mm
  const spacingMm = spacing * 25.4;

  // Jig parameters
  const jigWidth = 40; // mm
  const jigHeight = 30; // mm
  const holeDiameter = 12; // mm

  // Corner pieces are 1" x 1" with center hole at 0.5" from edge
  // The jig start offset accounts for the corner piece, so we subtract it from spacing
  // This way: corner hole (0.5") + jig start offset = full spacing distance
  const cornerHalfSize = 12.7; // mm (0.5 inches)
  const startOffset = spacingMm - cornerHalfSize; // mm from jig edge to first hole
  const endOffset = 10; // mm minimal margin at end to maximize holes

  // Calculate number of holes that fit (jig can be up to 240mm)
  // We want at least 2 holes if possible, up to whatever fits in 240mm
  const maxJigLength = 240;

  // Calculate how many holes can fit
  // Formula: startOffset + (numHoles - 1) * spacingMm + endOffset <= maxJigLength
  // Solving for numHoles: numHoles <= (maxJigLength - startOffset - endOffset) / spacingMm + 1
  const maxNumHoles = Math.floor((maxJigLength - startOffset - endOffset) / spacingMm) + 1;
  const numHoles = Math.max(2, maxNumHoles); // At least 2 holes for usefulness

  // Calculate actual jig length based on holes (may exceed 240mm if needed for 2 holes)
  const lastHolePosition = startOffset + (numHoles - 1) * spacingMm;
  const jigLength = lastHolePosition + endOffset;

  const holePositions: number[] = [];
  for (let i = 0; i < numHoles; i++) {
    holePositions.push(startOffset + i * spacingMm);
  }

  // Generate OpenSCAD code
  let scad = `// LED Drilling Jig - ${jigName}
// Generated for ${spacing.toFixed(4)}" (${spacingMm.toFixed(2)}mm) spacing
// ${numHoles} holes total
// OPEN-ENDED DESIGN - slides onto pipe from side

$fn = 60; // Smoothness of circles

// Parameters
jig_length = ${jigLength};
jig_width = ${jigWidth};
jig_height = ${jigHeight};
pipe_radius = ${pipeRadius.toFixed(2)};
hole_diameter = 6;
slot_width = ${(pipeOD).toFixed(2)}; // Slightly wider than pipe for easy sliding

// Main jig
difference() {
    // Start with solid block
    cube([jig_length, jig_width, jig_height], center=false);

    // Subtract pipe groove (semicircular channel)
    translate([0, jig_width/2, pipe_radius])
        rotate([0, 90, 0])
            cylinder(h=jig_length, r=pipe_radius);

    // Cut opening slot from bottom to allow sliding onto pipe
    // This makes it open-ended and printable without supports
    translate([-1, (jig_width - slot_width)/2, -1])
        cube([jig_length + 2, slot_width, pipe_radius + 2]);

    // Subtract marking holes (go all the way through)
`;

  // Add each hole (as rectangular slots for marking)
  holePositions.forEach((pos, idx) => {
    scad += `    // Hole ${idx + 1} at ${pos.toFixed(2)}mm\n`;
    scad += `    translate([${pos.toFixed(2)}, jig_width/2, jig_height])\n`;
    scad += `        cube([3, 20, 115], center=true);\n`;
    scad += `\n`;
  });

  scad += `}

// Add text label on side (optional)
translate([10, 0, jig_height/2])
    rotate([90, 0, 0])
        linear_extrude(height=.4)
            text("Pixel Spacing: ${spacing.toFixed(4)}\\" / ${spacingMm.toFixed(1)}mm", size=4, halign="left", valign="center");
`;

  return scad;
}

export function downloadOpenSCAD(scadContent: string, filename: string) {
  const blob = new Blob([scadContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


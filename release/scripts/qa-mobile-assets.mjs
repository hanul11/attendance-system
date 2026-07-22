import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = "firebase/public/assets/icons/icon-512.png";
const assetPaths = {
  icon: "mobile/resources/icon.png",
  foreground: "mobile/resources/icon-foreground.png",
  background: "mobile/resources/icon-background.png",
  splash: "mobile/resources/splash.png"
};
const failures = [];
const passes = [];

function check(name, condition, detail) {
  (condition ? passes : failures).push({ name, detail });
}

function readPng(relativePath) {
  const filePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(filePath)) {
    check(path.basename(relativePath), false, "Missing");
    return null;
  }

  const buffer = fs.readFileSync(filePath);
  const signature = "89504e470d0a1a0a";
  if (buffer.length < 33 || buffer.subarray(0, 8).toString("hex") !== signature) {
    check(path.basename(relativePath), false, "Invalid PNG signature");
    return null;
  }

  let offset = 8;
  let header;
  const compressed = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) {
      check(path.basename(relativePath), false, "Truncated PNG chunk");
      return null;
    }
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12]
      };
    }
    if (type === "IDAT") compressed.push(data);
    if (type === "IEND") break;
    offset = dataEnd + 4;
  }

  if (!header || header.bitDepth !== 8 || ![2, 6].includes(header.colorType) || header.interlace !== 0) {
    check(path.basename(relativePath), false, "PNG must be non-interlaced 8-bit RGB or RGBA");
    return null;
  }

  const bytesPerPixel = header.colorType === 6 ? 4 : 3;
  const rowLength = header.width * bytesPerPixel;
  const raw = zlib.inflateSync(Buffer.concat(compressed));
  if (raw.length !== header.height * (rowLength + 1)) {
    check(path.basename(relativePath), false, "Unexpected PNG scanline length");
    return null;
  }

  const pixels = Buffer.alloc(header.width * header.height * 4);
  let inputOffset = 0;
  let previous = Buffer.alloc(rowLength);
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[inputOffset++];
    const row = Buffer.alloc(rowLength);
    for (let x = 0; x < rowLength; x += 1) {
      const value = raw[inputOffset++];
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previous[x];
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      if (filter === 0) row[x] = value;
      else if (filter === 1) row[x] = (value + left) & 0xff;
      else if (filter === 2) row[x] = (value + up) & 0xff;
      else if (filter === 3) row[x] = (value + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        row[x] = (value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 0xff;
      } else {
        check(path.basename(relativePath), false, `Unsupported PNG filter ${filter}`);
        return null;
      }
    }
    for (let x = 0; x < header.width; x += 1) {
      const sourceOffset = x * bytesPerPixel;
      const targetOffset = (y * header.width + x) * 4;
      pixels[targetOffset] = row[sourceOffset];
      pixels[targetOffset + 1] = row[sourceOffset + 1];
      pixels[targetOffset + 2] = row[sourceOffset + 2];
      pixels[targetOffset + 3] = bytesPerPixel === 4 ? row[sourceOffset + 3] : 255;
    }
    previous = row;
  }
  return { ...header, pixels };
}

function pixelAt(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return image.pixels.subarray(offset, offset + 4);
}

function equalPixels(left, right) {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2] && left[3] === right[3];
}

function expectedSourcePixel(source, x, y, scale) {
  return pixelAt(source, Math.floor(x / scale), Math.floor(y / scale));
}

function checkDimensions(name, image, width, height) {
  check(`${name} dimensions`, image?.width === width && image?.height === height, image ? `${image.width}x${image.height}` : "Unavailable");
}

function checkScaledIcon(source, icon) {
  if (!source || !icon) return;
  let matches = true;
  for (let y = 0; y < icon.height && matches; y += 1) {
    for (let x = 0; x < icon.width; x += 1) {
      if (!equalPixels(pixelAt(icon, x, y), expectedSourcePixel(source, x, y, 2))) {
        matches = false;
        break;
      }
    }
  }
  check("iOS icon preserves the company symbol", matches, "Exact 2x nearest-neighbor source placement");
}

function flowerPalette(source, backgroundPixel) {
  const backgroundKey = backgroundPixel.subarray(0, 3).toString("hex");
  const counts = new Map();
  for (let offset = 0; offset < source.pixels.length; offset += 4) {
    const key = source.pixels.subarray(offset, offset + 3).toString("hex");
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([key, count]) => key !== backgroundKey && count >= 6000)
    .map(([key]) => Buffer.from(key, "hex"));
}

function unmattePixel(sourcePixel, backgroundPixel, palette) {
  if (equalPixels(sourcePixel, backgroundPixel)) return [0, 0, 0, 0];
  const sourceRgb = sourcePixel.subarray(0, 3);
  const backgroundRgb = backgroundPixel.subarray(0, 3);
  let best = null;
  for (const flowerRgb of palette) {
    const direction = [0, 1, 2].map((index) => flowerRgb[index] - backgroundRgb[index]);
    const offset = [0, 1, 2].map((index) => sourceRgb[index] - backgroundRgb[index]);
    const magnitude = direction.reduce((total, value) => total + value * value, 0);
    const alpha = Math.max(0, Math.min(1, offset.reduce((total, value, index) => total + value * direction[index], 0) / magnitude));
    const reconstructed = [0, 1, 2].map((index) => Math.round(backgroundRgb[index] * (1 - alpha) + flowerRgb[index] * alpha));
    const error = reconstructed.reduce((total, value, index) => total + (value - sourceRgb[index]) ** 2, 0);
    if (!best || error < best.error) best = { error, alpha, flowerRgb };
  }
  return [best.flowerRgb[0], best.flowerRgb[1], best.flowerRgb[2], Math.round(best.alpha * 255)];
}

function composite(pixel, background) {
  return [0, 1, 2].map((index) => Math.round((pixel[index] * pixel[3] + background[index] * (255 - pixel[3])) / 255));
}

function checkForeground(source, foreground, background) {
  if (!source || !foreground || !background) return;
  const backgroundPixel = pixelAt(source, 0, 0);
  const palette = flowerPalette(source, backgroundPixel);
  let transparentBackground = true;
  let symbolMatches = true;
  let semiTransparentPixels = 0;
  let opaqueNearWhitePixels = 0;
  let compositesMatch = true;
  let blackNearWhitePixels = 0;
  let minX = foreground.width;
  let minY = foreground.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < foreground.height; y += 1) {
    for (let x = 0; x < foreground.width; x += 1) {
      const expected = expectedSourcePixel(source, x, y, 2);
      const actual = pixelAt(foreground, x, y);
      const isBackground = equalPixels(expected, backgroundPixel);
      if (isBackground) {
        transparentBackground &&= actual[3] === 0;
      } else {
        const unmatte = unmattePixel(expected, backgroundPixel, palette);
        symbolMatches &&= actual[0] === unmatte[0] && actual[1] === unmatte[1] && actual[2] === unmatte[2] && actual[3] === unmatte[3];
        if (actual[3] > 0 && actual[3] < 255) semiTransparentPixels += 1;
        if (actual[3] === 255 && Math.min(actual[0], actual[1], actual[2]) >= 235) opaqueNearWhitePixels += 1;
        const black = composite(actual, [0, 0, 0]);
        const white = composite(actual, [255, 255, 255]);
        const expectedBlack = composite(unmatte, [0, 0, 0]);
        const expectedWhite = composite(unmatte, [255, 255, 255]);
        compositesMatch &&= black.every((value, index) => value === expectedBlack[index]) && white.every((value, index) => value === expectedWhite[index]);
        if (actual[3] < 255 && Math.min(...black) >= 235) blackNearWhitePixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  check("Adaptive foreground has transparent background", transparentBackground, "Original solid background pixels have alpha 0");
  check("Adaptive foreground preserves the company symbol", palette.length === 7 && symbolMatches, "Seven original flower core colors with background matte restored to alpha");
  check("Adaptive foreground has transparent antialiased edges", semiTransparentPixels > 0, `${semiTransparentPixels} semitransparent pixels`);
  check("Adaptive foreground has no opaque white matte", opaqueNearWhitePixels === 0, `${opaqueNearWhitePixels} nearly white opaque pixels`);
  check("Adaptive foreground has no black or white background halo", compositesMatch && blackNearWhitePixels === 0, `${blackNearWhitePixels} bright edge pixels over black`);
  const safeInset = foreground.width * 0.1;
  const centered = Math.abs((minX + maxX) / 2 - (foreground.width - 1) / 2) <= 1 && Math.abs((minY + maxY) / 2 - (foreground.height - 1) / 2) <= 1;
  const safe = minX >= safeInset && minY >= safeInset && maxX < foreground.width - safeInset && maxY < foreground.height - safeInset;
  check("Adaptive foreground safe area", centered && safe, `${minX},${minY} to ${maxX},${maxY} within centered 80% safe area`);

  let uniform = true;
  for (let y = 0; y < background.height && uniform; y += 1) {
    for (let x = 0; x < background.width; x += 1) {
      if (!equalPixels(pixelAt(background, x, y), backgroundPixel)) {
        uniform = false;
        break;
      }
    }
  }
  check("Adaptive icon background", uniform, "Single color copied from the company icon background");
}

function checkSplash(source, splash) {
  if (!source || !splash) return;
  const background = pixelAt(source, 0, 0);
  const scale = 4;
  const symbolSize = source.width * scale;
  const offset = (splash.width - symbolSize) / 2;
  let matches = Number.isInteger(offset);
  for (let y = 0; y < splash.height && matches; y += 1) {
    for (let x = 0; x < splash.width; x += 1) {
      const withinSymbol = x >= offset && x < offset + symbolSize && y >= offset && y < offset + symbolSize;
      const expected = withinSymbol ? expectedSourcePixel(source, x - offset, y - offset, scale) : background;
      if (!equalPixels(pixelAt(splash, x, y), expected)) {
        matches = false;
        break;
      }
    }
  }
  check("Splash uses only the company flower and solid background", matches, "Exact centered 4x source placement on the original background color");
}

const source = readPng(sourcePath);
checkDimensions("Company source", source, 512, 512);
const icon = readPng(assetPaths.icon);
const foreground = readPng(assetPaths.foreground);
const background = readPng(assetPaths.background);
const splash = readPng(assetPaths.splash);

checkDimensions("iOS icon", icon, 1024, 1024);
checkDimensions("Adaptive foreground", foreground, 1024, 1024);
checkDimensions("Adaptive background", background, 1024, 1024);
checkDimensions("Splash", splash, 2732, 2732);
checkScaledIcon(source, icon);
checkForeground(source, foreground, background);
checkSplash(source, splash);

for (const result of passes) console.log(`[PASS] ${result.name}: ${result.detail}`);
for (const result of failures) console.error(`[FAIL] ${result.name}: ${result.detail}`);
console.log(`${passes.length} passed, ${failures.length} failed`);
if (failures.length) process.exitCode = 1;

/**
 * Media forensics — genuine binary inspection, no guessing.
 *
 * Parses JPEG / PNG / WEBP containers directly so the media module can report
 * what metadata actually exists: camera make & model, software used to save the
 * file, capture timestamps, GPS presence, XMP packets, PNG text chunks emitted
 * by generative UIs, C2PA / Content Credentials manifests and byte entropy.
 *
 * It deliberately does *not* claim to detect manipulation from pixels: the
 * blueprint is explicit that AI detection alone is not proof of fabrication.
 */

import { latin1, toHex } from "@/lib/utils";

export interface PngTextChunk {
  key: string;
  value: string;
}

export interface GeneratorSignal {
  tool: string;
  evidence: string;
  field: string;
}

export interface C2paResult {
  present: boolean;
  container: string;
  labels: string[];
  detail: string;
}

export interface MediaForensics {
  format: string;
  width?: number;
  height?: number;
  sizeBytes: number;
  exif: Record<string, string>;
  gpsPresent: boolean;
  thumbnailPresent: boolean;
  cameraMake?: string;
  cameraModel?: string;
  software?: string;
  capturedAt?: string;
  modifiedAt?: string;
  xmpPacket?: string;
  xmpFields: Record<string, string>;
  pngText: PngTextChunk[];
  webpChunks: string[];
  c2pa: C2paResult;
  generatorSignals: GeneratorSignal[];
  editSignals: string[];
  entropy: number;
  jpegMarkerPath: string[];
  quantTables: number;
  progressive: boolean;
  restartMarkers: number;
}

const GENERATOR_SIGNATURES: Array<[RegExp, string]> = [
  [/stable[\s-_]?diffusion/i, "Stable Diffusion"],
  [/automatic1111|a1111/i, "AUTOMATIC1111 WebUI"],
  [/comfyui/i, "ComfyUI"],
  [/midjourney/i, "Midjourney"],
  [/dall[\s-]?e|openai|gpt-image/i, "OpenAI image model"],
  [/firefly/i, "Adobe Firefly"],
  [/imagen|gemini/i, "Google Imagen / Gemini"],
  [/black forest labs|\bflux\b/i, "Black Forest Labs FLUX"],
  [/novelai/i, "NovelAI"],
  [/runway/i, "Runway"],
  [/leonardo\.?ai/i, "Leonardo.ai"],
  [/ideogram/i, "Ideogram"],
  [/recraft/i, "Recraft"],
  [/pika/i, "Pika"],
  [/luma/i, "Luma"],
  [/\bsora\b/i, "OpenAI Sora"],
  [/\bveo\b/i, "Google Veo"],
  [/trainedAlgorithmicMedia|compositeSynthetic|algorithmicMedia/i, "IPTC generative digitalSourceType"],
  [/c2pa\.generativeai|generativeai/i, "C2PA generative-AI assertion"],
];

const EDIT_SIGNATURES: Array<[RegExp, string]> = [
  [/photoshop/i, "Adobe Photoshop"],
  [/lightroom/i, "Adobe Lightroom"],
  [/gimp/i, "GIMP"],
  [/affinity/i, "Affinity Photo"],
  [/snapseed/i, "Snapseed"],
  [/facetune/i, "Facetune"],
  [/picsart/i, "PicsArt"],
  [/canva/i, "Canva"],
  [/darktable/i, "darktable"],
  [/pixelmator/i, "Pixelmator"],
  [/after effects/i, "After Effects"],
  [/premiere/i, "Premiere Pro"],
  [/topaz/i, "Topaz (upscaling / denoise)"],
  [/capture one/i, "Capture One"],
];

function readU16(buf: Uint8Array, off: number, le: boolean): number {
  return le ? buf[off] | (buf[off + 1] << 8) : (buf[off] << 8) | buf[off + 1];
}
function readU32(buf: Uint8Array, off: number, le: boolean): number {
  return le
    ? (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0
    : ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
}
function latin(buf: Uint8Array, start: number, len: number): string {
  return latin1(buf.subarray(start, start + len));
}
function utf8(buf: Uint8Array, start: number, len: number): string {
  return new TextDecoder("utf-8").decode(buf.subarray(start, start + len));
}

export function shannonEntropy(buf: Uint8Array): number {
  if (!buf.length) return 0;
  const counts = new Uint32Array(256);
  for (let i = 0; i < buf.length; i += 1) counts[buf[i]] += 1;
  let h = 0;
  for (let i = 0; i < 256; i += 1) {
    if (!counts[i]) continue;
    const p = counts[i] / buf.length;
    h -= p * Math.log2(p);
  }
  return Number(h.toFixed(4));
}

const TIFF_TAG_NAMES: Record<number, string> = {
  0x010e: "ImageDescription",
  0x010f: "Make",
  0x0110: "Model",
  0x0112: "Orientation",
  0x011a: "XResolution",
  0x011b: "YResolution",
  0x0128: "ResolutionUnit",
  0x0131: "Software",
  0x0132: "DateTime",
  0x013b: "Artist",
  0x0213: "YCbCrPositioning",
  0x8298: "Copyright",
  0x8769: "ExifIFD",
  0x8825: "GPSIFD",
  0x9003: "DateTimeOriginal",
  0x9004: "DateTimeDigitized",
  0x920a: "FocalLength",
  0x9286: "UserComment",
  0xa002: "PixelXDimension",
  0xa003: "PixelYDimension",
  0xa420: "ImageUniqueID",
  0xa430: "CameraOwnerName",
  0xa431: "BodySerialNumber",
  0xa432: "LensInfo",
  0xa433: "LensMake",
  0xa434: "LensModel",
  0x829a: "ExposureTime",
  0x829d: "FNumber",
  0x8827: "ISOSpeedRatings",
  0x9201: "ShutterSpeedValue",
  0x9202: "ApertureValue",
  0x9209: "Flash",
};

function parseTiff(buf: Uint8Array, tiffStart: number): { tags: Record<string, string>; gps: boolean; thumbnail: boolean } {
  const tags: Record<string, string> = {};
  let gps = false;
  let thumbnail = false;
  const le = latin(buf, tiffStart, 2) === "II";
  const magic = readU16(buf, tiffStart + 2, le);
  if (magic !== 42) return { tags, gps, thumbnail };
  let ifdOffset = readU32(buf, tiffStart + 4, le);
  let ifdIndex = 0;

  while (ifdOffset > 0 && ifdOffset + 2 < buf.length - tiffStart && ifdIndex < 3) {
    const abs = tiffStart + ifdOffset;
    const count = readU16(buf, abs, le);
    if (count === 0 || count > 500) break;
    let nextIfd = 0;
    const subIfds: number[] = [];

    for (let i = 0; i < count; i += 1) {
      const entry = abs + 2 + i * 12;
      if (entry + 12 > buf.length) break;
      const tag = readU16(buf, entry, le);
      const type = readU16(buf, entry + 2, le);
      const num = readU32(buf, entry + 4, le);
      const sizeOf = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8][type] ?? 0;
      const total = sizeOf * num;
      const valueOffset = total > 4 ? tiffStart + readU32(buf, entry + 8, le) : entry + 8;
      if (total > 4 && (valueOffset < 0 || valueOffset + total > buf.length)) continue;

      const name = TIFF_TAG_NAMES[tag];
      if (tag === 0x8825) gps = true;
      if (tag === 0x8769 || tag === 0x8825) subIfds.push(readU32(buf, entry + 8, le));

      if (!name || name === "ExifIFD" || name === "GPSIFD") continue;

      try {
        if (type === 2) {
          const raw = utf8(buf, valueOffset, Math.max(0, Math.min(total, 512) - 1)).replace(/\0+$/g, "");
          if (raw.trim()) tags[name] = raw.trim();
        } else if (type === 3) {
          tags[name] = String(readU16(buf, valueOffset, le));
        } else if (type === 4) {
          tags[name] = String(readU32(buf, valueOffset, le));
        } else if (type === 5 || type === 10) {
          const n = readU32(buf, valueOffset, le);
          const d = readU32(buf, valueOffset + 4, le);
          tags[name] = d === 0 ? String(n) : `${n}/${d}`;
        } else if (type === 1 || type === 7) {
          tags[name] = toHex(buf.subarray(valueOffset, valueOffset + Math.min(total, 8)));
        }
      } catch {
        /* malformed tag — skip, do not fail the report */
      }
    }

    nextIfd = readU32(buf, abs + 2 + count * 12, le);
    if (nextIfd > 0 && ifdIndex === 0) thumbnail = true;

    for (const sub of subIfds) {
      if (sub <= 0 || sub + 2 >= buf.length) continue;
      const subAbs = tiffStart + sub;
      const subCount = readU16(buf, subAbs, le);
      if (subCount === 0 || subCount > 400) continue;
      for (let i = 0; i < subCount; i += 1) {
        const entry = subAbs + 2 + i * 12;
        if (entry + 12 > buf.length) break;
        const tag = readU16(buf, entry, le);
        const type = readU16(buf, entry + 2, le);
        const num = readU32(buf, entry + 4, le);
        const sizeOf = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8][type] ?? 0;
        const total = sizeOf * num;
        const valueOffset = total > 4 ? tiffStart + readU32(buf, entry + 8, le) : entry + 8;
        if (total > 4 && (valueOffset < 0 || valueOffset + total > buf.length)) continue;
        const name = TIFF_TAG_NAMES[tag];
        if (!name) continue;
        try {
          if (type === 2) {
            const raw = utf8(buf, valueOffset, Math.max(0, Math.min(total, 512) - 1)).replace(/\0+$/g, "");
            if (raw.trim()) tags[name] = raw.trim();
          } else if (type === 3) tags[name] = String(readU16(buf, valueOffset, le));
          else if (type === 4) tags[name] = String(readU32(buf, valueOffset, le));
          else if (type === 5 || type === 10) {
            const n = readU32(buf, valueOffset, le);
            const d = readU32(buf, valueOffset + 4, le);
            tags[name] = d === 0 ? String(n) : `${n}/${d}`;
          }
        } catch {
          /* skip */
        }
      }
    }

    ifdOffset = nextIfd;
    ifdIndex += 1;
  }

  return { tags, gps, thumbnail };
}

function scanGenerators(haystack: string, field: string): GeneratorSignal[] {
  const out: GeneratorSignal[] = [];
  for (const [re, tool] of GENERATOR_SIGNATURES) {
    const m = haystack.match(re);
    if (m) out.push({ tool, evidence: m[0].slice(0, 120), field });
  }
  return out;
}

export function analyzeMedia(bytes: Uint8Array): MediaForensics {
  const result: MediaForensics = {
    format: "unknown",
    sizeBytes: bytes.length,
    exif: {},
    gpsPresent: false,
    thumbnailPresent: false,
    xmpFields: {},
    pngText: [],
    webpChunks: [],
    c2pa: { present: false, container: "none", labels: [], detail: "No C2PA / Content Credentials manifest found in the container." },
    generatorSignals: [],
    editSignals: [],
    entropy: shannonEntropy(bytes),
    jpegMarkerPath: [],
    quantTables: 0,
    progressive: false,
    restartMarkers: 0,
  };

  const asText = utf8(bytes, 0, Math.min(bytes.length, 4 * 1024 * 1024));
  const hex = toHex(bytes.subarray(0, 16));

  /* ------------------------------- PNG ------------------------------- */
  if (hex.startsWith("89504e470d0a1a0a")) {
    result.format = "png";
    let off = 8;
    while (off + 12 <= bytes.length) {
      const len = readU32(bytes, off, false);
      const type = latin(bytes, off + 4, 4);
      const dataStart = off + 8;
      if (type === "IHDR") {
        result.width = readU32(bytes, dataStart, false);
        result.height = readU32(bytes, dataStart + 4, false);
      } else if (type === "tEXt") {
        const chunk = latin(bytes, dataStart, Math.min(len, 4096));
        const sep = chunk.indexOf("\0");
        const key = sep > 0 ? chunk.slice(0, sep) : chunk;
        const value = sep > 0 ? chunk.slice(sep + 1) : "";
        result.pngText.push({ key, value });
      } else if (type === "iTXt" || type === "zTXt") {
        const raw = latin(bytes, dataStart, Math.min(len, 8192));
        const sep = raw.indexOf("\0");
        result.pngText.push({ key: sep > 0 ? raw.slice(0, sep) : type, value: raw.slice(sep + 1) });
      } else if (type === "eXIf") {
        const tiff = parseTiff(bytes, dataStart);
        result.exif = { ...result.exif, ...tiff.tags };
        result.gpsPresent = result.gpsPresent || tiff.gps;
      } else if (type === "caBX") {
        result.c2pa = {
          present: true,
          container: "png:caBX",
          labels: ["caBX"],
          detail: "A caBX chunk is present — this is the C2PA / Content Credentials manifest location for PNG.",
        };
      }
      if (len > bytes.length) break;
      off = dataStart + len + 4;
      if (type === "IEND") break;
    }
    if (asText.includes("XML:com.adobe.xmp")) {
      const start = asText.indexOf("<x:xmpmeta");
      const end = asText.indexOf("</x:xmpmeta>");
      if (start >= 0 && end > start) result.xmpPacket = asText.slice(start, end + 12);
    }
  }

  /* ------------------------------- JPEG ------------------------------ */
  if (hex.startsWith("ffd8ff")) {
    result.format = "jpeg";
    let off = 2;
    while (off + 4 <= bytes.length) {
      if (bytes[off] !== 0xff) { off += 1; continue; }
      const marker = bytes[off + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue; }
      if (marker === 0xda) {
        result.jpegMarkerPath.push("SOS");
        // count restart markers inside the entropy-coded segment
        for (let i = off; i < bytes.length - 1; i += 1) {
          if (bytes[i] === 0xff && bytes[i + 1] >= 0xd0 && bytes[i + 1] <= 0xd7) result.restartMarkers += 1;
        }
        break;
      }
      const segLen = readU16(bytes, off + 2, false);
      if (segLen < 2 || off + 2 + segLen > bytes.length) break;
      const dataStart = off + 4;
      const dataLen = segLen - 2;
      const markerName = markerNameFor(marker);
      result.jpegMarkerPath.push(markerName);

      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3) {
        result.progressive = marker === 0xc2;
        result.height = readU16(bytes, dataStart + 1, false);
        result.width = readU16(bytes, dataStart + 3, false);
      }
      if (marker === 0xdb) result.quantTables += 1;
      if (marker === 0xe1) {
        if (latin(bytes, dataStart, 6) === "Exif\0\0") {
          const tiff = parseTiff(bytes, dataStart + 6);
          result.exif = { ...result.exif, ...tiff.tags };
          result.gpsPresent = result.gpsPresent || tiff.gps;
          result.thumbnailPresent = result.thumbnailPresent || tiff.thumbnail;
        } else if (latin(bytes, dataStart, 29).startsWith("http://ns.adobe.com/xap/1.0/")) {
          result.xmpPacket = utf8(bytes, dataStart + 29, Math.max(0, dataLen - 29));
        }
      }
      if (marker === 0xeb) {
        // APP11 — ISO 19566-5 JUMBF, used by C2PA in JPEG
        const head = latin(bytes, dataStart, Math.min(8, dataLen));
        const labels: string[] = [];
        const slice = utf8(bytes, dataStart, Math.min(dataLen, 4096));
        for (const probe of ["c2pa", "jumb", "jumd", "json", "bidb", "uuid", "C2PA"]) {
          if (slice.includes(probe)) labels.push(probe);
        }
        result.c2pa = {
          present: true,
          container: "jpeg:APP11",
          labels,
          detail: `APP11 JUMBF segment detected (header "${head.replace(/\0/g, "\\0")}"). This is the carrier C2PA uses for Content Credentials in JPEG.`,
        };
      }
      if (marker === 0xe2 && latin(bytes, dataStart, 4).includes("ICC_")) {
        result.exif["ICCProfile"] = `present (${dataLen} bytes)`;
      }
      off += 2 + segLen;
    }
  }

  /* ------------------------------- WEBP ------------------------------ */
  if (latin(bytes, 0, 4) === "RIFF" && latin(bytes, 8, 4) === "WEBP") {
    result.format = "webp";
    let off = 12;
    while (off + 8 <= bytes.length) {
      const fourcc = latin(bytes, off, 4);
      const len = readU32(bytes, off + 4, true);
      result.webpChunks.push(fourcc.trim());
      if (fourcc === "VP8X") {
        result.width = 1 + (bytes[off + 12] | (bytes[off + 13] << 8) | (bytes[off + 14] << 16));
        result.height = 1 + (bytes[off + 15] | (bytes[off + 16] << 8) | (bytes[off + 17] << 16));
      }
      if (fourcc === "EXIF") {
        const tiff = parseTiff(bytes, off + 8);
        result.exif = { ...result.exif, ...tiff.tags };
        result.gpsPresent = result.gpsPresent || tiff.gps;
      }
      if (fourcc === "XMP ") result.xmpPacket = utf8(bytes, off + 8, len);
      if (fourcc === "JP  ") {
        result.c2pa = {
          present: true,
          container: "webp:JP",
          labels: ["JP"],
          detail: "RIFF 'JP' chunk present — the C2PA manifest carrier for WebP.",
        };
      }
      off += 8 + len + (len % 2);
    }
  }

  if (result.format === "unknown") {
    if (latin(bytes, 4, 4) === "ftyp") result.format = "heif/avif-or-mp4";
    else if (latin(bytes, 0, 5) === "%PDF-") result.format = "pdf";
    else if (hex.startsWith("47494638")) result.format = "gif";
  }

  /* --------------------------- derived facts -------------------------- */
  if (result.xmpPacket) {
    const fieldRe = /<([\w:]+)(?:\s[^>]*)?>([^<]{1,300})<\/\1>/g;
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = fieldRe.exec(result.xmpPacket)) && guard < 400) {
      guard += 1;
      const value = m[2].trim();
      if (value) result.xmpFields[m[1]] = value;
    }
    const attrRe = /([\w:]+)="([^"]{1,200})"/g;
    let attrGuard = 0;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(result.xmpPacket)) && attrGuard < 400) {
      attrGuard += 1;
      if (!result.xmpFields[a[1]]) result.xmpFields[a[1]] = a[2];
    }
    result.generatorSignals.push(...scanGenerators(result.xmpPacket, "XMP"));
  }

  for (const chunk of result.pngText) {
    result.generatorSignals.push(...scanGenerators(`${chunk.key} ${chunk.value}`, `PNG:${chunk.key}`));
    if (/^(parameters|prompt|workflow|Comment)$/.test(chunk.key) && chunk.value.length > 20) {
      result.xmpFields[`png:${chunk.key}`] = chunk.value.slice(0, 400);
    }
  }

  const software = result.exif["Software"] ?? result.xmpFields["xmp:CreatorTool"] ?? result.xmpFields["tiff:Software"];
  if (software) result.software = software;
  result.cameraMake = result.exif["Make"];
  result.cameraModel = result.exif["Model"];
  result.capturedAt = result.exif["DateTimeOriginal"] ?? result.exif["DateTimeDigitized"];
  result.modifiedAt = result.exif["DateTime"];

  const editHaystack = [software ?? "", result.xmpPacket ?? "", JSON.stringify(result.exif)].join(" ");
  for (const [re, tool] of EDIT_SIGNATURES) {
    if (re.test(editHaystack)) result.editSignals.push(tool);
  }
  result.generatorSignals.push(...scanGenerators(asText.slice(0, 200000), "container text scan"));
  result.generatorSignals = result.generatorSignals.filter(
    (s, i, arr) => arr.findIndex((x) => x.tool === s.tool) === i,
  );

  if (!result.c2pa.present) {
    const probe = asText.slice(0, 500000);
    if (probe.includes("c2pa") || probe.includes("contentcredentials") || probe.includes("f1bff7b4")) {
      result.c2pa = {
        present: true,
        container: "embedded-string",
        labels: ["c2pa"],
        detail: "C2PA identifier strings found in the file body outside a standard manifest box.",
      };
    }
  }

  return result;
}

function markerNameFor(marker: number): string {
  const map: Record<number, string> = {
    0xc0: "SOF0", 0xc1: "SOF1", 0xc2: "SOF2", 0xc3: "SOF3", 0xc4: "DHT",
    0xdb: "DQT", 0xdd: "DRI", 0xe0: "APP0", 0xe1: "APP1", 0xe2: "APP2",
    0xeb: "APP11", 0xee: "APP14", 0xef: "APP15", 0xda: "SOS", 0xd9: "EOI",
  };
  return map[marker] ?? `0x${marker.toString(16).toUpperCase()}`;
}

/** Turns forensic output into human-readable evidence lines for the report. */
export function forensicsToEvidence(f: MediaForensics): string[] {
  const lines: string[] = [];
  if (f.width && f.height) lines.push(`Pixel dimensions read from the ${f.format.toUpperCase()} header: ${f.width}×${f.height}.`);
  if (f.cameraMake || f.cameraModel) {
    lines.push(`Capture device recorded in EXIF: ${[f.cameraMake, f.cameraModel].filter(Boolean).join(" ")}.`);
  } else if (f.format === "jpeg") {
    lines.push("No camera Make/Model EXIF fields — consistent with a screenshot, a re-saved image, or a platform that strips metadata.");
  }
  if (f.software) lines.push(`Saving software tag: "${f.software}".`);
  if (f.capturedAt) lines.push(`EXIF capture timestamp: ${f.capturedAt}.`);
  if (f.modifiedAt && f.capturedAt && f.modifiedAt !== f.capturedAt) {
    lines.push(`File modification timestamp (${f.modifiedAt}) differs from the capture timestamp — the file was re-saved after capture.`);
  }
  lines.push(f.gpsPresent ? "GPS metadata block is present." : "No GPS metadata block.");
  lines.push(f.thumbnailPresent ? "An embedded EXIF thumbnail exists — sometimes it retains pixels removed from the main image." : "No embedded EXIF thumbnail.");
  if (f.format === "jpeg") {
    lines.push(`JPEG marker path: ${f.jpegMarkerPath.slice(0, 12).join(" → ")}. ${f.quantTables} quantisation table(s), ${f.progressive ? "progressive" : "baseline"} scan, ${f.restartMarkers} restart marker(s).`);
  }
  lines.push(`Shannon entropy of the file bytes: ${f.entropy.toFixed(3)} bits/byte (max 8.0).`);
  if (f.c2pa.present) lines.push(f.c2pa.detail);
  else lines.push("No C2PA / Content Credentials manifest is present, so there is no signed record of origin or edit history for this file.");
  for (const g of f.generatorSignals) lines.push(`Generative-tool signature "${g.evidence}" matched ${g.tool} in ${g.field}.`);
  for (const e of f.editSignals) lines.push(`Editing software reference: ${e}.`);
  return lines;
}

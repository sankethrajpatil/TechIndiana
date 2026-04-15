import { describe, it, expect } from 'vitest';

// Extract and test audio utility functions directly
// (These are defined inline in App.tsx; we replicate them for unit testing)

function floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

describe('floatTo16BitPCM', () => {
  it('should return an ArrayBuffer of correct size', () => {
    const input = new Float32Array([0.5, -0.5, 0, 1.0]);
    const result = floatTo16BitPCM(input);
    expect(result.byteLength).toBe(input.length * 2); // 16-bit = 2 bytes per sample
  });

  it('should encode silence (all zeros) to zero bytes', () => {
    const input = new Float32Array([0, 0, 0, 0]);
    const result = floatTo16BitPCM(input);
    const view = new DataView(result);
    for (let i = 0; i < input.length; i++) {
      expect(view.getInt16(i * 2, true)).toBe(0);
    }
  });

  it('should clamp values above 1.0 to max positive', () => {
    const input = new Float32Array([1.5, 2.0, 100.0]);
    const result = floatTo16BitPCM(input);
    const view = new DataView(result);
    for (let i = 0; i < input.length; i++) {
      expect(view.getInt16(i * 2, true)).toBe(0x7fff); // 32767
    }
  });

  it('should clamp values below -1.0 to max negative', () => {
    const input = new Float32Array([-1.5, -2.0, -100.0]);
    const result = floatTo16BitPCM(input);
    const view = new DataView(result);
    for (let i = 0; i < input.length; i++) {
      expect(view.getInt16(i * 2, true)).toBe(-0x8000); // -32768
    }
  });

  it('should encode positive values correctly', () => {
    const input = new Float32Array([1.0]);
    const result = floatTo16BitPCM(input);
    const view = new DataView(result);
    expect(view.getInt16(0, true)).toBe(0x7fff); // Max positive
  });

  it('should encode negative values correctly', () => {
    const input = new Float32Array([-1.0]);
    const result = floatTo16BitPCM(input);
    const view = new DataView(result);
    expect(view.getInt16(0, true)).toBe(-0x8000); // Max negative
  });

  it('should handle empty input', () => {
    const input = new Float32Array([]);
    const result = floatTo16BitPCM(input);
    expect(result.byteLength).toBe(0);
  });

  it('should encode 0.5 to approximately half of max positive', () => {
    const input = new Float32Array([0.5]);
    const result = floatTo16BitPCM(input);
    const view = new DataView(result);
    const value = view.getInt16(0, true);
    // 0.5 * 0x7FFF = 16383.5, expect ~16383 or 16384
    expect(value).toBeGreaterThan(16000);
    expect(value).toBeLessThan(17000);
  });

  it('should encode -0.5 to approximately half of max negative', () => {
    const input = new Float32Array([-0.5]);
    const result = floatTo16BitPCM(input);
    const view = new DataView(result);
    const value = view.getInt16(0, true);
    // -0.5 * 0x8000 = -16384
    expect(value).toBeLessThan(-16000);
    expect(value).toBeGreaterThan(-17000);
  });

  it('should use little-endian byte order', () => {
    const input = new Float32Array([1.0]);
    const result = floatTo16BitPCM(input);
    const bytes = new Uint8Array(result);
    // 0x7FFF in little-endian is [0xFF, 0x7F]
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0x7f);
  });
});

describe('base64ToArrayBuffer', () => {
  it('should decode a simple base64 string', () => {
    // "Hello" in base64 is "SGVsbG8="
    const result = base64ToArrayBuffer('SGVsbG8=');
    const uint8 = new Uint8Array(result);
    const decoded = String.fromCharCode(...uint8);
    expect(decoded).toBe('Hello');
  });

  it('should handle empty base64 string', () => {
    const result = base64ToArrayBuffer('');
    expect(result.byteLength).toBe(0);
  });

  it('should correctly decode binary data', () => {
    // 3 bytes: [0x00, 0xFF, 0x80] → base64: "AP+A"
    const result = base64ToArrayBuffer('AP+A');
    const uint8 = new Uint8Array(result);
    expect(uint8[0]).toBe(0x00);
    expect(uint8[1]).toBe(0xff);
    expect(uint8[2]).toBe(0x80);
  });

  it('should decode base64 with padding correctly', () => {
    // "A" → base64: "QQ=="
    const result = base64ToArrayBuffer('QQ==');
    const uint8 = new Uint8Array(result);
    expect(uint8.length).toBe(1);
    expect(uint8[0]).toBe(65); // ASCII 'A'
  });

  it('should decode long base64 strings', () => {
    // 256 bytes of sequential data
    const input = new Uint8Array(256);
    for (let i = 0; i < 256; i++) input[i] = i;
    const base64 = btoa(String.fromCharCode(...input));
    
    const result = base64ToArrayBuffer(base64);
    const output = new Uint8Array(result);
    
    expect(output.length).toBe(256);
    for (let i = 0; i < 256; i++) {
      expect(output[i]).toBe(i);
    }
  });

  it('should be inverse of btoa for ASCII text', () => {
    const original = 'TechIndiana Voice Advisor';
    const base64 = btoa(original);
    const result = base64ToArrayBuffer(base64);
    const uint8 = new Uint8Array(result);
    const reconstructed = String.fromCharCode(...uint8);
    expect(reconstructed).toBe(original);
  });
});

describe('WebSocket message type parsing', () => {
  // Test the message-type dispatch logic used in App.tsx onmessage
  function classifyMessage(msg: any): string {
    if (msg.type === 'audio') return 'audio';
    if (msg.type === 'speech_start') return 'speech_start';
    if (msg.type === 'speech_end') return 'speech_end';
    if (msg.type === 'transcript') return 'transcript';
    if (msg.type === 'status') return 'status';
    if (msg.type === 'error') return 'error';
    if (msg.type === 'study_plan_ready') return 'study_plan_ready';
    if (msg.type === 'ui_redirect') return 'ui_redirect';
    if (msg.type === 'meeting_scheduled') return 'meeting_scheduled';
    if (msg.type === 'render_comparison') return 'render_comparison';
    return 'unknown';
  }

  it('should classify audio messages', () => {
    expect(classifyMessage({ type: 'audio', data: 'base64data' })).toBe('audio');
  });

  it('should classify speech_start messages', () => {
    expect(classifyMessage({ type: 'speech_start' })).toBe('speech_start');
  });

  it('should classify speech_end messages', () => {
    expect(classifyMessage({ type: 'speech_end' })).toBe('speech_end');
  });

  it('should classify transcript messages', () => {
    expect(classifyMessage({ type: 'transcript', role: 'User', text: 'Hello' })).toBe('transcript');
  });

  it('should classify status messages', () => {
    expect(classifyMessage({ type: 'status', message: 'Connected' })).toBe('status');
  });

  it('should classify error messages', () => {
    expect(classifyMessage({ type: 'error', message: 'Something broke' })).toBe('error');
  });

  it('should classify study_plan_ready messages', () => {
    expect(classifyMessage({ type: 'study_plan_ready', plan: {} })).toBe('study_plan_ready');
  });

  it('should classify ui_redirect messages', () => {
    expect(classifyMessage({ type: 'ui_redirect', route: '/students' })).toBe('ui_redirect');
  });

  it('should classify meeting_scheduled messages', () => {
    expect(classifyMessage({ type: 'meeting_scheduled', event_link: 'https://...' })).toBe('meeting_scheduled');
  });

  it('should classify render_comparison messages', () => {
    expect(classifyMessage({ type: 'render_comparison', data: [] })).toBe('render_comparison');
  });

  it('should handle unknown message types', () => {
    expect(classifyMessage({ type: 'weird_type' })).toBe('unknown');
  });

  it('should handle messages without a type field', () => {
    expect(classifyMessage({})).toBe('unknown');
  });
});

describe('Study plan JSON parsing (email template logic)', () => {
  // This mirrors the parsing logic in session.ts lines 70-79
  function formatStudyPlan(studyPlan: string | null | undefined): string {
    if (!studyPlan) return 'No study plan generated yet.';
    
    try {
      const plan = JSON.parse(studyPlan);
      return `${plan.plan_title}: ${plan.action_items.join(', ')}`;
    } catch (e) {
      return studyPlan;
    }
  }

  it('should return default message for null plan', () => {
    expect(formatStudyPlan(null)).toBe('No study plan generated yet.');
  });

  it('should return default message for undefined plan', () => {
    expect(formatStudyPlan(undefined)).toBe('No study plan generated yet.');
  });

  it('should return default message for empty string', () => {
    expect(formatStudyPlan('')).toBe('No study plan generated yet.');
  });

  it('should parse valid JSON plan', () => {
    const plan = JSON.stringify({
      plan_title: 'Cloud Path',
      action_items: ['AWS Cert', 'Build a project'],
    });
    const result = formatStudyPlan(plan);
    expect(result).toContain('Cloud Path');
    expect(result).toContain('AWS Cert');
  });

  it('should return raw string for invalid JSON', () => {
    const result = formatStudyPlan('Just a plain text plan');
    expect(result).toBe('Just a plain text plan');
  });
});

describe('Theme toggle logic', () => {
  it('should toggle between light and dark themes', () => {
    let theme = 'dark';
    const toggle = () => { theme = theme === 'dark' ? 'light' : 'dark'; };
    
    expect(theme).toBe('dark');
    toggle();
    expect(theme).toBe('light');
    toggle();
    expect(theme).toBe('dark');
  });
});

describe('MongoDB URI construction logic', () => {
  // Mirrors the URI logic in server.ts lines 149-156
  function buildMongoUri(uri: string | undefined, db: string | undefined): string | undefined {
    if (!uri) return uri;
    let result = uri;
    if (db) {
      if (result.endsWith('/')) {
        result += db;
      } else if (!result.includes('/', result.indexOf('//') + 2)) {
        result += '/' + db;
      }
    }
    return result;
  }

  it('should return undefined when URI is not set', () => {
    expect(buildMongoUri(undefined, 'testdb')).toBeUndefined();
  });

  it('should append db name when URI ends with /', () => {
    expect(buildMongoUri('mongodb://localhost/', 'mydb')).toBe('mongodb://localhost/mydb');
  });

  it('should append /db when URI has no path after authority', () => {
    expect(buildMongoUri('mongodb://localhost:27017', 'mydb')).toBe('mongodb://localhost:27017/mydb');
  });

  it('should not modify URI when db name is already in path', () => {
    expect(buildMongoUri('mongodb://localhost:27017/existingdb', 'mydb')).toBe('mongodb://localhost:27017/existingdb');
  });

  it('should not modify URI when db name is not provided', () => {
    expect(buildMongoUri('mongodb://localhost:27017', undefined)).toBe('mongodb://localhost:27017');
  });

  it('should handle Atlas-style connection strings', () => {
    const atlasUri = 'mongodb+srv://user:pass@cluster.mongodb.net';
    expect(buildMongoUri(atlasUri, 'techindiana')).toBe(`${atlasUri}/techindiana`);
  });
});

describe('Firebase credential parsing logic', () => {
  // Mirror the robustParse function from server.ts
  function robustParse(str: string): any {
    try {
      const parsed = JSON.parse(str);
      if (typeof parsed === 'string') {
        return robustParse(parsed);
      }
      return parsed;
    } catch (e) {
      const start = str.indexOf('{');
      const end = str.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        const extracted = str.substring(start, end + 1);
        try {
          const parsedExtracted = JSON.parse(extracted);
          if (typeof parsedExtracted === 'string') {
            return robustParse(parsedExtracted);
          }
          return parsedExtracted;
        } catch (e2) {
          throw e;
        }
      }
      throw e;
    }
  }

  it('should parse a regular JSON object', () => {
    const input = '{"project_id":"tech-indiana","client_email":"sa@proj.iam.gserviceaccount.com"}';
    const result = robustParse(input);
    expect(result.project_id).toBe('tech-indiana');
  });

  it('should handle double-encoded JSON', () => {
    const inner = JSON.stringify({ project_id: 'test' });
    const doubleEncoded = JSON.stringify(inner);
    const result = robustParse(doubleEncoded);
    expect(result.project_id).toBe('test');
  });

  it('should handle triple-encoded JSON', () => {
    const inner = JSON.stringify({ project_id: 'test' });
    const triple = JSON.stringify(JSON.stringify(inner));
    const result = robustParse(triple);
    expect(result.project_id).toBe('test');
  });

  it('should extract JSON embedded in surrounding text', () => {
    const input = 'some garbage before {"project_id":"extracted"} and after';
    const result = robustParse(input);
    expect(result.project_id).toBe('extracted');
  });

  it('should throw for completely invalid input', () => {
    expect(() => robustParse('not json at all')).toThrow();
  });

  it('should handle single-quoted wrapped JSON', () => {
    // Simulating the stripping logic in server.ts
    let rawValue = "'{ \"project_id\": \"test\" }'";
    if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
      rawValue = rawValue.substring(1, rawValue.length - 1).trim();
    }
    const result = robustParse(rawValue);
    expect(result.project_id).toBe('test');
  });
});

const { z } = require('zod');

const RADIUS = ['sharp', 'soft', 'round'];

const settingsSchema = z.object({
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colore non valido').optional(),
  radius: z.enum(RADIUS).optional(),
}).strict();

const DEFAULTS = { accent: '#1DB954', radius: 'soft' };

function parseStored(json) {
  try {
    const o = JSON.parse(json || '{}');
    const r = settingsSchema.partial().safeParse(o);
    return { ...DEFAULTS, ...(r.success ? r.data : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

module.exports = { settingsSchema, parseStored, DEFAULTS, RADIUS };

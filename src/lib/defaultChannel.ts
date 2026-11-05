export type DefaultChannel = 'device' | 'server' | 'cloud'

export const CHANNEL_KEY = 'skopein.whisper.channel'
export const TIER_KEY = 'skopein.whisper.tier'

export function parseChannel(raw: string | null | undefined): DefaultChannel {
  return raw === 'device' || raw === 'cloud' ? raw : 'server'
}

export function parseTier(raw: string | null | undefined): 'small' | 'medium' {
  return raw === 'medium' ? 'medium' : 'small'
}

/**
 * The study sheet marks exactly one button as the default. Keeping the rule in
 * a function means the badge cannot say "default" on both buttons, which is the
 * failure mode nobody notices until a user asks which one is actually chosen.
 */
export function markDefault(base: string, channel: DefaultChannel, preferred: DefaultChannel, suffix = ' · your default'): string {
  return channel === preferred ? `${base}${suffix}` : base
}

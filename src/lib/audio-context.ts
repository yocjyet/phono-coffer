import { logger } from '$lib/logger';

let sharedAudioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      logger.error('AudioContext not supported');
      throw new Error('AudioContext not supported');
    }
    sharedAudioContext = new AudioContextClass();
    logger.info('Created new shared AudioContext', { state: sharedAudioContext.state });

    sharedAudioContext.onstatechange = () => {
      logger.info('AudioContext state changed', { state: sharedAudioContext?.state });
    };
  }
  return sharedAudioContext;
}

export async function resumeAudioContext() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
      logger.info('Resumed AudioContext');
    } catch (err) {
      logger.error('Failed to resume AudioContext', { error: err });
    }
  }
}

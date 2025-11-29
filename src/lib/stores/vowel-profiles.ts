import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { VowelDefinition } from '$lib/vowel-plotter';

export type VowelProfile = {
  id: string;
  name: string;
  vowels: VowelDefinition[];
  createdAt: number;
};

const STORAGE_KEY = 'phono_coffer_vowel_profiles';

function createVowelProfilesStore() {
  const { subscribe, set, update } = writable<VowelProfile[]>([]);

  if (browser) {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        set(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse stored vowel profiles', e);
      }
    }
  }

  return {
    subscribe,
    add: (profile: Omit<VowelProfile, 'id' | 'createdAt'>) => {
      update((profiles) => {
        const newProfile: VowelProfile = {
          ...profile,
          id: crypto.randomUUID(),
          createdAt: Date.now()
        };
        const updated = [...profiles, newProfile];
        if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    remove: (id: string) => {
      update((profiles) => {
        const updated = profiles.filter((p) => p.id !== id);
        if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    update: (id: string, changes: Partial<VowelProfile>) => {
      update((profiles) => {
        const updated = profiles.map((p) => (p.id === id ? { ...p, ...changes } : p));
        if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    importProfile: (jsonString: string) => {
      try {
        const profile = JSON.parse(jsonString) as VowelProfile;
        // Basic validation
        if (!profile.name || !Array.isArray(profile.vowels)) {
          throw new Error('Invalid profile format');
        }
        // Ensure unique ID
        profile.id = crypto.randomUUID();
        profile.createdAt = Date.now();

        update((profiles) => {
          const updated = [...profiles, profile];
          if (browser) localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          return updated;
        });
        return true;
      } catch (e) {
        console.error('Import failed', e);
        return false;
      }
    }
  };
}

export const vowelProfiles = createVowelProfilesStore();

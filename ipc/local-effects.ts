export interface EffectStatus {
  supported: boolean;
  folder?: string;
  revision?: string;
}
export interface LocalItemEffects {
  status(): Promise<EffectStatus>;
  chooseFolder(): Promise<EffectStatus>;
  resource(revision: string, name: string): Promise<Uint8Array | null>;
  frame(revision: string, id: string): Promise<Uint8Array | null>;
  saveFrame(revision: string, id: string, png: Uint8Array): Promise<void>;
}
declare global {
  interface Window { localItemEffects?: LocalItemEffects }
}

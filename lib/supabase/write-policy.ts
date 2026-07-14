import { same } from './rows'

export type SaveMode='immediate'|'debounced'

export function saveModeForChangedFields<T extends object>(before:T|undefined,after:T,buffered:ReadonlySet<keyof T>):SaveMode{
  if(!before)return'immediate'
  const keys=new Set<keyof T>([...Object.keys(before),...Object.keys(after)] as (keyof T)[]),changed=Array.from(keys).filter(key=>!same(before[key],after[key]))
  return changed.length&&changed.every(key=>buffered.has(key))?'debounced':'immediate'
}

export function saveModeForPatch<T extends object>(patch:Partial<T>,buffered:ReadonlySet<keyof T>):SaveMode{return Object.keys(patch).every(key=>buffered.has(key as keyof T))?'debounced':'immediate'}

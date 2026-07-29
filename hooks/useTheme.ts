'use client'

import { useCallback, useEffect, useState } from 'react'

export type ThemePreference='system'|'light'|'dark'

const STORAGE_KEY='tempo-theme'
const isThemePreference=(value:string|null):value is ThemePreference=>value==='system'||value==='light'||value==='dark'
const storedPreference=():ThemePreference=>{if(typeof window==='undefined')return'system';const value=window.localStorage.getItem(STORAGE_KEY);return isThemePreference(value)?value:'system'}
const resolvedTheme=(preference:ThemePreference)=>preference==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):preference

export function useTheme(){
  const [preference,setPreferenceState]=useState<ThemePreference>(storedPreference)
  const apply=useCallback((next:ThemePreference)=>{const root=document.documentElement,theme=resolvedTheme(next);root.dataset.theme=theme;root.dataset.themePreference=next;root.style.colorScheme=theme},[])
  useEffect(()=>{apply(preference);const media=window.matchMedia('(prefers-color-scheme: dark)'),onSystemChange=()=>{if(preference==='system')apply('system')},onStorage=(event:StorageEvent)=>{if(event.key!==STORAGE_KEY)return;const next=isThemePreference(event.newValue)?event.newValue:'system';setPreferenceState(next)};media.addEventListener('change',onSystemChange);window.addEventListener('storage',onStorage);return()=>{media.removeEventListener('change',onSystemChange);window.removeEventListener('storage',onStorage)}},[apply,preference])
  const setPreference=useCallback((next:ThemePreference)=>{window.localStorage.setItem(STORAGE_KEY,next);setPreferenceState(next);apply(next)},[apply])
  return{preference,setPreference}
}

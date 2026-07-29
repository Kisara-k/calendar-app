import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Tempo',
  description: 'A calm weekly planning and reflection workspace.'
}

const themeBoot=`(()=>{try{const k='tempo-theme',v=localStorage.getItem(k),p=v==='light'||v==='dark'||v==='system'?v:'system',t=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p,r=document.documentElement;r.dataset.theme=t;r.dataset.themePreference=p;r.style.colorScheme=t}catch{}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeBoot}}/></head><body>{children}</body></html>
}

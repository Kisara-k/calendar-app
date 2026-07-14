'use client'
import dynamic from 'next/dynamic'
import { AuthScreen } from '@/components/auth/AuthScreen'
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth'

const CalendarApp = dynamic(
  () => import('@/components/calendar/CalendarApp').then(m => ({ default: m.CalendarApp })),
  { ssr: false }
)

export default function Home() {
  const auth=useSupabaseAuth()
  if(!auth.configured||auth.loading||!auth.user||auth.recovering)return <AuthScreen configured={auth.configured} loading={auth.loading} error={auth.error} recovery={auth.recovering} onSignIn={auth.signIn} onSignUp={auth.signUp} onForgot={auth.requestPasswordReset} onUpdatePassword={auth.updatePassword}/>
  return <CalendarApp user={auth.user} onSignOut={auth.signOut}/>
}

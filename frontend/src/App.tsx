import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { useAuth } from '@/features/auth/useAuth'
import { SignInPage } from '@/features/auth/SignInPage'
import { SignUpPage } from '@/features/auth/SignUpPage'
import { BookingPage } from '@/features/booking/BookingPage'
import { ConfirmationPage } from '@/features/booking/ConfirmationPage'
import { SuccessPage } from '@/features/booking/SuccessPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { GoogleConnectPage } from '@/features/google/GoogleConnectPage'
import { OAuthCallbackPage } from '@/features/google/OAuthCallbackPage'
import { NotFoundPage } from '@/features/NotFoundPage'
import { SchedulePage } from '@/features/schedule/SchedulePage'

function LandingRedirect() {
  const { isAuthenticated } = useAuth()
  return <Navigate to={isAuthenticated ? '/dashboard' : '/signup'} replace />
}

/** Marketing shortcut: /nikolay -> /book/nikolay */
function LegacyBookingRedirect() {
  const { slug } = useParams<{ slug: string }>()
  return <Navigate to={`/book/${slug}`} replace />
}

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingRedirect />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/signin" element={<SignInPage />} />

      <Route path="/dashboard" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/schedule" element={<Protected><SchedulePage /></Protected>} />
      <Route path="/google" element={<Protected><GoogleConnectPage /></Protected>} />
      <Route path="/oauth/callback" element={<Protected><OAuthCallbackPage /></Protected>} />

      <Route path="/book/:slug" element={<BookingPage />} />
      <Route path="/book/:slug/confirm" element={<ConfirmationPage />} />
      <Route path="/book/:slug/success/:bookingId" element={<SuccessPage />} />

      <Route path="/:slug" element={<LegacyBookingRedirect />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

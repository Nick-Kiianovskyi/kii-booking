import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page-container flex min-h-dvh flex-col justify-center">
          <Alert tone="error">Something went wrong. Please try again.</Alert>
          <Button className="mt-4" onClick={() => window.location.assign('/')}>
            Reload page
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

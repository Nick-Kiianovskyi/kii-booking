import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function NotFoundPage() {
  return (
    <div className="page-container flex min-h-dvh items-center">
      <Card className="w-full text-center">
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="mt-2 text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-muted">The page you are looking for does not exist.</p>
        <Button asChild className="mt-6">
          <Link to="/">Go home</Link>
        </Button>
      </Card>
    </div>
  )
}
